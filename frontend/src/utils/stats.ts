import request from './request';

export type OperationSummary = {
  id: number;
  traceId: string;
  databaseId: number | null;
  objectType: string;
  objectName: string | null;
  actionType: string;
  summary: string;
  success: boolean;
  errorCode: string | null;
  createdAt: string;
};

export type UserStats = {
  summary: {
    databaseCount: number;
    tableCount: number;
    viewCount: number;
    indexCount: number;
    rowCountEstimated: number;
    storageBytes: number;
  };
  operationTrend: Array<{
    day: string;
    total: number;
  }>;
  databaseDistribution: Array<{
    databaseId: number;
    displayName: string;
    tableCount: number;
    viewCount: number;
    rowCountEstimated: number;
    storageBytes: number;
  }>;
  recentOperations: OperationSummary[];
};

export type DatabaseStats = {
  databaseId: number;
  displayName: string;
  summary: {
    tableCount: number;
    viewCount: number;
    indexCount: number;
    dataBytes: number;
    indexBytes: number;
  };
  tableSizeTop: Array<{
    tableName: string;
    rowCountEstimated: number;
    dataBytes: number;
    indexBytes: number;
    storageBytes: number;
  }>;
  rowCountBuckets: Array<{
    label: string;
    total: number;
  }>;
  columnTypeDistribution: Array<{
    type: string;
    total: number;
  }>;
  recentOperations: OperationSummary[];
};

export type TableStats = {
  databaseId: number;
  tableName: string;
  summary: {
    columnCount: number;
    rowCountEstimated: number;
    dataBytes: number;
    indexBytes: number;
    sampleLimit: number;
  };
  primaryKeys: string[];
  foreignKeys: Array<{
    name: string;
    column: string | null;
    referencedTable: string | null;
    referencedColumn: string | null;
  }>;
  indexes: Array<{
    name: string;
    unique: boolean;
    columns: string[];
  }>;
  nullRatios: Array<{
    column: string;
    total: number;
    nullCount: number;
    ratio: number;
  }>;
  numericStats: Array<{
    column: string;
    min: number | null;
    max: number | null;
    avg: number | null;
  }>;
  categoryTopN: Array<{
    column: string;
    items: Array<{
      value: string | number | boolean | null;
      total: number;
    }>;
  }>;
};

export const fetchUserStats = async (): Promise<UserStats> => {
  const res: any = await request.get('/v1/stats/user', {
    silentError: true
  });
  return res.data as UserStats;
};

export const fetchDatabaseStats = async (databaseID: number): Promise<DatabaseStats> => {
  const res: any = await request.get(`/v1/stats/databases/${databaseID}`, {
    silentError: true
  });
  return res.data as DatabaseStats;
};

export const fetchTableStats = async (
  databaseID: number,
  tableName: string,
  options: {
    sampleLimit?: number;
    topN?: number;
  } = {}
): Promise<TableStats> => {
  const res: any = await request.get(`/v1/stats/databases/${databaseID}/tables/${tableName}`, {
    params: options,
    silentError: true
  });
  return res.data as TableStats;
};
