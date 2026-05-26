import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { resolveOwnedDatabase } from '../services/databaseResolver.js';
import { sendSuccess } from '../utils/response.js';

type AuditListQuery = {
  page?: string;
  pageSize?: string;
  actionType?: string;
  objectType?: string;
  databaseId?: string;
  traceId?: string;
  startDate?: string;
  endDate?: string;
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
  duration_ms: number | null;
  created_at: Date;
};

type CountRow = {
  total: number;
};

const actionTypePattern = /^[A-Z_]{3,50}$/;
const objectTypePattern = /^[A-Z_]{3,30}$/;
const traceIDPattern = /^[A-Za-z0-9._:-]{1,64}$/;

export const listAuditLogs = async (
  req: Request<unknown, unknown, unknown, AuditListQuery>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const page = parseOptionalInteger(req.query.page, 'page', 1, Number.MAX_SAFE_INTEGER, 1);
    const pageSize = parseOptionalInteger(req.query.pageSize, 'pageSize', 1, limits.maxPageSize, 20);
    const filters = await buildAuditFilters(userID, req.query);
    const offset = (page - 1) * pageSize;
    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total
       FROM audit_logs
       WHERE ${filters.whereSql}`,
      filters.params
    );
    const total = Number((countRows as CountRow[])[0]?.total ?? 0);
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
              duration_ms,
              created_at
       FROM audit_logs
       WHERE ${filters.whereSql}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...filters.params, pageSize, offset]
    );

    sendSuccess(res, 'success', {
      items: (rows as AuditLogRow[]).map(rowToAuditLogItem),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total
    });
  } catch (error) {
    next(error);
  }
};

const buildAuditFilters = async (userID: number, query: AuditListQuery) => {
  const conditions = ['user_id = ?'];
  const params: unknown[] = [userID];

  if (query.actionType) {
    if (!actionTypePattern.test(query.actionType)) {
      throwValidationError('actionType 不合法');
    }

    conditions.push('action_type = ?');
    params.push(query.actionType);
  }

  if (query.objectType) {
    if (!objectTypePattern.test(query.objectType)) {
      throwValidationError('objectType 不合法');
    }

    conditions.push('object_type = ?');
    params.push(query.objectType);
  }

  if (query.databaseId) {
    const databaseID = parseOptionalInteger(query.databaseId, 'databaseId', 1, Number.MAX_SAFE_INTEGER, 1);
    await resolveOwnedDatabase(userID, databaseID);
    conditions.push('database_id = ?');
    params.push(databaseID);
  }

  if (query.traceId) {
    if (!traceIDPattern.test(query.traceId)) {
      throwValidationError('traceId 不合法');
    }

    conditions.push('trace_id = ?');
    params.push(query.traceId);
  }

  if (query.startDate) {
    conditions.push('created_at >= ?');
    params.push(parseDate(query.startDate, 'startDate'));
  }

  if (query.endDate) {
    conditions.push('created_at <= ?');
    params.push(parseDate(query.endDate, 'endDate'));
  }

  return {
    whereSql: conditions.join(' AND '),
    params
  };
};

const rowToAuditLogItem = (row: AuditLogRow) => ({
  id: Number(row.id),
  traceId: row.trace_id,
  databaseId: row.database_id === null ? null : Number(row.database_id),
  objectType: row.object_type,
  objectName: row.object_name,
  actionType: row.action_type,
  summary: row.summary,
  success: Boolean(row.success),
  errorCode: row.error_code,
  durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
  createdAt: row.created_at.toISOString()
});

const parseDate = (value: string, fieldName: string): Date => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throwValidationError(`${fieldName} 不是合法时间`);
  }

  return date;
};

const parseOptionalInteger = (value: string | undefined, fieldName: string, min: number, max: number, fallback: number): number => {
  if (value === undefined || value === '') {
    return fallback;
  }

  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throwValidationError(`${fieldName} 必须是 ${min} 到 ${max} 之间的整数`);
  }

  return numberValue;
};

const throwValidationError = (message: string): never => {
  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message
  });
};

const getCurrentUserID = (req: { user?: Request['user'] }): number => {
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
