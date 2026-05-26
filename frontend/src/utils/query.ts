import request from './request';

export type QuerySource =
  | {
      type: 'table';
      table: string;
      alias?: string;
    }
  | {
      type: 'view';
      view: string;
      alias?: string;
    }
  | {
      type: 'subquery';
      query: SelectQueryAst;
      alias: string;
    };

export type QueryField = {
  tableAlias?: string;
  name: string;
  alias?: string;
  aggregate?: 'COUNT' | 'SUM' | 'AVG' | 'MIN' | 'MAX';
  distinct?: boolean;
};

export type QueryCondition = {
  field?: string;
  rightField?: string;
  valueField?: string;
  operator?: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'notIn' | 'between' | 'isNull' | 'isNotNull' | 'exists' | 'notExists';
  value?: unknown;
  values?: unknown[];
  subquery?: SelectQueryAst;
  logic?: 'AND' | 'OR';
  conditions?: QueryCondition[];
};

export type QueryJoin = {
  type: 'INNER' | 'LEFT' | 'RIGHT';
  source: QuerySource;
  alias?: string;
  on: QueryCondition[];
};

export type QuerySort = {
  field?: string;
  name?: string;
  tableAlias?: string;
  order: 'ASC' | 'DESC';
};

export type SelectQueryAst = {
  from: QuerySource;
  joins?: QueryJoin[];
  fields: QueryField[];
  filters?: QueryCondition[];
  groups?: Array<string | { tableAlias?: string; name: string }>;
  having?: QueryCondition[];
  sorts?: QuerySort[];
  page?: number;
  pageSize?: number;
};

export type QueryResultColumn = {
  name: string;
  label: string;
  source: string | null;
  dataType: string | null;
};

export type QueryResultData = {
  columns: QueryResultColumn[];
  rows: Array<Record<string, unknown>>;
  page: number | null;
  pageSize: number | null;
  hasMore: boolean;
  sqlPreview: string;
};

export const executeSelectQuery = async (
  databaseID: number,
  ast: SelectQueryAst
): Promise<QueryResultData> => {
  const res: any = await request.post(`/v1/databases/${databaseID}/query/select`, ast, {
    silentError: true
  });
  return res.data as QueryResultData;
};
