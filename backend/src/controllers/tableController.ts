import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { getDatabaseIDFromParams, resolveOwnedDatabase } from '../services/databaseResolver.js';
import { quoteIdentifier, validateSqlIdentifier } from '../utils/sqlIdentifier.js';
import { sendSuccess } from '../utils/response.js';

type DatabaseParams = {
  databaseId?: string;
};

type TableParams = DatabaseParams & {
  tableName?: string;
};

type TablePreviewQuery = {
  limit?: string;
  offset?: string;
  filters?: string;
};

type TablePreviewFilter = {
  column?: unknown;
  value?: unknown;
  mode?: unknown;
};

type ObjectListQuery = {
  objectType?: string;
};

type CreateColumnBody = {
  name?: unknown;
  type?: unknown;
  length?: unknown;
  precision?: unknown;
  scale?: unknown;
  unsigned?: unknown;
  nullable?: unknown;
  defaultValue?: unknown;
  autoIncrement?: unknown;
  comment?: unknown;
};

type CreateConstraintBody = {
  name?: unknown;
  type?: unknown;
  columns?: unknown;
};

type CreateIndexColumnBody = {
  name?: unknown;
  order?: unknown;
};

type CreateIndexBody = {
  name?: unknown;
  unique?: unknown;
  columns?: unknown;
};

type CreateTableBody = {
  tableName?: unknown;
  columns?: unknown;
  constraints?: unknown;
  indexes?: unknown;
};

type CreateRowBody = {
  row?: unknown;
};

type UpdateRowBody = {
  primaryKey?: unknown;
  set?: unknown;
};

type DeleteRowBody = {
  primaryKey?: unknown;
};

type DeleteTableBody = {
  confirmation?: {
    confirmed?: unknown;
    confirmText?: unknown;
  };
};

type TableObjectRow = {
  table_name: string;
  table_type: 'BASE TABLE' | 'VIEW';
  table_rows: number | null;
  data_length: number | null;
  index_length: number | null;
  create_time: Date | null;
};

type ColumnSchemaRow = {
  column_name: string;
  ordinal_position: number;
  column_type: string;
  data_type: string;
  character_maximum_length: number | null;
  numeric_precision: number | null;
  numeric_scale: number | null;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
  extra: string;
  column_key: string;
  column_comment: string;
};

type IndexSchemaRow = {
  index_name: string;
  non_unique: number;
  seq_in_index: number;
  column_name: string;
  collation: 'A' | 'D' | null;
};

type ConstraintSchemaRow = {
  constraint_name: string;
  constraint_type: string;
  column_name: string | null;
  ordinal_position: number;
};

type TableCountRow = {
  total: number;
};

type InsertResult = {
  insertId?: number;
  affectedRows?: number;
};

type ResultHeader = {
  affectedRows?: number;
};

type DistinctValueRow = {
  value: string | number | boolean | Date | Buffer | null;
};

type NormalizedColumn = {
  name: string;
  type: SupportedColumnType;
  length?: number;
  precision?: number;
  scale?: number;
  unsigned: boolean;
  nullable: boolean;
  defaultValue?: string | number | boolean | null;
  autoIncrement: boolean;
  comment?: string;
};

type NormalizedConstraint = {
  name: string;
  type: 'PRIMARY_KEY' | 'UNIQUE';
  columns: string[];
};

type NormalizedIndex = {
  name: string;
  unique: boolean;
  columns: Array<{
    name: string;
    order: 'ASC' | 'DESC';
  }>;
};

type SupportedColumnType =
  | 'TINYINT'
  | 'SMALLINT'
  | 'INT'
  | 'BIGINT'
  | 'DECIMAL'
  | 'FLOAT'
  | 'DOUBLE'
  | 'CHAR'
  | 'VARCHAR'
  | 'TEXT'
  | 'MEDIUMTEXT'
  | 'LONGTEXT'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'TIMESTAMP'
  | 'BOOLEAN'
  | 'JSON'
  | 'BLOB'
  | 'MEDIUMBLOB'
  | 'LONGBLOB';

const supportedColumnTypes = new Set<SupportedColumnType>([
  'TINYINT',
  'SMALLINT',
  'INT',
  'BIGINT',
  'DECIMAL',
  'FLOAT',
  'DOUBLE',
  'CHAR',
  'VARCHAR',
  'TEXT',
  'MEDIUMTEXT',
  'LONGTEXT',
  'DATE',
  'TIME',
  'DATETIME',
  'TIMESTAMP',
  'BOOLEAN',
  'JSON',
  'BLOB',
  'MEDIUMBLOB',
  'LONGBLOB'
]);

const integerTypes = new Set<SupportedColumnType>(['TINYINT', 'SMALLINT', 'INT', 'BIGINT']);
const numericTypes = new Set<SupportedColumnType>(['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE']);
const lengthTypes = new Set<SupportedColumnType>(['CHAR', 'VARCHAR']);
const textTypes = new Set<SupportedColumnType>(['TEXT', 'MEDIUMTEXT', 'LONGTEXT', 'JSON', 'BLOB', 'MEDIUMBLOB', 'LONGBLOB']);
const dateTypes = new Set<SupportedColumnType>(['DATE', 'TIME', 'DATETIME', 'TIMESTAMP']);

