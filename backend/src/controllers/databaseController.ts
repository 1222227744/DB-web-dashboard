import { randomUUID } from 'node:crypto';
import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../utils/response.js';

type DatabaseRow = {
  id: number;
  display_name: string;
  schema_name: string;
  charset_name: string;
  collation_name: string;
  table_count: number;
  view_count: number;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
};

type CreateDatabaseBody = {
  displayName?: unknown;
  name?: unknown;
  charset?: unknown;
  collation?: unknown;
};

type RenameDatabaseBody = {
  displayName?: unknown;
  name?: unknown;
  charset?: unknown;
  collation?: unknown;
};

type DeleteDatabaseBody = {
  confirmation?: {
    confirmed?: unknown;
    confirmText?: unknown;
  };
};

type DatabaseParams = {
  databaseId?: string;
  databaseID?: string;
};

type UserDatabase = {
  id: number;
  displayName: string;
  charset: 'utf8mb4';
  collation: 'utf8mb4_unicode_ci';
  tableCount: number;
  viewCount: number;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

type OwnedDatabase = UserDatabase & {
  schemaName: string;
};

const displayNamePattern = /^[A-Za-z][A-Za-z0-9_]{1,31}$/;

export const listDatabases = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const [rows] = await pool.query(
      `SELECT d.id,
              d.display_name,
              d.schema_name,
              COALESCE(c.DEFAULT_CHARACTER_SET_NAME, 'utf8mb4') AS charset_name,
              COALESCE(c.DEFAULT_COLLATION_NAME, 'utf8mb4_unicode_ci') AS collation_name,
              COALESCE(s.table_count, 0) AS table_count,
              COALESCE(s.view_count, 0) AS view_count,
              COALESCE(s.size_bytes, 0) AS size_bytes,
              d.created_at,
              d.updated_at
       FROM user_databases d
       LEFT JOIN (
         SELECT table_schema,
                COALESCE(SUM(CASE WHEN table_type = 'BASE TABLE' THEN 1 ELSE 0 END), 0) AS table_count,
                COALESCE(SUM(CASE WHEN table_type = 'VIEW' THEN 1 ELSE 0 END), 0) AS view_count,
                COALESCE(SUM(data_length + index_length), 0) AS size_bytes
         FROM information_schema.tables
         WHERE table_schema IN (
           SELECT schema_name
           FROM user_databases
           WHERE user_id = ? AND status = 'active'
         )
         GROUP BY table_schema
       ) s ON s.table_schema = d.schema_name
       LEFT JOIN information_schema.schemata c ON c.SCHEMA_NAME = d.schema_name
       WHERE d.user_id = ? AND d.status = 'active'
       ORDER BY d.created_at DESC, d.id DESC`,
      [userID, userID]
    );

    const items = (rows as DatabaseRow[]).map(rowToDatabase).map(toPublicDatabase);
    sendSuccess(res, 'success', {
      items,
      total: items.length,
      limit: limits.maxDatabasesPerUser
    });
  } catch (error) {
    next(error);
  }
};

