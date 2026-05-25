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
  type: 'PRIMARY_KEY' | 'UNIQUE';
  columns: string[];
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
  primaryKey: TablePrimaryKey | null;
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
  }
): Promise<TablePreviewData> => {
  const res: any = await request.get(`/v1/databases/${databaseID}/tables/${tableName}/preview`, {
    params: {
      limit: options.limit,
      offset: options.offset,
      filters: JSON.stringify(options.filters)
    },
    silentError: true
  });
  return res.data as TablePreviewData;
};

export const createTableRow = async (
  databaseID: number,
  tableName: string,
  row: Record<string, unknown>
): Promise<TableRowMutationData> => {
  const res: any = await request.post(`/v1/databases/${databaseID}/tables/${tableName}/rows`, {
    row
  }, {
    silentError: true
  });
  return res.data as TableRowMutationData;
};

export const updateTableRow = async (
  databaseID: number,
  tableName: string,
  primaryKey: TablePrimaryKey,
  set: Record<string, unknown>
): Promise<TableRowMutationData> => {
  const res: any = await request.patch(`/v1/databases/${databaseID}/tables/${tableName}/rows`, {
    primaryKey,
    set
  }, {
    silentError: true
  });
  return res.data as TableRowMutationData;
};

export const deleteTableRow = async (
  databaseID: number,
  tableName: string,
  primaryKey: TablePrimaryKey
): Promise<void> => {
  await request.delete(`/v1/databases/${databaseID}/tables/${tableName}/rows`, {
    data: {
      primaryKey
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