export const listDatabaseObjects = async (
  req: Request<DatabaseParams, unknown, unknown, ObjectListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const objectType = normalizeObjectType(req.query.objectType);
    const tableTypeCondition = objectType ? 'AND table_type = ?' : '';
    const params = objectType
      ? [database.schemaName, objectType === 'table' ? 'BASE TABLE' : 'VIEW']
      : [database.schemaName];

    const [rows] = await pool.query(
      `SELECT TABLE_NAME AS \`table_name\`,
              TABLE_TYPE AS \`table_type\`,
              TABLE_ROWS AS \`table_rows\`,
              DATA_LENGTH AS \`data_length\`,
              INDEX_LENGTH AS \`index_length\`,
              CREATE_TIME AS \`create_time\`
       FROM information_schema.tables
       WHERE table_schema = ? ${tableTypeCondition}
       ORDER BY table_type, table_name`,
      params
    );

    sendSuccess(res, 'success', {
      items: (rows as TableObjectRow[]).map(rowToObjectItem),
      total: (rows as TableObjectRow[]).length
    });
  } catch (error) {
    next(error);
  }
};

export const createTable = async (
  req: Request<DatabaseParams, unknown, CreateTableBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const tableName = validateSqlIdentifier(req.body.tableName, '表名');
    const columns = normalizeColumns(req.body.columns);
    const constraints = normalizeConstraints(req.body.constraints);
    const indexes = normalizeIndexes(req.body.indexes);
    const columnNames = new Set(columns.map((column) => column.name));

    ensureColumnsExist(columnNames, constraints.flatMap((constraint) => constraint.columns));
    ensureColumnsExist(columnNames, indexes.flatMap((index) => index.columns.map((column) => column.name)));
    ensureCreateTableRules(columns, constraints, indexes);
    await ensureTableQuota(database.schemaName);
    await ensureTableNameAvailable(database.schemaName, tableName);

    const columnSql = columns.map(buildColumnSql);
    const constraintSql = constraints.map(buildConstraintSql);
    const indexSql = indexes.map(buildIndexSql);
    const createTableSql = [
      `CREATE TABLE ${quoteIdentifier(database.schemaName)}.${quoteIdentifier(tableName)} (`,
      [...columnSql, ...constraintSql, ...indexSql].map((item) => `  ${item}`).join(',\n'),
      ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci'
    ].join('\n');

    await pool.query(createTableSql);

    const schema = await readTableSchema(database.schemaName, tableName);
    sendSuccess(res, '表已创建', schema);
  } catch (error) {
    next(convertMysqlError(error, '表创建失败'));
  }
};

export const getTableSchema = async (
  req: Request<TableParams>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const tableName = validateSqlIdentifier(req.params.tableName, '表名');
    await ensureTableExists(database.schemaName, tableName);
    const schema = await readTableSchema(database.schemaName, tableName);
    sendSuccess(res, 'success', schema);
  } catch (error) {
    next(error);
  }
};

