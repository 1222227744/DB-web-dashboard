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
  table_count: number;
  size_bytes: number;
  created_at: Date;
  updated_at: Date;
};

type CreateDatabaseBody = {
  name?: unknown;
};

type RenameDatabaseBody = {
  name?: unknown;
};

type DeleteDatabaseParams = {
  databaseID?: string;
};

type UserDatabase = {
  id: number;
  name: string;
  tableCount: number;
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
      `SELECT id, display_name, schema_name, table_count, size_bytes, created_at, updated_at
       FROM user_databases
       WHERE user_id = ? AND status = 'active'
       ORDER BY created_at DESC, id DESC`,
      [userID]
    );

    const databases = (rows as DatabaseRow[]).map(rowToDatabase).map(toPublicDatabase);
    sendSuccess(res, 'success', {
      databases,
      total: databases.length,
      limit: limits.maxDatabasesPerUser
    });
  } catch (error) {
    next(error);
  }
};

export const createDatabase = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const displayName = validateDisplayName((req.body as CreateDatabaseBody).name);
    await ensureDatabaseQuota(userID);
    await ensureDisplayNameAvailable(userID, displayName);

    const schemaName = createSchemaName(userID, displayName);
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
    } catch (error) {
      await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(schemaName)}`);
      throw error;
    }
  } catch (error) {
    next(error);
  }
};

export const deleteDatabase = async (req: Request<DeleteDatabaseParams>, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = parseDatabaseID(req.params.databaseID);
    const database = await findDatabaseByID(userID, databaseID);

    if (!database) {
      throw new AppError({
        httpStatus: 404,
        type: 'RESOURCE_NOT_FOUND',
        code: 'DATABASE_NOT_FOUND',
        message: '数据库不存在'
      });
    }

    await pool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database.schemaName)}`);
    await pool.query(
      `UPDATE user_databases
       SET display_name = ?,
           status = 'deleted',
           deleted_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND status = 'active'`,
      [`${database.name}__deleted__${databaseID}`, databaseID, userID]
    );

    sendSuccess(res, '数据库已删除', {
      databaseID
    });
  } catch (error) {
    next(error);
  }
};

export const renameDatabase = async (
  req: Request<DeleteDatabaseParams, unknown, RenameDatabaseBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = parseDatabaseID(req.params.databaseID);
    const displayName = validateDisplayName(req.body.name);
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
    `SELECT id, display_name, schema_name, table_count, size_bytes, created_at, updated_at
     FROM user_databases
     WHERE id = ? AND user_id = ? AND status = 'active'
     LIMIT 1`,
    [databaseID, userID]
  );
  const databaseRows = rows as DatabaseRow[];
  const database = databaseRows[0];
  return database ? rowToDatabase(database) : null;
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

  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message: '请填写数据库名称'
  });
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
  id: row.id,
  name: row.display_name,
  schemaName: row.schema_name,
  tableCount: row.table_count,
  sizeBytes: row.size_bytes,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString()
});

const toPublicDatabase = (database: OwnedDatabase): UserDatabase => ({
  id: database.id,
  name: database.name,
  tableCount: database.tableCount,
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
