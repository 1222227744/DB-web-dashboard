import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { getDatabaseIDFromParams, resolveOwnedDatabase } from '../services/databaseResolver.js';
import { recordAuditLog } from '../services/auditService.js';
import { quoteIdentifier, validateSqlIdentifier } from '../utils/sqlIdentifier.js';
import { sendSuccess } from '../utils/response.js';

type DatabaseParams = {
  databaseId?: string;
};

type TableParams = DatabaseParams & {
  tableName?: string;
};

type TableStatsQuery = {
  sampleLimit?: string;
  topN?: string;
};

type OwnedDatabaseRow = {
  id: number;
  display_name: string;
  schema_name: string;
};

type TableMetaRow = {
  table_name: string;
  table_type: 'BASE TABLE' | 'VIEW';
  table_rows: number | null;
  data_length: number | null;
  index_length: number | null;
};

type IndexCountRow = {
  total: number;
};

type AuditTrendRow = {
  day: string | Date;
  total: number;
};

type AuditLogRow = {
  id: number;
  trace_id: string;
  database_id: number | null;
  object_type: string;
  object_name: string | null;
  action_type: string;
  summary: string;
  success: number | boolean;
  error_code: string | null;
  created_at: Date;
};

type ColumnMetaRow = {
  column_name: string;
  ordinal_position: number;
  data_type: string;
  column_type: string;
  column_key: string;
  is_nullable: 'YES' | 'NO';
};

type ConstraintRow = {
  constraint_name: string;
  constraint_type: string;
  column_name: string | null;
  referenced_table_name: string | null;
  referenced_column_name: string | null;
};

type IndexRow = {
  index_name: string;
  non_unique: number;
  seq_in_index: number;
  column_name: string;
};

type NullRatioRow = {
  total: number;
  null_count: number;
};

type NumericStatRow = {
  min_value: number | string | null;
  max_value: number | string | null;
  avg_value: number | string | null;
};

type CategoryTopRow = {
  value: string | number | boolean | Date | Buffer | null;
  total: number;
};

const defaultSampleLimit = 1000;
const maxSampleLimit = Math.min(limits.maxQueryRows, 5000);
const defaultTopN = 8;
const maxTopN = 20;
const numericDataTypes = new Set(['tinyint', 'smallint', 'mediumint', 'int', 'bigint', 'decimal', 'float', 'double']);
const categoricalDataTypes = new Set(['char', 'varchar', 'enum', 'set', 'date', 'time', 'datetime', 'timestamp', 'tinyint', 'smallint', 'int', 'bigint']);

export const getUserStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const startedAt = Date.now();

  try {
    const userID = getCurrentUserID(req);
    const databases = await listOwnedDatabases(userID);
    const schemaNames = databases.map((database) => database.schema_name);
    const tableRows = schemaNames.length > 0 ? await readTableRows(schemaNames) : [];
    const indexCount = schemaNames.length > 0 ? await readIndexCount(schemaNames) : 0;
    const operationTrend = await readOperationTrend(userID);
    const recentOperations = await readRecentOperations(userID, null, 8);
    const distribution = databases.map((database) => {
      const rows = tableRows.filter((table) => table.table_schema === database.schema_name);
      const tableCount = rows.filter((table) => table.table_type === 'BASE TABLE').length;
      const viewCount = rows.filter((table) => table.table_type === 'VIEW').length;
      const rowCountEstimated = sumNumbers(rows.filter((table) => table.table_type === 'BASE TABLE').map((table) => table.table_rows));
      const storageBytes = sumNumbers(rows.map((table) => Number(table.data_length ?? 0) + Number(table.index_length ?? 0)));

      return {
        databaseId: Number(database.id),
        displayName: database.display_name,
        tableCount,
        viewCount,
        rowCountEstimated,
        storageBytes
      };
    });

    const data = {
      summary: {
        databaseCount: databases.length,
        tableCount: sumNumbers(distribution.map((item) => item.tableCount)),
        viewCount: sumNumbers(distribution.map((item) => item.viewCount)),
        indexCount,
        rowCountEstimated: sumNumbers(distribution.map((item) => item.rowCountEstimated)),
        storageBytes: sumNumbers(distribution.map((item) => item.storageBytes))
      },
      operationTrend,
      databaseDistribution: distribution,
      recentOperations
    };

    await recordAuditLog({
      req,
      userID,
      objectType: 'STATS',
      actionType: 'STATS_VIEW',
      summary: '查看用户级统计',
      detail: {
        scope: 'user'
      },
      durationMs: Date.now() - startedAt
    });
    sendSuccess(res, 'success', data);
  } catch (error) {
    next(error);
  }
};