export const previewTableRows = async (
  req: Request<TableParams, unknown, unknown, TablePreviewQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const tableName = validateSqlIdentifier(req.params.tableName, '表名');
    await ensureTableExists(database.schemaName, tableName);

    const schema = await readTableSchema(database.schemaName, tableName);
    const limit = parseOptionalInteger(req.query.limit, '预览行数', 1, limits.maxPageSize, 20);
    const offset = parseOptionalInteger(req.query.offset, '预览偏移量', 0, limits.maxQueryRows, 0);
    const filters = normalizePreviewFilters(req.query.filters, schema.columns);
    const whereClause = buildPreviewWhereClause(filters);
    const qualifiedTableName = `${quoteIdentifier(database.schemaName)}.${quoteIdentifier(tableName)}`;

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM ${qualifiedTableName}${whereClause.sql}`,
      whereClause.values
    );
    const total = Number((countRows as TableCountRow[])[0]?.total ?? 0);
    const [rowItems] = await pool.query(
      `SELECT * FROM ${qualifiedTableName}${whereClause.sql} LIMIT ? OFFSET ?`,
      [...whereClause.values, limit, offset]
    );
    const facets = await readPreviewFacets(database.schemaName, tableName, schema.columns);

    sendSuccess(res, 'success', {
      tableName,
      columns: schema.columns,
      rows: (rowItems as Array<Record<string, unknown>>).map(normalizePreviewRow),
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
      facets
    });
  } catch (error) {
    next(error);
  }
};

export const createTableRow = async (
  req: Request<TableParams, unknown, CreateRowBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const context = await getOwnedTableContext(req);
    const values = normalizeRowInput(req.body.row, context.schema.columns, {
      allowMissing: true,
      allowEmpty: false
    });

    await ensureTableWriteCapacity(context.schemaName, context.tableName);

    const columns = Object.keys(values);
    const sql = [
      `INSERT INTO ${context.qualifiedTableName}`,
      `(${columns.map(quoteIdentifier).join(', ')})`,
      `VALUES (${columns.map(() => '?').join(', ')})`
    ].join(' ');
    const [result] = await pool.query(sql, columns.map((column) => values[column]));
    const insertedPrimaryKey = buildInsertedPrimaryKey(context.schema.columns, values, result as InsertResult);
    const row = insertedPrimaryKey
      ? await readSingleRowByPrimaryKey(context.qualifiedTableName, insertedPrimaryKey)
      : null;

    sendSuccess(res, '行已新增', {
      tableName: context.tableName,
      row,
      primaryKey: insertedPrimaryKey
    });
  } catch (error) {
    next(convertMysqlError(error, '新增行失败'));
  }
};

export const updateTableRow = async (
  req: Request<TableParams, unknown, UpdateRowBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const context = await getOwnedTableContext(req);
    const primaryKey = normalizePrimaryKeyInput(req.body.primaryKey, context.schema.columns);
    const values = normalizeRowInput(req.body.set, context.schema.columns, {
      allowMissing: true,
      allowEmpty: false,
      forbiddenColumns: new Set(Object.keys(primaryKey))
    });
    await ensureTableWriteCapacity(context.schemaName, context.tableName);

    const setColumns = Object.keys(values);
    const whereClause = buildPrimaryKeyWhereClause(primaryKey);
    const [result] = await pool.query(
      `UPDATE ${context.qualifiedTableName}
       SET ${setColumns.map((column) => `${quoteIdentifier(column)} = ?`).join(', ')}
       ${whereClause.sql}`,
      [...setColumns.map((column) => values[column]), ...whereClause.values]
    );
    const affectedRows = Number((result as ResultHeader).affectedRows ?? 0);

    if (affectedRows !== 1) {
      throw new AppError({
        httpStatus: 409,
        type: 'RESOURCE_CONFLICT',
        code: 'ROW_UPDATE_NOT_UNIQUE',
        message: '更新目标不存在或不唯一，请刷新后重试'
      });
    }

    sendSuccess(res, '行已更新', {
      tableName: context.tableName,
      row: await readSingleRowByPrimaryKey(context.qualifiedTableName, primaryKey),
      primaryKey
    });
  } catch (error) {
    next(convertMysqlError(error, '更新行失败'));
  }
};

export const deleteTableRow = async (
  req: Request<TableParams, unknown, DeleteRowBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const context = await getOwnedTableContext(req);
    const primaryKey = normalizePrimaryKeyInput(req.body.primaryKey, context.schema.columns);
    const whereClause = buildPrimaryKeyWhereClause(primaryKey);
    const [result] = await pool.query(
      `DELETE FROM ${context.qualifiedTableName} ${whereClause.sql}`,
      whereClause.values
    );
    const affectedRows = Number((result as ResultHeader).affectedRows ?? 0);

    if (affectedRows !== 1) {
      throw new AppError({
        httpStatus: 409,
        type: 'RESOURCE_CONFLICT',
        code: 'ROW_DELETE_NOT_UNIQUE',
        message: '删除目标不存在或不唯一，请刷新后重试'
      });
    }

    sendSuccess(res, '行已删除', {
      tableName: context.tableName,
      primaryKey
    });
  } catch (error) {
    next(convertMysqlError(error, '删除行失败'));
  }
};

export const deleteTable = async (
  req: Request<TableParams, unknown, DeleteTableBody>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const databaseID = getDatabaseIDFromParams(req.params);
    const database = await resolveOwnedDatabase(userID, databaseID);
    const tableName = validateSqlIdentifier(req.params.tableName, '表名');

    await ensureTableExists(database.schemaName, tableName);
    validateDeleteConfirmation(req.body.confirmation, tableName);
    await pool.query(`DROP TABLE ${quoteIdentifier(database.schemaName)}.${quoteIdentifier(tableName)}`);

    sendSuccess(res, '表已删除', {
      tableName
    });
  } catch (error) {
    next(convertMysqlError(error, '表删除失败'));
  }
};

const normalizeObjectType = (value: string | undefined): 'table' | 'view' | undefined => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value !== 'table' && value !== 'view') {
    throwValidationError('对象类型仅支持 table 或 view');
  }

  return value as 'table' | 'view';
};

const normalizeColumns = (value: unknown): NormalizedColumn[] => {
  if (!Array.isArray(value)) {
    throwValidationError('请至少添加一个字段');
  }

  const items = value as unknown[];

  if (items.length < 1) {
    throwValidationError('请至少添加一个字段');
  }

  if (items.length > limits.maxColumnsPerTable) {
    throwValidationError(`单表最多只能创建 ${limits.maxColumnsPerTable} 个字段`);
  }

  const seenNames = new Set<string>();

  return items.map((item, index) => {
    const body = asRecord<CreateColumnBody>(item, `第 ${index + 1} 个字段定义格式不正确`);
    const name = validateSqlIdentifier(body.name, `第 ${index + 1} 个字段名`);

    if (seenNames.has(name)) {
      throwValidationError(`字段 ${name} 重复`);
    }

    seenNames.add(name);
    const type = normalizeColumnType(body.type);
    const column: NormalizedColumn = {
      name,
      type,
      unsigned: body.unsigned === true,
      nullable: body.nullable === true,
      autoIncrement: body.autoIncrement === true
    };

    if (body.length !== undefined) {
      column.length = parseInteger(body.length, `${name} 长度`, 1, type === 'CHAR' ? 255 : 16383);
    }

    if (body.precision !== undefined) {
      column.precision = parseInteger(body.precision, `${name} 精度`, 1, 65);
    }

    if (body.scale !== undefined) {
      column.scale = parseInteger(body.scale, `${name} 小数位`, 0, column.precision ?? 30);
    }

    if ('defaultValue' in body) {
      const defaultValue = normalizeDefaultValue(body.defaultValue);
      if (defaultValue !== undefined) {
        column.defaultValue = defaultValue;
      }
    }

    if (typeof body.comment === 'string' && body.comment.trim()) {
      column.comment = body.comment.trim().slice(0, 255);
    }

    validateColumnOptions(column);
    return column;
  });
};

const normalizeColumnType = (value: unknown): SupportedColumnType => {
  if (typeof value !== 'string') {
    throwValidationError('字段类型不能为空');
  }

  const type = (value as string).trim().toUpperCase() as SupportedColumnType;

  if (!supportedColumnTypes.has(type)) {
    throwValidationError('当前字段类型暂不支持');
  }

  return type;
};

const normalizeDefaultValue = (value: unknown): string | number | boolean | null | undefined => {
  if (value === undefined || value === '') {
    return undefined;
  }

  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  throwValidationError('默认值只支持字符串、数字、布尔值或 null');
};

const validateColumnOptions = (column: NormalizedColumn): void => {
  if (column.unsigned && !numericTypes.has(column.type)) {
    throwValidationError(`${column.name} 只有数值类型可以设置 unsigned`);
  }

  if (column.autoIncrement && !integerTypes.has(column.type)) {
    throwValidationError(`${column.name} 只有整数类型可以自增`);
  }

  if (column.autoIncrement && column.nullable) {
    throwValidationError(`${column.name} 自增字段不能允许为空`);
  }

  if (lengthTypes.has(column.type)) {
    if (!column.length) {
      column.length = column.type === 'CHAR' ? 36 : 255;
    }
  } else if (column.length !== undefined) {
    throwValidationError(`${column.name} 的字段类型不支持长度`);
  }

  if (column.type === 'DECIMAL') {
    column.precision ??= 12;
    column.scale ??= 2;

    if (column.scale > column.precision) {
      throwValidationError(`${column.name} 的小数位不能大于精度`);
    }
  } else if (column.precision !== undefined || column.scale !== undefined) {
    throwValidationError(`${column.name} 的字段类型不支持精度`);
  }

  if (column.autoIncrement && column.defaultValue !== undefined) {
    throwValidationError(`${column.name} 自增字段不能设置默认值`);
  }

  if (column.defaultValue !== undefined && textTypes.has(column.type)) {
    throwValidationError(`${column.name} 的字段类型不支持默认值`);
  }
};

const normalizeConstraints = (value: unknown): NormalizedConstraint[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throwValidationError('约束定义格式不正确');
  }

  const items = value as unknown[];
  const names = new Set<string>();

  return items.map((item, index) => {
    const body = asRecord<CreateConstraintBody>(item, `第 ${index + 1} 个约束定义格式不正确`);
    const type = normalizeConstraintType(body.type);
    const name = type === 'PRIMARY_KEY'
      ? 'PRIMARY'
      : validateSqlIdentifier(body.name, `第 ${index + 1} 个约束名`);
    const columns = normalizeColumnNameArray(body.columns, `第 ${index + 1} 个约束字段`);

    if (names.has(name)) {
      throwValidationError(`约束 ${name} 重复`);
    }

    names.add(name);

    return {
      name,
      type,
      columns
    };
  });
};

const normalizeConstraintType = (value: unknown): 'PRIMARY_KEY' | 'UNIQUE' => {
  if (value !== 'PRIMARY_KEY' && value !== 'UNIQUE') {
    throwValidationError('当前版本创建表时仅支持主键和唯一约束');
  }

  return value as 'PRIMARY_KEY' | 'UNIQUE';
};

const normalizeIndexes = (value: unknown): NormalizedIndex[] => {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throwValidationError('索引定义格式不正确');
  }

  const items = value as unknown[];

  if (items.length > limits.maxIndexesPerTable) {
    throwValidationError(`单表最多只能创建 ${limits.maxIndexesPerTable} 个索引`);
  }

  const names = new Set<string>();

  return items.map((item, index) => {
    const body = asRecord<CreateIndexBody>(item, `第 ${index + 1} 个索引定义格式不正确`);
    const name = validateSqlIdentifier(body.name, `第 ${index + 1} 个索引名`);

    if (names.has(name)) {
      throwValidationError(`索引 ${name} 重复`);
    }

    names.add(name);

    if (!Array.isArray(body.columns)) {
      throwValidationError(`${name} 至少需要一个索引字段`);
    }

    const indexColumns = body.columns as unknown[];

    if (indexColumns.length < 1) {
      throwValidationError(`${name} 至少需要一个索引字段`);
    }

    return {
      name,
      unique: body.unique === true,
      columns: indexColumns.map((columnItem, columnIndex) => {
        const column = asRecord<CreateIndexColumnBody>(columnItem, `${name} 第 ${columnIndex + 1} 个索引字段格式不正确`);
        const order = column.order === 'DESC' ? 'DESC' : 'ASC';
        return {
          name: validateSqlIdentifier(column.name, `${name} 第 ${columnIndex + 1} 个索引字段`),
          order
        };
      })
    };
  });
};

const normalizeColumnNameArray = (value: unknown, label: string): string[] => {
  if (!Array.isArray(value)) {
    throwValidationError(`${label}不能为空`);
  }

  const items = value as unknown[];

  if (items.length < 1) {
    throwValidationError(`${label}不能为空`);
  }

  return items.map((item, index) => validateSqlIdentifier(item, `${label} ${index + 1}`));
};

const ensureCreateTableRules = (
  columns: NormalizedColumn[],
  constraints: NormalizedConstraint[],
  indexes: NormalizedIndex[]
): void => {
  const primaryKeys = constraints.filter((constraint) => constraint.type === 'PRIMARY_KEY');

  if (primaryKeys.length > 1) {
    throwValidationError('创建表最多只能设置一个主键');
  }

  const primaryKeyColumns = new Set(primaryKeys[0]?.columns ?? []);

  columns.forEach((column) => {
    if (primaryKeyColumns.has(column.name) && column.nullable) {
      throwValidationError(`${column.name} 是主键字段，不能允许为空`);
    }

    if (column.autoIncrement && !primaryKeyColumns.has(column.name)) {
      throwValidationError(`${column.name} 自增字段必须属于主键`);
    }
  });

  const indexAndConstraintNames = new Set<string>();

  constraints.forEach((constraint) => indexAndConstraintNames.add(constraint.name));
  indexes.forEach((index) => {
    if (indexAndConstraintNames.has(index.name)) {
      throwValidationError(`索引或约束 ${index.name} 重复`);
    }

    indexAndConstraintNames.add(index.name);
  });
};

const ensureColumnsExist = (columnNames: Set<string>, usedColumns: string[]): void => {
  usedColumns.forEach((name) => {
    if (!columnNames.has(name)) {
      throwValidationError(`字段 ${name} 不存在`);
    }
  });
};

const ensureTableQuota = async (schemaName: string): Promise<void> => {
  const [rows] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.tables
     WHERE table_schema = ? AND table_type = 'BASE TABLE'`,
    [schemaName]
  );
  const total = Number((rows as Array<{ total: number }>)[0]?.total ?? 0);

  if (total >= limits.maxTablesPerDatabase) {
    throw new AppError({
      httpStatus: 409,
      type: 'RESOURCE_CONFLICT',
      code: 'TABLE_QUOTA_EXCEEDED',
      message: `单个数据库最多只能创建 ${limits.maxTablesPerDatabase} 张表`
    });
  }
};

