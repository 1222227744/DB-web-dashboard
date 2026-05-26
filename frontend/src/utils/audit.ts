import request from './request';
import type { OperationSummary } from './stats';

export type AuditLogListData = {
  items: Array<OperationSummary & {
    durationMs: number | null;
  }>;
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type AuditLogQuery = {
  page?: number;
  pageSize?: number;
  actionType?: string;
  objectType?: string;
  databaseId?: number;
  traceId?: string;
  startDate?: string;
  endDate?: string;
};

export const fetchAuditLogs = async (query: AuditLogQuery = {}): Promise<AuditLogListData> => {
  const res: any = await request.get('/v1/audit-logs', {
    params: query,
    silentError: true
  });
  return res.data as AuditLogListData;
};