export const getDatabaseStats = async (
  req: Request<DatabaseParams>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startedAt = Date.now();

  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const tableRows = await readTableRows([database.schemaName]);
    const indexCount = await readIndexCount([database.schemaName]);
    const recentOperations = await readRecentOperations(userID, databaseID, 8);
    const baseTableRows = tableRows.filter((table) => table.table_type === 'BASE TABLE');
    const tableSizeTop = baseTableRows
      .map((table) => ({
        tableName: table.table_name,
        rowCountEstimated: Number(table.table_rows ?? 0),
        dataBytes: Number(table.data_length ?? 0),
        indexBytes: Number(table.index_length ?? 0),
        storageBytes: Number(table.data_length ?? 0) + Number(table.index_length ?? 0)
      }))
      .sort((left, right) => right.storageBytes - left.storageBytes)
      .slice(0, 8);

    const data = {
      databaseId: database.id,
      displayName: database.displayName,
      summary: {
        tableCount: baseTableRows.length,
        viewCount: tableRows.filter((table) => table.table_type === 'VIEW').length,
        indexCount,
        dataBytes: sumNumbers(tableRows.map((table) => table.data_length)),
        indexBytes: sumNumbers(tableRows.map((table) => table.index_length))
      },
      tableSizeTop,
      rowCountBuckets: buildRowCountBuckets(baseTableRows),
      recentOperations
    };

    await recordAuditLog({
      req,
      userID,
      databaseID,
      objectType: 'STATS',
      objectName: database.displayName,
      actionType: 'STATS_VIEW',
      summary: '查看数据库级统计',
      detail: {
        scope: 'database',
        databaseId: databaseID
      },
      durationMs: Date.now() - startedAt
    });
    sendSuccess(res, 'success', data);
  } catch (error) {
    next(error);
  }
};

export const getTableStats = async (
  req: Request<TableParams, unknown, unknown, TableStatsQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const startedAt = Date.now();

  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const tableName = validateSqlIdentifier(req.params.tableName, '表名');
    const sampleLimit = parseOptionalInteger(req.query.sampleLimit, 'sampleLimit', 1, maxSampleLimit, defaultSampleLimit);
    const topN = parseOptionalInteger(req.query.topN, 'topN', 1, maxTopN, defaultTopN);
    const tableMeta = await readTableMeta(database.schemaName, tableName);

    if (!tableMeta) {
      throw new AppError({
        httpStatus: 404,
        type: 'RESOURCE_NOT_FOUND',
        code: 'TABLE_NOT_FOUND',
        message: '数据表不存在'
      });
    }

    const columns = await readColumns(database.schemaName, tableName);
    const constraints = await readConstraints(database.schemaName, tableName);
    const indexes = await readIndexes(database.schemaName, tableName);
    const qualifiedTable = `${quoteIdentifier(database.schemaName)}.${quoteIdentifier(tableName)}`;
    const statColumns = columns.slice(0, 24);
    const nullRatios = await Promise.all(statColumns.map((column) => readNullRatio(qualifiedTable, column.column_name, sampleLimit)));
    const numericStats = await Promise.all(
      columns
        .filter((column) => numericDataTypes.has(column.data_type.toLowerCase()))
        .slice(0, 8)
        .map((column) => readNumericStats(qualifiedTable, column.column_name, sampleLimit))
    );
    const categoryTopN = await Promise.all(
      columns
        .filter((column) => categoricalDataTypes.has(column.data_type.toLowerCase()))
        .slice(0, 6)
        .map((column) => readCategoryTopN(qualifiedTable, column.column_name, sampleLimit, topN))
    );

    const data = {
      databaseId: database.id,
      tableName,
      summary: {
        columnCount: columns.length,
        rowCountEstimated: Number(tableMeta.table_rows ?? 0),
        dataBytes: Number(tableMeta.data_length ?? 0),
        indexBytes: Number(tableMeta.index_length ?? 0),
        sampleLimit
      },
      primaryKeys: columns.filter((column) => column.column_key === 'PRI').map((column) => column.column_name),
      foreignKeys: constraints.filter((constraint) => constraint.constraint_type === 'FOREIGN KEY').map(rowToForeignKey),
      indexes: groupIndexes(indexes),
      nullRatios,
      numericStats,
      categoryTopN
    };

    await recordAuditLog({
      req,
      userID,
      databaseID,
      objectType: 'STATS',
      objectName: tableName,
      actionType: 'STATS_VIEW',
      summary: '查看表级统计',
      detail: {
        scope: 'table',
        tableName,
        sampleLimit,
        topN
      },
      durationMs: Date.now() - startedAt
    });
    sendSuccess(res, 'success', data);
  } catch (error) {
    next(error);
  }
};