const ensureTableNameAvailable = async (schemaName: string, tableName: string): Promise<void> => {
  const [rows] = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?
     LIMIT 1`,
    [schemaName, tableName]
  );

  if ((rows as Array<{ table_name: string }>).length > 0) {
    throw new AppError({
      httpStatus: 409,
      type: 'RESOURCE_CONFLICT',
      code: 'TABLE_NAME_EXISTS',
      message: '表名已存在'
    });
  }
};

const ensureTableExists = async (schemaName: string, tableName: string): Promise<void> => {
  const [rows] = await pool.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ? AND table_type = 'BASE TABLE'
     LIMIT 1`,
    [schemaName, tableName]
  );

  if ((rows as Array<{ table_name: string }>).length === 0) {
    throw new AppError({
      httpStatus: 404,
      type: 'RESOURCE_NOT_FOUND',
      code: 'TABLE_NOT_FOUND',
      message: '表不存在'
    });
  }
};

const getOwnedTableContext = async (req: Request<TableParams>) => {
  const userID = getCurrentUserID(req);
  const databaseID = getDatabaseIDFromParams(req.params);
  const database = await resolveOwnedDatabase(userID, databaseID);
  const tableName = validateSqlIdentifier(req.params.tableName, '表名');
  await ensureTableExists(database.schemaName, tableName);
  const schema = await readTableSchema(database.schemaName, tableName);

  return {
    schemaName: database.schemaName,
    tableName,
    qualifiedTableName: `${quoteIdentifier(database.schemaName)}.${quoteIdentifier(tableName)}`,
    schema
  };
};