export const createDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const body = req.body as CreateDatabaseBody;
    const displayName = validateDisplayName(body.displayName ?? body.name);
    validateCharsetOptions(body.charset, body.collation);
    await ensureDatabaseQuota(userID);
    await ensureDisplayNameAvailable(userID, displayName);

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const schemaName = createSchemaName(userID, displayName);

      try {
        await pool.query(`CREATE DATABASE ${quoteIdentifier(schemaName)}
          DEFAULT CHARACTER SET utf8mb4
          DEFAULT COLLATE utf8mb4_unicode_ci`);

        try {
          const [result] = await pool.query(
            `INSERT INTO user_databases (user_id, display_name, schema_name)
             VALUES (?, ?, ?)`,
            [userID, displayName, schemaName]
          );
          const insertID = Number((result as { insertId?: number }).insertId);
          const database = await findDatabaseByID(userID, insertID);

          if (!database) {
            throw new AppError({
              httpStatus: 500,
              type: 'INTERNAL_ERROR',
              code: 'DATABASE_METADATA_MISSING',
              message: '数据库创建成功，但元数据读取失败'
            });
          }

          sendSuccess(res, '数据库已创建', {
            database: toPublicDatabase(database)
          });
          return;
        } catch (error) {
          await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(schemaName)}`);

          if (isDuplicateEntryError(error)) {
            throw new AppError({
              httpStatus: 409,
              type: 'RESOURCE_CONFLICT',
              code: 'DATABASE_NAME_EXISTS',
              message: '数据库名称已存在'
            });
          }

          throw error;
        }
      } catch (error) {
        if (isDatabaseExistsError(error) && attempt < 5) {
          continue;
        }

        throw error;
      }
    }

    throw new AppError({
      httpStatus: 500,
      type: 'INTERNAL_ERROR',
      code: 'DATABASE_SCHEMA_NAME_EXHAUSTED',
      message: '数据库名称生成失败，请稍后再试'
    });
  } catch (error) {
    next(error);
  }
};

export const renameDatabase = async (
  req: Request<DatabaseParams, unknown, RenameDatabaseBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = parseDatabaseID(req.params.databaseId ?? req.params.databaseID);
    const body = req.body;
    const displayName = validateDisplayName(body.displayName ?? body.name);
    validateCharsetOptions(body.charset, body.collation);
    const database = await findDatabaseByID(userID, databaseID);

    if (!database) {
      throw new AppError({
        httpStatus: 404,
        type: 'RESOURCE_NOT_FOUND',
        code: 'DATABASE_NOT_FOUND',
        message: '数据库不存在'
      });
    }

    await ensureDisplayNameAvailable(userID, displayName, databaseID);
    await pool.query(
      `UPDATE user_databases
       SET display_name = ?
       WHERE id = ? AND user_id = ? AND status = 'active'`,
      [displayName, databaseID, userID]
    );

    const updatedDatabase = await findDatabaseByID(userID, databaseID);
    sendSuccess(res, '数据库已重命名', {
      database: updatedDatabase ? toPublicDatabase(updatedDatabase) : null
    });
  } catch (error) {
    next(error);
  }
};

export const deleteDatabase = async (
  req: Request<DatabaseParams, unknown, DeleteDatabaseBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = parseDatabaseID(req.params.databaseId ?? req.params.databaseID);
    const database = await findDatabaseByID(userID, databaseID);

    if (!database) {
      throw new AppError({
        httpStatus: 404,
        type: 'RESOURCE_NOT_FOUND',
        code: 'DATABASE_NOT_FOUND',
        message: '数据库不存在'
      });
    }

    validateDeleteConfirmation(req.body.confirmation, database.displayName);
    await pool.query(
      `UPDATE user_databases
       SET status = 'deleting'
       WHERE id = ? AND user_id = ? AND status = 'active'`,
      [databaseID, userID]
    );

    let isSchemaDropped = false;

    try {
      await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database.schemaName)}`);
      isSchemaDropped = true;
      await pool.query(
        `UPDATE user_databases
         SET display_name = ?,
             status = 'deleted',
             deleted_at = CURRENT_TIMESTAMP
         WHERE id = ? AND user_id = ? AND status = 'deleting'`,
        [`${database.displayName}__deleted__${databaseID}`, databaseID, userID]
      );
    } catch (error) {
      if (!isSchemaDropped) {
        await pool.query(
          `UPDATE user_databases
           SET status = 'active'
           WHERE id = ? AND user_id = ? AND status = 'deleting'`,
          [databaseID, userID]
        );
      }

      throw error;
    }

    sendSuccess(res, '数据库已删除', {
      databaseID
    });
  } catch (error) {
    next(error);
  }
};