const listOwnedDatabases = async (userID: number): Promise<OwnedDatabaseRow[]> => {
  const [rows] = await pool.query(
    `SELECT id, display_name, schema_name
     FROM user_databases
     WHERE user_id = ? AND status = 'active'
     ORDER BY created_at DESC, id DESC`,
    [userID]
  );

  return rows as OwnedDatabaseRow[];
};

const readTableRows = async (schemaNames: string[]): Promise<Array<TableMetaRow & { table_schema: string }>> => {
  const placeholders = buildPlaceholders(schemaNames);
  const [rows] = await pool.query(
    `SELECT TABLE_SCHEMA AS table_schema,
            TABLE_NAME AS table_name,
            TABLE_TYPE AS table_type,
            TABLE_ROWS AS table_rows,
            DATA_LENGTH AS data_length,
            INDEX_LENGTH AS index_length
     FROM information_schema.tables
     WHERE TABLE_SCHEMA IN (${placeholders})`,
    schemaNames
  );

  return rows as Array<TableMetaRow & { table_schema: string }>;
};

const readIndexCount = async (schemaNames: string[]): Promise<number> => {
  const placeholders = buildPlaceholders(schemaNames);
  const [rows] = await pool.query(
    `SELECT COUNT(DISTINCT CONCAT(TABLE_SCHEMA, '.', TABLE_NAME, '.', INDEX_NAME)) AS total
     FROM information_schema.statistics
     WHERE TABLE_SCHEMA IN (${placeholders})`,
    schemaNames
  );

  return Number((rows as IndexCountRow[])[0]?.total ?? 0);
};

const readOperationTrend = async (userID: number) => {
  const [rows] = await pool.query(
    `SELECT DATE(created_at) AS day, COUNT(*) AS total
     FROM audit_logs
     WHERE user_id = ?
       AND created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
     GROUP BY DATE(created_at)
     ORDER BY day ASC`,
    [userID]
  );
  const rowMap = new Map((rows as AuditTrendRow[]).map((row) => [formatDateKey(row.day), Number(row.total)]));

  return lastNDays(7).map((day) => ({
    day,
    total: rowMap.get(day) ?? 0
  }));
};