const ensureTableWriteCapacity = async (schemaName: string, tableName: string): Promise<void> => {
  const [rows] = await pool.query(
    `SELECT COALESCE(data_length + index_length, 0) AS total
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?
     LIMIT 1`,
    [schemaName, tableName]
  );
  const total = Number((rows as Array<{ total: number }>)[0]?.total ?? 0);

  if (total >= limits.maxTableStorageBytes) {
    throw new AppError({
      httpStatus: 409,
      type: 'RESOURCE_CONFLICT',
      code: 'TABLE_STORAGE_LIMIT_EXCEEDED',
      message: `单表容量不能超过 ${Math.floor(limits.maxTableStorageBytes / 1024 / 1024)} MB`
    });
  }
};

const normalizeRowInput = (
  value: unknown,
  columns: Array<{ name: string; dataType: string; nullable: boolean; extra: string }>,
  options: {
    allowMissing: boolean;
    allowEmpty: boolean;
    forbiddenColumns?: Set<string>;
  }
): Record<string, unknown> => {
  const body = asRecord<Record<string, unknown>>(value, '行数据格式不正确');
  const columnMap = new Map(columns.map((column) => [column.name, column]));
  const values: Record<string, unknown> = {};

  Object.entries(body).forEach(([name, rawValue]) => {
    if (!columnMap.has(name)) {
      throwValidationError(`字段 ${name} 不存在`);
    }

    if (options.forbiddenColumns?.has(name)) {
      throwValidationError(`字段 ${name} 不允许在本次操作中修改`);
    }

    values[name] = normalizeRowValue(rawValue, columnMap.get(name)!);
  });

  if (!options.allowMissing) {
    columns.forEach((column) => {
      if (!(column.name in values)) {
        throwValidationError(`字段 ${column.name} 缺少值`);
      }
    });
  }

  if (!options.allowEmpty && Object.keys(values).length === 0) {
    throwValidationError('请至少提交一个字段');
  }

  return values;
};

