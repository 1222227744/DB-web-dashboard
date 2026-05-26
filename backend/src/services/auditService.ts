import { type Request } from 'express';
import pool from '../config/db.js';

export type AuditObjectType =
  | 'AUTH'
  | 'USER'
  | 'PREFERENCE'
  | 'DATABASE'
  | 'TABLE'
  | 'COLUMN'
  | 'CONSTRAINT'
  | 'INDEX'
  | 'VIEW'
  | 'ROW'
  | 'QUERY'
  | 'TRANSACTION'
  | 'STATS'
  | 'ASSET';

export type AuditActionType =
  | 'AUTH_REGISTER'
  | 'AUTH_LOGIN'
  | 'AUTH_REFRESH'
  | 'AUTH_LOGOUT'
  | 'PREFERENCE_UPDATE'
  | 'DB_CREATE'
  | 'DB_UPDATE'
  | 'DB_DELETE'
  | 'TABLE_CREATE'
  | 'TABLE_ALTER'
  | 'TABLE_DELETE'
  | 'ROW_SELECT'
  | 'ROW_INSERT'
  | 'ROW_UPDATE'
  | 'ROW_DELETE'
  | 'QUERY_SELECT'
  | 'STATS_VIEW'
  | 'ASSET_VIEW';

export type AuditLogInput = {
  req?: Request;
  userID: number | null;
  databaseID?: number | null;
  transactionID?: number | null;
  objectType: AuditObjectType;
  objectName?: string | null;
  actionType: AuditActionType;
  summary: string;
  detail?: Record<string, unknown> | null;
  success?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  durationMs?: number | null;
};

export const recordAuditLog = async (input: AuditLogInput): Promise<void> => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (
         trace_id,
         user_id,
         database_id,
         transaction_id,
         object_type,
         object_name,
         action_type,
         summary,
         detail_json,
         success,
         error_code,
         error_message,
         duration_ms,
         ip_address,
         user_agent
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        getTraceID(input.req),
        input.userID,
        input.databaseID ?? null,
        input.transactionID ?? null,
        input.objectType,
        input.objectName ?? null,
        input.actionType,
        input.summary,
        input.detail ? JSON.stringify(sanitizeAuditDetail(input.detail)) : null,
        input.success ?? true,
        input.errorCode ?? null,
        input.errorMessage ? input.errorMessage.slice(0, 500) : null,
        input.durationMs ?? null,
        getClientIP(input.req),
        getUserAgent(input.req)
      ]
    );
  } catch (error) {
    console.warn('审计日志写入失败:', error);
  }
};

const getTraceID = (req: Request | undefined): string => {
  const headerValue = req?.headers['x-trace-id'];

  if (typeof headerValue === 'string' && headerValue.trim()) {
    return headerValue.trim().slice(0, 64);
  }

  return cryptoRandomTraceID();
};

const cryptoRandomTraceID = (): string => {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const getClientIP = (req: Request | undefined): string | null => {
  if (!req) {
    return null;
  }

  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0]?.trim().slice(0, 45) ?? null;
  }

  return req.ip?.slice(0, 45) ?? null;
};

const getUserAgent = (req: Request | undefined): string | null => {
  const userAgent = req?.headers['user-agent'];

  return typeof userAgent === 'string' ? userAgent.slice(0, 255) : null;
};

const sanitizeAuditDetail = (detail: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(
    Object.entries(detail)
      .filter(([key]) => !/password|token|hash|secret/i.test(key))
      .map(([key, value]) => [key, normalizeAuditValue(value)])
  );
};

const normalizeAuditValue = (value: unknown): unknown => {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return value.length > 240 ? `${value.slice(0, 240)}…` : value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map(normalizeAuditValue);
  }

  if (typeof value === 'object') {
    return sanitizeAuditDetail(value as Record<string, unknown>);
  }

  return String(value);
};