const readRecentOperations = async (userID: number, databaseID: number | null, limit: number) => {
  const databaseCondition = databaseID ? 'AND database_id = ?' : '';
  const params = databaseID ? [userID, databaseID, limit] : [userID, limit];
  const [rows] = await pool.query(
    `SELECT id,
            trace_id,
            database_id,
            object_type,
            object_name,
            action_type,
            summary,
            success,
            error_code,
            created_at
     FROM audit_logs
     WHERE user_id = ? ${databaseCondition}
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    params
  );

  return (rows as AuditLogRow[]).map(rowToAuditSummary);
};

const readTableMeta = async (schemaName: string, tableName: string): Promise<TableMetaRow | null> => {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME AS table_name,
            TABLE_TYPE AS table_type,
            TABLE_ROWS AS table_rows,
            DATA_LENGTH AS data_length,
            INDEX_LENGTH AS index_length
     FROM information_schema.tables
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     LIMIT 1`,
    [schemaName, tableName]
  );

  return (rows as TableMetaRow[])[0] ?? null;
};

const readColumns = async (schemaName: string, tableName: string): Promise<ColumnMetaRow[]> => {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME AS column_name,
            ORDINAL_POSITION AS ordinal_position,
            DATA_TYPE AS data_type,
            COLUMN_TYPE AS column_type,
            COLUMN_KEY AS column_key,
            IS_NULLABLE AS is_nullable
     FROM information_schema.columns
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [schemaName, tableName]
  );

  return rows as ColumnMetaRow[];
};

const readConstraints = async (schemaName: string, tableName: string): Promise<ConstraintRow[]> => {
  const [rows] = await pool.query(
    `SELECT tc.CONSTRAINT_NAME AS constraint_name,
            tc.CONSTRAINT_TYPE AS constraint_type,
            kcu.COLUMN_NAME AS column_name,
            kcu.REFERENCED_TABLE_NAME AS referenced_table_name,
            kcu.REFERENCED_COLUMN_NAME AS referenced_column_name
     FROM information_schema.table_constraints tc
     LEFT JOIN information_schema.key_column_usage kcu
       ON kcu.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      AND kcu.TABLE_NAME = tc.TABLE_NAME
      AND kcu.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
     WHERE tc.TABLE_SCHEMA = ? AND tc.TABLE_NAME = ?
     ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION`,
    [schemaName, tableName]
  );

  return rows as ConstraintRow[];
};

const readIndexes = async (schemaName: string, tableName: string): Promise<IndexRow[]> => {
  const [rows] = await pool.query(
    `SELECT INDEX_NAME AS index_name,
            NON_UNIQUE AS non_unique,
            SEQ_IN_INDEX AS seq_in_index,
            COLUMN_NAME AS column_name
     FROM information_schema.statistics
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY INDEX_NAME, SEQ_IN_INDEX`,
    [schemaName, tableName]
  );

  return rows as IndexRow[];
};