const normalizeRowValue = (
  value: unknown,
  column: { name: string; dataType: string; nullable: boolean }
): unknown => {
  if (value === null) {
    if (!column.nullable) {
      throwValidationError(`字段 ${column.name} 不允许为空`);
    }

    return null;
  }

  if (column.dataType === 'JSON') {
    if (typeof value === 'string') {
      try {
        JSON.parse(value);
      } catch {
        throwValidationError(`字段 ${column.name} 不是合法 JSON`);
      }
      return value;
    }

    return JSON.stringify(value);
  }

  if (['TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'DECIMAL', 'FLOAT', 'DOUBLE'].includes(column.dataType)) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throwValidationError(`字段 ${column.name} 必须是数字`);
    }
    return numberValue;
  }

  if (column.dataType === 'BOOLEAN') {
    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    const text = String(value).trim().toLowerCase();
    if (['1', 'true', '是', 'yes'].includes(text)) {
      return 1;
    }
    if (['0', 'false', '否', 'no'].includes(text)) {
      return 0;
    }
    throwValidationError(`字段 ${column.name} 必须是布尔值`);
  }

  return value;
};

const normalizePrimaryKeyInput = (
  value: unknown,
  columns: Array<{ name: string; dataType: string; key: string; nullable: boolean }>
): Record<string, unknown> => {
  const primaryColumns = columns.filter((column) => column.key === 'PRI');

  if (primaryColumns.length === 0) {
    throw new AppError({
      httpStatus: 409,
      type: 'RESOURCE_CONFLICT',
      code: 'PRIMARY_KEY_REQUIRED',
      message: '当前表没有主键，暂不支持行级修改或删除'
    });
  }

  const body = asRecord<Record<string, unknown>>(value, '主键格式不正确');
  const primaryKey: Record<string, unknown> = {};

  primaryColumns.forEach((column) => {
    if (!(column.name in body)) {
      throwValidationError(`主键字段 ${column.name} 缺少值`);
    }

    primaryKey[column.name] = normalizeRowValue(body[column.name], column);
  });

  return primaryKey;
};

const buildPrimaryKeyWhereClause = (primaryKey: Record<string, unknown>) => ({
  sql: `WHERE ${Object.keys(primaryKey).map((name) => `${quoteIdentifier(name)} <=> ?`).join(' AND ')}`,
  values: Object.values(primaryKey)
});

const buildInsertedPrimaryKey = (
  columns: Array<{ name: string; key: string; extra: string }>,
  values: Record<string, unknown>,
  result: InsertResult
): Record<string, unknown> | null => {
  const primaryColumns = columns.filter((column) => column.key === 'PRI');

  if (primaryColumns.length === 0) {
    return null;
  }

  const primaryKey: Record<string, unknown> = {};

  primaryColumns.forEach((column) => {
    if (column.name in values) {
      primaryKey[column.name] = values[column.name];
    } else if (column.extra.includes('auto_increment') && result.insertId !== undefined) {
      primaryKey[column.name] = result.insertId;
    }
  });

  return Object.keys(primaryKey).length === primaryColumns.length ? primaryKey : null;
};

const readSingleRowByPrimaryKey = async (
  qualifiedTableName: string,
  primaryKey: Record<string, unknown>
): Promise<Record<string, unknown> | null> => {
  const whereClause = buildPrimaryKeyWhereClause(primaryKey);
  const [rows] = await pool.query(
    `SELECT * FROM ${qualifiedTableName} ${whereClause.sql} LIMIT 1`,
    whereClause.values
  );
  const items = rows as Array<Record<string, unknown>>;

  return items[0] ? normalizePreviewRow(items[0]) : null;
};

const normalizePreviewFilters = (
  value: string | undefined,
  columns: Array<{ name: string; dataType: string }>
): Array<{ column: string; value: string; mode: 'equals' | 'contains' }> => {
  if (value === undefined || value.trim() === '') {
    return [];
  }

  if (value.length > 4096) {
    throwValidationError('筛选条件过长');
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throwValidationError('筛选条件格式不正确');
  }

  if (!Array.isArray(parsed)) {
    throwValidationError('筛选条件格式不正确');
  }

  const columnMap = new Map(columns.map((column) => [column.name, column]));

  const filterItems = parsed as unknown[];

  if (filterItems.length > columnMap.size) {
    throwValidationError('筛选字段数量过多');
  }

  return filterItems.map((item, index): { column: string; value: string; mode: 'equals' | 'contains' } => {
    const filter = asRecord<TablePreviewFilter>(item, `第 ${index + 1} 个筛选条件格式不正确`);
    const rawColumnValue = filter.column;

    if (typeof rawColumnValue !== 'string' || !columnMap.has(rawColumnValue)) {
      throwValidationError(`第 ${index + 1} 个筛选字段不存在`);
    }

    const columnValue = rawColumnValue as string;
    const filterValue = String(filter.value ?? '').trim();

    if (filterValue === '') {
      throwValidationError(`第 ${index + 1} 个筛选值不能为空`);
    }

    return {
      column: columnValue,
      value: filterValue,
      mode: filter.mode === 'equals' ? 'equals' : 'contains'
    };
  });
};

const buildPreviewWhereClause = (filters: Array<{ column: string; value: string; mode: 'equals' | 'contains' }>) => {
  if (filters.length === 0) {
    return {
      sql: '',
      values: [] as string[]
    };
  }

  return {
    sql: ` WHERE ${filters
      .map((filter) => `${quoteIdentifier(filter.column)} ${filter.mode === 'equals' ? '= ?' : 'LIKE ?'}`)
      .join(' AND ')}`,
    values: filters.map((filter) => filter.mode === 'equals' ? filter.value : `%${filter.value}%`)
  };
};

