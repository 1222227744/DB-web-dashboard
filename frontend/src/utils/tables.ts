import request from './request';

export type DatabaseObjectType = 'table' | 'view';

export type DatabaseObject = {
  objectType: DatabaseObjectType;
  name: string;
  rowCountEstimated: number;
  dataLength: number;
  indexLength: number;
  createdAt: string | null;
};

export type TableColumnInput = {
  name: string;
  type: string;
  length?: number;
  precision?: number;
  scale?: number;
  unsigned?: boolean;
  nullable: boolean;
  defaultValue?: string | number | boolean | null;
  autoIncrement?: boolean;
  comment?: string;
};

export type TableConstraintInput = {
  name?: string;
  type: 'PRIMARY_KEY' | 'UNIQUE' | 'FOREIGN_KEY' | 'CHECK_IN';
  columns: string[];
  column?: string;
  values?: Array<string | number | boolean>;
  referencedTable?: string;
  referencedColumns?: string[];
  onDelete?: 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
  onUpdate?: 'RESTRICT' | 'CASCADE' | 'SET NULL' | 'NO ACTION';
};

export type TableIndexInput = {
  name: string;
  unique: boolean;
  columns: Array<{
    name: string;
    order: 'ASC' | 'DESC';
  }>;
};

export type CreateTablePayload = {
  tableName: string;
  columns: TableColumnInput[];
  constraints: TableConstraintInput[];
  indexes?: TableIndexInput[];
};

export type TableColumnSchema = {
  name: string;
  ordinalPosition: number;
  columnType: string;
  dataType: string;
  length: number | null;
  precision: number | null;
  scale: number | null;
  nullable: boolean;
  defaultValue: string | null;
  extra: string;
  key: string;
  comment: string;
};

export type TableIndexSchema = {
  name: string;
  unique: boolean;
  columns: Array<{
    name: string;
    order: 'ASC' | 'DESC';
  }>;
};

export type TableConstraintSchema = {
  name: string;
  type: string;
  columns: string[];
  expression?: string | null;
};

export type TableSchema = {
  tableName: string;
  columns: TableColumnSchema[];
  indexes: TableIndexSchema[];
  constraints: TableConstraintSchema[];
};

export type TablePreviewFilter = {
  column: string;
  value: string;
  mode: 'equals' | 'contains';
};

export type TablePreviewSort = {
  orderBy: string;
  order: 'ASC' | 'DESC';
};

export type TablePreviewData = {
  tableName: string;
  columns: TableColumnSchema[];
  rows: Array<Record<string, unknown>>;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  facets: Record<string, Array<string | number | boolean | null>>;
};

export type TablePrimaryKey = Record<string, unknown>;

export type TableRowMutationData = {
  tableName: string;
  row: Record<string, unknown> | null;
  rows?: Array<Record<string, unknown> | null>;
  primaryKey: TablePrimaryKey | null;
  primaryKeys?: Array<TablePrimaryKey | null>;
  affectedRows?: number;
};

export type TableSchemaOperation =
  | { action: 'ADD_COLUMN'; column: TableColumnInput }
  | { action: 'MODIFY_COLUMN'; oldName: string; column: TableColumnInput }
  | { action: 'DROP_COLUMN'; name: string }
  | { action: 'ADD_INDEX'; index: TableIndexInput }
  | { action: 'DROP_INDEX'; name: string }
  | { action: 'ADD_CONSTRAINT'; constraint: TableConstraintInput }
  | { action: 'DROP_CONSTRAINT'; name: string };

export type MutationConfirmation = {
  confirmed: boolean;
  confirmText: string;
};

export type DatabaseObjectListData = {
  items: DatabaseObject[];
  total: number;
};

export const fetchDatabaseObjects = async (databaseID: number): Promise<DatabaseObjectListData> => {
  const res: any = await request.get(`/v1/databases/${databaseID}/objects`, {
    silentError: true
  });
  return res.data as DatabaseObjectListData;
};

export const createTable = async (databaseID: number, payload: CreateTablePayload): Promise<TableSchema> => {
  const res: any = await request.post(`/v1/databases/${databaseID}/tables`, payload, {
    silentError: true
  });
  return res.data as TableSchema;
};

export const fetchTableSchema = async (databaseID: number, tableName: string): Promise<TableSchema> => {
  const res: any = await request.get(`/v1/databases/${databaseID}/tables/${tableName}/schema`, {
    silentError: true
  });
  return res.data as TableSchema;
};

export const fetchTablePreview = async (
  databaseID: number,
  tableName: string,
  options: {
    limit: number;
    offset: number;
    filters: TablePreviewFilter[];
    sort?: TablePreviewSort | null;
  }
): Promise<TablePreviewData> => {
  const res: any = await request.get(`/v1/databases/${databaseID}/tables/${tableName}/preview`, {
    params: {
      limit: options.limit,
      offset: options.offset,
      filters: JSON.stringify(options.filters),
      orderBy: options.sort?.orderBy,
      order: options.sort?.order
    },
    silentError: true
  });
  return res.data as TablePreviewData;
};

export const updateTableSchema = async (
  databaseID: number,
  tableName: string,
  operations: TableSchemaOperation[],
  confirmation?: MutationConfirmation
): Promise<TableSchema> => {
  const res: any = await request.patch(`/v1/databases/${databaseID}/tables/${tableName}/schema`, {
    operations,
    confirmation
  }, {
    silentError: true
  });
  return res.data as TableSchema;
};

export const createTableRow = async (
  databaseID: number,
  tableName: string,
  row: Record<string, unknown> | Array<Record<string, unknown>>,
  confirmation?: MutationConfirmation
): Promise<TableRowMutationData> => {
  const res: any = await request.post(`/v1/databases/${databaseID}/tables/${tableName}/rows`, {
    [Array.isArray(row) ? 'rows' : 'row']: row,
    confirmation
  }, {
    silentError: true
  });
  return res.data as TableRowMutationData;
};

export const updateTableRow = async (
  databaseID: number,
  tableName: string,
  primaryKey: TablePrimaryKey | TablePrimaryKey[],
  set: Record<string, unknown>,
  confirmation?: MutationConfirmation
): Promise<TableRowMutationData> => {
  const res: any = await request.patch(`/v1/databases/${databaseID}/tables/${tableName}/rows`, {
    [Array.isArray(primaryKey) ? 'primaryKeys' : 'primaryKey']: primaryKey,
    set,
    confirmation
  }, {
    silentError: true
  });
  return res.data as TableRowMutationData;
};

export const deleteTableRow = async (
  databaseID: number,
  tableName: string,
  primaryKey: TablePrimaryKey | TablePrimaryKey[],
  confirmation?: MutationConfirmation
): Promise<void> => {
  await request.delete(`/v1/databases/${databaseID}/tables/${tableName}/rows`, {
    data: {
      [Array.isArray(primaryKey) ? 'primaryKeys' : 'primaryKey']: primaryKey,
      confirmation
    },
    silentError: true
  });
};

export const deleteTable = async (databaseID: number, tableName: string, confirmName: string): Promise<void> => {
  await request.delete(`/v1/databases/${databaseID}/tables/${tableName}`, {
    data: {
      confirmation: {
        confirmed: true,
        confirmText: confirmName
      }
    },
    silentError: true
  });
};