const readNullRatio = async (qualifiedTable: string, columnName: string, sampleLimit: number) => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN ${quoteIdentifier(columnName)} IS NULL THEN 1 ELSE 0 END) AS null_count
     FROM (
       SELECT ${quoteIdentifier(columnName)}
       FROM ${qualifiedTable}
       LIMIT ?
     ) sampled`,
    [sampleLimit]
  );
  const row = (rows as NullRatioRow[])[0];
  const total = Number(row?.total ?? 0);
  const nullCount = Number(row?.null_count ?? 0);

  return {
    column: columnName,
    total,
    nullCount,
    ratio: total > 0 ? nullCount / total : 0
  };
};

const readNumericStats = async (qualifiedTable: string, columnName: string, sampleLimit: number) => {
  const [rows] = await pool.query(
    `SELECT MIN(${quoteIdentifier(columnName)}) AS min_value,
            MAX(${quoteIdentifier(columnName)}) AS max_value,
            AVG(${quoteIdentifier(columnName)}) AS avg_value
     FROM (
       SELECT ${quoteIdentifier(columnName)}
       FROM ${qualifiedTable}
       WHERE ${quoteIdentifier(columnName)} IS NOT NULL
       LIMIT ?
     ) sampled`,
    [sampleLimit]
  );
  const row = (rows as NumericStatRow[])[0];

  return {
    column: columnName,
    min: normalizeNumber(row?.min_value),
    max: normalizeNumber(row?.max_value),
    avg: normalizeNumber(row?.avg_value)
  };
};

const readCategoryTopN = async (qualifiedTable: string, columnName: string, sampleLimit: number, topN: number) => {
  const [rows] = await pool.query(
    `SELECT ${quoteIdentifier(columnName)} AS value,
            COUNT(*) AS total
     FROM (
       SELECT ${quoteIdentifier(columnName)}
       FROM ${qualifiedTable}
       WHERE ${quoteIdentifier(columnName)} IS NOT NULL
       LIMIT ?
     ) sampled
     GROUP BY ${quoteIdentifier(columnName)}
     ORDER BY total DESC, ${quoteIdentifier(columnName)} ASC
     LIMIT ?`,
    [sampleLimit, topN]
  );

  return {
    column: columnName,
    items: (rows as CategoryTopRow[]).map((row) => ({
      value: normalizeStatValue(row.value),
      total: Number(row.total)
    }))
  };
};

const rowToForeignKey = (row: ConstraintRow) => ({
  name: row.constraint_name,
  column: row.column_name,
  referencedTable: row.referenced_table_name,
  referencedColumn: row.referenced_column_name
});

const groupIndexes = (rows: IndexRow[]) => {
  const map = new Map<string, { name: string; unique: boolean; columns: string[] }>();

  rows.forEach((row) => {
    const item = map.get(row.index_name) ?? {
      name: row.index_name,
      unique: Number(row.non_unique) === 0,
      columns: []
    };
    item.columns.push(row.column_name);
    map.set(row.index_name, item);
  });

  return [...map.values()];
};

const buildRowCountBuckets = (rows: TableMetaRow[]) => {
  const buckets = [
    { label: '0', min: 0, max: 0, total: 0 },
    { label: '1-100', min: 1, max: 100, total: 0 },
    { label: '101-1k', min: 101, max: 1000, total: 0 },
    { label: '1k-1w', min: 1001, max: 10000, total: 0 },
    { label: '1w+', min: 10001, max: Number.POSITIVE_INFINITY, total: 0 }
  ];

  rows.forEach((row) => {
    const count = Number(row.table_rows ?? 0);
    const bucket = buckets.find((item) => count >= item.min && count <= item.max);
    if (bucket) {
      bucket.total += 1;
    }
  });

  return buckets.map(({ label, total }) => ({ label, total }));
};

const rowToAuditSummary = (row: AuditLogRow) => ({
  id: Number(row.id),
  traceId: row.trace_id,
  databaseId: row.database_id === null ? null : Number(row.database_id),
  objectType: row.object_type,
  objectName: row.object_name,
  actionType: row.action_type,
  summary: row.summary,
  success: Boolean(row.success),
  errorCode: row.error_code,
  createdAt: row.created_at.toISOString()
});

const buildPlaceholders = (values: unknown[]) => {
  if (values.length === 0) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'VALIDATION_FIELD_INVALID',
      message: '查询条件不能为空'
    });
  }

  return values.map(() => '?').join(', ');
};

const sumNumbers = (values: Array<number | null | undefined>) => {
  return values.reduce<number>((total, value) => total + Number(value ?? 0), 0);
};

const lastNDays = (count: number) => {
  const today = new Date();

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - 1 - index));
    return formatDateKey(date);
  });
};

const formatDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString().slice(0, 10);
};

const normalizeNumber = (value: number | string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : null;
};

const normalizeStatValue = (value: string | number | boolean | Date | Buffer | null): string | number | boolean | null => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return value;
};

const parseOptionalInteger = (value: string | undefined, fieldName: string, min: number, max: number, fallback: number): number => {
  if (value === undefined || value === '') {
    return fallback;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'VALIDATION_FIELD_INVALID',
      message: `${fieldName} 必须是 ${min} 到 ${max} 之间的整数`
    });
  }

  return numberValue;
};

const getCurrentUserID = (req: Request): number => {
  if (!req.user) {
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_TOKEN_MISSING',
      message: '请先登录'
    });
  }

  return req.user.userID;
};