const readPreviewFacets = async (
  schemaName: string,
  tableName: string,
  columns: Array<{ name: string; dataType: string }>
) => {
  const facets: Record<string, Array<string | number | boolean | null>> = {};
  const facetColumns = columns.filter((column) => shouldReadFacetValues(column.dataType));

  await Promise.all(facetColumns.map(async (column) => {
    const [rows] = await pool.query(
      `SELECT DISTINCT ${quoteIdentifier(column.name)} AS value
       FROM ${quoteIdentifier(schemaName)}.${quoteIdentifier(tableName)}
       WHERE ${quoteIdentifier(column.name)} IS NOT NULL
       ORDER BY ${quoteIdentifier(column.name)}
       LIMIT 21`
    );
    const values = (rows as DistinctValueRow[]).map((row) => normalizePreviewValue(row.value));

    if (values.length > 0 && values.length <= 20) {
      facets[column.name] = values;
    }
  }));

  return facets;
};

const shouldReadFacetValues = (dataType: string): boolean => {
  return ['BOOLEAN', 'TINYINT', 'SMALLINT', 'INT', 'BIGINT', 'CHAR', 'VARCHAR', 'DATE', 'TIME', 'DATETIME', 'TIMESTAMP'].includes(dataType);
};

const normalizePreviewValue = (value: string | number | boolean | Date | Buffer | null): string | number | boolean | null => {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('utf8');
  }

  return value;
};

const normalizePreviewRow = (row: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date
        ? value.toISOString()
        : Buffer.isBuffer(value)
          ? value.toString('utf8')
          : value
    ])
  );
};

const buildColumnSql = (column: NormalizedColumn): string => {
  const parts = [quoteIdentifier(column.name), buildColumnTypeSql(column)];

  if (column.unsigned && numericTypes.has(column.type)) {
    parts.push('UNSIGNED');
  }

  parts.push(column.nullable ? 'NULL' : 'NOT NULL');

  if (column.defaultValue !== undefined) {
    parts.push(`DEFAULT ${buildDefaultValueSql(column)}`);
  }

  if (column.autoIncrement) {
    parts.push('AUTO_INCREMENT');
  }

  if (column.comment) {
    parts.push(`COMMENT ${pool.escape(column.comment)}`);
  }

  return parts.join(' ');
};

const buildColumnTypeSql = (column: NormalizedColumn): string => {
  if (lengthTypes.has(column.type)) {
    return `${column.type}(${column.length})`;
  }

  if (column.type === 'DECIMAL') {
    return `DECIMAL(${column.precision},${column.scale})`;
  }

  if (column.type === 'BOOLEAN') {
    return 'TINYINT(1)';
  }

  return column.type;
};

const buildDefaultValueSql = (column: NormalizedColumn): string => {
  const defaultValue = column.defaultValue;

  if (defaultValue === undefined) {
    throwValidationError(`${column.name} 默认值不能为空`);
  }

  if (defaultValue === null) {
    return 'NULL';
  }

  if (typeof defaultValue === 'boolean') {
    return defaultValue ? '1' : '0';
  }

  if (typeof defaultValue === 'number') {
    if (!Number.isFinite(defaultValue)) {
      throwValidationError(`${column.name} 默认值不是有效数字`);
    }

    return String(defaultValue);
  }

  if (typeof defaultValue === 'string') {
    const upperValue = defaultValue.toUpperCase();

    if (dateTypes.has(column.type) && ['CURRENT_TIMESTAMP', 'CURRENT_DATE', 'CURRENT_TIME'].includes(upperValue)) {
      return upperValue;
    }

    return pool.escape(defaultValue);
  }

  return throwValidationError(`${column.name} 默认值类型不正确`);
};

const buildConstraintSql = (constraint: NormalizedConstraint): string => {
  const columnsSql = constraint.columns.map(quoteIdentifier).join(', ');

  if (constraint.type === 'PRIMARY_KEY') {
    return `PRIMARY KEY (${columnsSql})`;
  }

  return `CONSTRAINT ${quoteIdentifier(constraint.name)} UNIQUE (${columnsSql})`;
};

const buildIndexSql = (index: NormalizedIndex): string => {
  const columnsSql = index.columns
    .map((column) => `${quoteIdentifier(column.name)} ${column.order}`)
    .join(', ');
  const prefix = index.unique ? 'UNIQUE KEY' : 'KEY';

  return `${prefix} ${quoteIdentifier(index.name)} (${columnsSql})`;
};

