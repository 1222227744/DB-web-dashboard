import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { sendSuccess } from '../utils/response.js';

type PreferenceRow = {
  theme_color: string;
  background_mode: 'particle' | 'image' | 'gradient';
  layout_json: string | null;
  confirm_preferences_json: string | null;
};

type PreferenceData = {
  themeMode: 'dark' | 'light';
  themeHue: number;
  backgroundPreset: 'particle' | 'image' | 'gradient';
  tablePageSize: number;
  confirmBatchInsert: boolean;
  confirmBatchUpdate: boolean;
  confirmBatchDelete: boolean;
  confirmCascadeDelete: boolean;
};

type PreferencePatchBody = {
  themeHue?: unknown;
  tablePageSize?: unknown;
  confirmBatchInsert?: unknown;
  confirmBatchUpdate?: unknown;
  confirmBatchDelete?: unknown;
  confirmCascadeDelete?: unknown;
};

const defaultPreferences: PreferenceData = {
  themeMode: 'dark',
  themeHue: 210,
  backgroundPreset: 'particle',
  tablePageSize: 20,
  confirmBatchInsert: true,
  confirmBatchUpdate: true,
  confirmBatchDelete: true,
  confirmCascadeDelete: true
};

export const getPreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const preferences = await ensurePreferences(userID);
    sendSuccess(res, 'success', preferences);
  } catch (error) {
    next(error);
  }
};

export const updatePreferences = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const currentPreferences = await ensurePreferences(userID);
    const patch = validatePreferencePatch(req.body as PreferencePatchBody);
    const nextPreferences = {
      ...currentPreferences,
      ...patch
    };

    await pool.query(
      `UPDATE user_preferences
       SET theme_color = ?,
           background_mode = ?,
           layout_json = ?,
           confirm_preferences_json = ?
       WHERE user_id = ?`,
      [
        hueToThemeColor(nextPreferences.themeHue),
        nextPreferences.backgroundPreset,
        JSON.stringify({
          themeMode: nextPreferences.themeMode,
          tablePageSize: nextPreferences.tablePageSize
        }),
        JSON.stringify({
          confirmBatchInsert: nextPreferences.confirmBatchInsert,
          confirmBatchUpdate: nextPreferences.confirmBatchUpdate,
          confirmBatchDelete: nextPreferences.confirmBatchDelete,
          confirmCascadeDelete: nextPreferences.confirmCascadeDelete
        }),
        userID
      ]
    );

    sendSuccess(res, '偏好已更新', nextPreferences);
  } catch (error) {
    next(error);
  }
};

const ensurePreferences = async (userID: number): Promise<PreferenceData> => {
  await pool.query(
    `INSERT IGNORE INTO user_preferences (
       user_id,
       theme_color,
       background_mode,
       layout_json,
       confirm_preferences_json
     ) VALUES (?, ?, 'particle', ?, ?)`,
    [
      userID,
      hueToThemeColor(defaultPreferences.themeHue),
      JSON.stringify({
        themeMode: defaultPreferences.themeMode,
        tablePageSize: defaultPreferences.tablePageSize
      }),
      JSON.stringify({
        confirmBatchInsert: defaultPreferences.confirmBatchInsert,
        confirmBatchUpdate: defaultPreferences.confirmBatchUpdate,
        confirmBatchDelete: defaultPreferences.confirmBatchDelete,
        confirmCascadeDelete: defaultPreferences.confirmCascadeDelete
      })
    ]
  );

  const [rows] = await pool.query(
    `SELECT theme_color, background_mode, layout_json, confirm_preferences_json
     FROM user_preferences
     WHERE user_id = ?
     LIMIT 1`,
    [userID]
  );

  const preferenceRows = rows as PreferenceRow[];
  const row = preferenceRows[0];

  if (!row) {
    return defaultPreferences;
  }

  return rowToPreferenceData(row);
};

const validatePreferencePatch = (body: PreferencePatchBody): Partial<PreferenceData> => {
  const patch: Partial<PreferenceData> = {};

  if (body.themeHue !== undefined) {
    patch.themeHue = parseInteger(body.themeHue, 'themeHue', 0, 359);
  }

  if (body.tablePageSize !== undefined) {
    patch.tablePageSize = parseInteger(body.tablePageSize, 'tablePageSize', 1, limits.maxPageSize);
  }

  for (const key of ['confirmBatchInsert', 'confirmBatchUpdate', 'confirmBatchDelete', 'confirmCascadeDelete'] as const) {
    const value = body[key];
    if (value !== undefined) {
      patch[key] = parseBoolean(value, key);
    }
  }

  return patch;
};

const parseInteger = (value: unknown, fieldName: string, min: number, max: number): number => {
  const numberValue = value as number;

  if (typeof numberValue !== 'number' || !Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throwValidationError(`${fieldName} 必须是 ${min} 到 ${max} 的整数`);
  }

  return numberValue;
};

const parseBoolean = (value: unknown, fieldName: string): boolean => {
  const booleanValue = value as boolean;

  if (typeof booleanValue !== 'boolean') {
    throwValidationError(`${fieldName} 必须是布尔值`);
  }

  return booleanValue;
};

const rowToPreferenceData = (row: PreferenceRow): PreferenceData => {
  const layout = parseJsonObject(row.layout_json);
  const confirmation = parseJsonObject(row.confirm_preferences_json);

  return {
    themeMode: layout.themeMode === 'light' ? 'light' : 'dark',
    themeHue: themeColorToHue(row.theme_color),
    backgroundPreset: row.background_mode,
    tablePageSize: typeof layout.tablePageSize === 'number' ? layout.tablePageSize : defaultPreferences.tablePageSize,
    confirmBatchInsert: typeof confirmation.confirmBatchInsert === 'boolean' ? confirmation.confirmBatchInsert : true,
    confirmBatchUpdate: typeof confirmation.confirmBatchUpdate === 'boolean' ? confirmation.confirmBatchUpdate : true,
    confirmBatchDelete: typeof confirmation.confirmBatchDelete === 'boolean' ? confirmation.confirmBatchDelete : true,
    confirmCascadeDelete: typeof confirmation.confirmCascadeDelete === 'boolean' ? confirmation.confirmCascadeDelete : true
  };
};

const parseJsonObject = (value: string | null): Record<string, unknown> => {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
};

const hueToThemeColor = (hue: number): string => {
  return `hsl(${hue}, 80%, 60%)`;
};

const themeColorToHue = (themeColor: string): number => {
  const match = /^hsl\((\d{1,3}),\s*80%,\s*60%\)$/.exec(themeColor);
  if (!match) {
    return defaultPreferences.themeHue;
  }

  const hue = Number(match[1]);
  return Number.isInteger(hue) && hue >= 0 && hue <= 359 ? hue : defaultPreferences.themeHue;
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