const ensureDatabaseQuota = async (userID: number): Promise<void> => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM user_databases
     WHERE user_id = ? AND status = 'active'`,
    [userID]
  );
  const total = Number((rows as Array<{ total: number }>)[0]?.total ?? 0);

  if (total >= limits.maxDatabasesPerUser) {
    throw new AppError({
      httpStatus: 409,
      type: 'RESOURCE_CONFLICT',
      code: 'DATABASE_QUOTA_EXCEEDED',
      message: `最多只能创建 ${limits.maxDatabasesPerUser} 个数据库`
    });
  }
};

const ensureDisplayNameAvailable = async (
  userID: number,
  displayName: string,
  ignoredDatabaseID?: number
): Promise<void> => {
  const ignoredCondition = ignoredDatabaseID ? 'AND id <> ?' : '';
  const params = ignoredDatabaseID
    ? [userID, displayName, ignoredDatabaseID]
    : [userID, displayName];
  const [rows] = await pool.query(
    `SELECT id
     FROM user_databases
     WHERE user_id = ? AND display_name = ? AND status = 'active' ${ignoredCondition}
     LIMIT 1`,
    params
  );

  if ((rows as Array<{ id: number }>).length > 0) {
    throw new AppError({
      httpStatus: 409,
      type: 'RESOURCE_CONFLICT',
      code: 'DATABASE_NAME_EXISTS',
      message: '数据库名称已存在'
    });
  }
};

const findDatabaseByID = async (userID: number, databaseID: number): Promise<OwnedDatabase | null> => {
  const [rows] = await pool.query(
    `SELECT d.id,
            d.display_name,
            d.schema_name,
            COALESCE(c.DEFAULT_CHARACTER_SET_NAME, 'utf8mb4') AS charset_name,
            COALESCE(c.DEFAULT_COLLATION_NAME, 'utf8mb4_unicode_ci') AS collation_name,
            COALESCE(s.table_count, 0) AS table_count,
            COALESCE(s.view_count, 0) AS view_count,
            COALESCE(s.size_bytes, 0) AS size_bytes,
            d.created_at,
            d.updated_at
     FROM user_databases d
     LEFT JOIN (
       SELECT table_schema,
              COALESCE(SUM(CASE WHEN table_type = 'BASE TABLE' THEN 1 ELSE 0 END), 0) AS table_count,
              COALESCE(SUM(CASE WHEN table_type = 'VIEW' THEN 1 ELSE 0 END), 0) AS view_count,
              COALESCE(SUM(data_length + index_length), 0) AS size_bytes
       FROM information_schema.tables
       WHERE table_schema = (
         SELECT schema_name
         FROM user_databases
         WHERE id = ? AND user_id = ? AND status = 'active'
       )
       GROUP BY table_schema
     ) s ON s.table_schema = d.schema_name
     LEFT JOIN information_schema.schemata c ON c.SCHEMA_NAME = d.schema_name
     WHERE d.id = ? AND d.user_id = ? AND d.status = 'active'
     LIMIT 1`,
    [databaseID, userID, databaseID, userID]
  );
  const databaseRows = rows as DatabaseRow[];
  const database = databaseRows[0];
  return database ? rowToDatabase(database) : null;
};

const validateCharsetOptions = (charset: unknown, collation: unknown): void => {
  if (charset !== undefined && charset !== 'utf8mb4') {
    throwValidationError('当前版本仅支持 utf8mb4 字符集');
  }

  if (collation !== undefined && collation !== 'utf8mb4_unicode_ci') {
    throwValidationError('当前版本仅支持 utf8mb4_unicode_ci 排序规则');
  }
};

const validateDisplayName = (value: unknown): string => {
  if (typeof value === 'string') {
    const displayName = value.trim();
    if (!displayName) {
      throwValidationError('请填写数据库名称');
    }

    if (!displayNamePattern.test(displayName)) {
      throwValidationError('数据库名称需以英文字母开头，只能包含英文字母、数字和下划线，长度为 2 到 32 位');
    }

    return displayName;
  }

  return throwValidationError('请填写数据库名称');
};

const validateDeleteConfirmation = (confirmation: DeleteDatabaseBody['confirmation'], databaseName: string): void => {
  if (!confirmation || confirmation.confirmed !== true) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'CONFIRMATION_REQUIRED',
      message: '删除数据库需要二次确认'
    });
  }

  if (typeof confirmation.confirmText !== 'string' || confirmation.confirmText.trim() !== databaseName) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'CONFIRMATION_TEXT_MISMATCH',
      message: '数据库名称确认失败'
    });
  }
};

const parseDatabaseID = (value: string | undefined): number => {
  const databaseID = Number(value);

  if (!Number.isInteger(databaseID) || databaseID <= 0) {
    throwValidationError('数据库 ID 不正确');
  }

  return databaseID;
};

const createSchemaName = (userID: number, displayName: string): string => {
  const suffix = randomUUID().replaceAll('-', '').slice(0, 10);
  return `u${userID}_${displayName.toLowerCase()}_${suffix}`;
};

const quoteIdentifier = (identifier: string): string => {
  return `\`${identifier.replaceAll('`', '``')}\``;
};

const rowToDatabase = (row: DatabaseRow): OwnedDatabase => ({
  id: Number(row.id),
  displayName: row.display_name,
  schemaName: row.schema_name,
  charset: 'utf8mb4',
  collation: 'utf8mb4_unicode_ci',
  tableCount: Number(row.table_count),
  viewCount: Number(row.view_count),
  sizeBytes: Number(row.size_bytes),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString()
});

const toPublicDatabase = (database: OwnedDatabase): UserDatabase => ({
  id: database.id,
  displayName: database.displayName,
  charset: database.charset,
  collation: database.collation,
  tableCount: database.tableCount,
  viewCount: database.viewCount,
  sizeBytes: database.sizeBytes,
  createdAt: database.createdAt,
  updatedAt: database.updatedAt
});

const getCurrentUserID = (req: Request): number => {
  if (!req.user) {
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_TOKEN_MISSING',
      message: '缺少登录凭证'
    });
  }

  return req.user.userID;
};

const throwValidationError = (message: string): never => {
  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message
  });
};

const getDatabaseErrorCode = (error: unknown): string | undefined => {
  return typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code?: unknown }).code)
    : undefined;
};

const isDuplicateEntryError = (error: unknown): boolean => {
  return getDatabaseErrorCode(error) === 'ER_DUP_ENTRY';
};

const isDatabaseExistsError = (error: unknown): boolean => {
  return getDatabaseErrorCode(error) === 'ER_DB_CREATE_EXISTS';
};