const readTableSchema = async (schemaName: string, tableName: string) => {
  const [columnRows] = await pool.query(
    `SELECT COLUMN_NAME AS \`column_name\`,
            ORDINAL_POSITION AS \`ordinal_position\`,
            COLUMN_TYPE AS \`column_type\`,
            DATA_TYPE AS \`data_type\`,
            CHARACTER_MAXIMUM_LENGTH AS \`character_maximum_length\`,
            NUMERIC_PRECISION AS \`numeric_precision\`,
            NUMERIC_SCALE AS \`numeric_scale\`,
            IS_NULLABLE AS \`is_nullable\`,
            COLUMN_DEFAULT AS \`column_default\`,
            EXTRA AS \`extra\`,
            COLUMN_KEY AS \`column_key\`,
            COLUMN_COMMENT AS \`column_comment\`
     FROM information_schema.columns
     WHERE table_schema = ? AND table_name = ?
     ORDER BY ordinal_position`,
    [schemaName, tableName]
  );
  const [indexRows] = await pool.query(
    `SELECT INDEX_NAME AS \`index_name\`,
            NON_UNIQUE AS \`non_unique\`,
            SEQ_IN_INDEX AS \`seq_in_index\`,
            COLUMN_NAME AS \`column_name\`,
            COLLATION AS \`collation\`
     FROM information_schema.statistics
     WHERE table_schema = ? AND table_name = ?
     ORDER BY index_name, seq_in_index`,
    [schemaName, tableName]
  );
  const [constraintRows] = await pool.query(
    `SELECT tc.CONSTRAINT_NAME AS \`constraint_name\`,
            tc.CONSTRAINT_TYPE AS \`constraint_type\`,
            kcu.COLUMN_NAME AS \`column_name\`,
            kcu.ORDINAL_POSITION AS \`ordinal_position\`
     FROM information_schema.table_constraints tc
     LEFT JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_schema = tc.constraint_schema
      AND kcu.table_name = tc.table_name
      AND kcu.constraint_name = tc.constraint_name
     WHERE tc.constraint_schema = ? AND tc.table_name = ?
     ORDER BY tc.constraint_name, kcu.ordinal_position`,
    [schemaName, tableName]
  );

  return {
    tableName,
    columns: (columnRows as ColumnSchemaRow[]).map((column) => ({
      name: column.column_name,
      ordinalPosition: Number(column.ordinal_position),
      columnType: column.column_type,
      dataType: column.data_type.toUpperCase(),
      length: column.character_maximum_length === null ? null : Number(column.character_maximum_length),
      precision: column.numeric_precision === null ? null : Number(column.numeric_precision),
      scale: column.numeric_scale === null ? null : Number(column.numeric_scale),
      nullable: column.is_nullable === 'YES',
      defaultValue: column.column_default,
      extra: column.extra,
      key: column.column_key,
      comment: column.column_comment
    })),
    indexes: groupIndexes(indexRows as IndexSchemaRow[]),
    constraints: groupConstraints(constraintRows as ConstraintSchemaRow[])
  };
};

const groupIndexes = (rows: IndexSchemaRow[]) => {
  const indexes = new Map<string, {
    name: string;
    unique: boolean;
    columns: Array<{ name: string; order: 'ASC' | 'DESC' }>;
  }>();

  rows.forEach((row) => {
    const index = indexes.get(row.index_name) ?? {
      name: row.index_name,
      unique: Number(row.non_unique) === 0,
      columns: []
    };

    index.columns.push({
      name: row.column_name,
      order: row.collation === 'D' ? 'DESC' : 'ASC'
    });
    indexes.set(row.index_name, index);
  });

  return Array.from(indexes.values());
};

const groupConstraints = (rows: ConstraintSchemaRow[]) => {
  const constraints = new Map<string, {
    name: string;
    type: string;
    columns: string[];
  }>();

  rows.forEach((row) => {
    const constraint = constraints.get(row.constraint_name) ?? {
      name: row.constraint_name,
      type: row.constraint_type,
      columns: []
    };

    if (row.column_name) {
      constraint.columns.push(row.column_name);
    }

    constraints.set(row.constraint_name, constraint);
  });

  return Array.from(constraints.values());
};

const rowToObjectItem = (row: TableObjectRow) => ({
  objectType: row.table_type === 'VIEW' ? 'view' : 'table',
  name: row.table_name,
  rowCountEstimated: Number(row.table_rows ?? 0),
  dataLength: Number(row.data_length ?? 0),
  indexLength: Number(row.index_length ?? 0),
  createdAt: row.create_time?.toISOString() ?? null
});

const validateDeleteConfirmation = (confirmation: DeleteTableBody['confirmation'], tableName: string): void => {
  if (!confirmation || confirmation.confirmed !== true) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'CONFIRMATION_REQUIRED',
      message: '删除表需要二次确认'
    });
  }

  if (typeof confirmation.confirmText !== 'string' || confirmation.confirmText.trim() !== tableName) {
    throw new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'CONFIRMATION_TEXT_MISMATCH',
      message: '表名确认失败'
    });
  }
};

const parseInteger = (value: unknown, label: string, min: number, max: number): number => {
  const integer = Number(value);

  if (!Number.isInteger(integer) || integer < min || integer > max) {
    throwValidationError(`${label}必须是 ${min} 到 ${max} 之间的整数`);
  }

  return integer;
};

const parseOptionalInteger = (value: unknown, label: string, min: number, max: number, fallback: number): number => {
  if (value === undefined || value === '') {
    return fallback;
  }

  return parseInteger(value, label, min, max);
};

const asRecord = <T>(value: unknown, message: string): T => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throwValidationError(message);
  }

  return value as T;
};

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

const convertMysqlError = (error: unknown, fallback: string): unknown => {
  if (error instanceof AppError) {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'sqlMessage' in error) {
    const sqlMessage = String((error as { sqlMessage?: unknown }).sqlMessage ?? fallback);
    return new AppError({
      httpStatus: 400,
      type: 'VALIDATION_ERROR',
      code: 'MYSQL_EXECUTION_ERROR',
      message: `${fallback}：${sqlMessage}`
    });
  }

  return error;
};
