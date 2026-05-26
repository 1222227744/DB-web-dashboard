import { randomUUID } from 'node:crypto';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { type NextFunction, type Request, type Response } from 'express';
import pool from '../config/db.js';
import { env } from '../config/env.js';
import { limits } from '../config/limits.js';
import { AppError } from '../errors/AppError.js';
import { recordAuditLog } from '../services/auditService.js';
import { sendSuccess } from '../utils/response.js';

type ProfileRow = {
  user_id: number;
  nickname: string;
  avatar_asset_id: number | null;
  avatar_path: string | null;
  background_asset_id: number | null;
  background_path: string | null;
};

type AssetRow = {
  id: number;
  user_id: number;
  storage_key: string;
  mime_type: string;
  original_name: string;
};

type ProfilePatchBody = {
  nickname?: unknown;
};

type AssetUploadBody = {
  assetType?: unknown;
  originalName?: unknown;
  mimeType?: unknown;
  dataBase64?: unknown;
};

type PreferenceRow = {
  theme_color: string;
  background_mode: 'particle' | 'image' | 'gradient';
  background_asset_id: number | null;
  layout_json: string | null;
  confirm_preferences_json: string | null;
};

type PreferenceData = {
  themeMode: 'dark' | 'light';
  themeHue: number;
  backgroundPreset: 'particle' | 'image' | 'gradient';
  backgroundAssetID: number | null;
  tablePageSize: number;
  dashboardLayout: DashboardLayout;
  confirmBatchInsert: boolean;
  confirmBatchUpdate: boolean;
  confirmBatchDelete: boolean;
  confirmCascadeDelete: boolean;
};

type DashboardLayout = {
  version: number;
  cards: DashboardCardLayout[];
};

type DashboardCardLayout = {
  id: string;
  visible: boolean;
  order: number;
  config: Record<string, unknown>;
};

type PreferencePatchBody = {
  themeHue?: unknown;
  backgroundPreset?: unknown;
  backgroundAssetID?: unknown;
  tablePageSize?: unknown;
  dashboardLayout?: unknown;
  confirmBatchInsert?: unknown;
  confirmBatchUpdate?: unknown;
  confirmBatchDelete?: unknown;
  confirmCascadeDelete?: unknown;
};

export const getProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const profile = await ensureProfile(userID, req.user?.displayName ?? '用户');
    sendSuccess(res, 'success', profile);
  } catch (error) {
    next(error);
  }
};

export const updateProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const body = req.body as ProfilePatchBody;
    const nickname = validateNickname(body.nickname);

    await ensureProfile(userID, req.user?.displayName ?? '用户');
    await pool.query(
      `UPDATE user_profiles
       SET nickname = ?
       WHERE user_id = ?`,
      [nickname, userID]
    );

    const profile = await ensureProfile(userID, nickname);
    sendSuccess(res, '资料已更新', profile);
  } catch (error) {
    next(error);
  }
};

export const uploadAsset = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const body = req.body as AssetUploadBody;
    const assetType = validateAssetType(body.assetType);
    const originalName = validateAssetName(body.originalName);
    const mimeType = validateMimeType(body.mimeType, assetType);
    const buffer = decodeBase64Asset(body.dataBase64, assetType);
    await ensureUserAssetCapacity(userID, buffer.length);

    const relativePath = await saveAssetFile(userID, assetType, originalName, buffer);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const [result] = await pool.query(
      `INSERT INTO user_assets (
         user_id,
         asset_type,
         storage_type,
         storage_key,
         original_name,
         mime_type,
         file_size,
         checksum,
         status
       )
       VALUES (?, ?, 'local', ?, ?, ?, ?, ?, 'active')`,
      [userID, assetType, relativePath, originalName, mimeType, buffer.length, checksum]
    );
    const assetID = Number((result as { insertId?: number }).insertId);

    if (assetType === 'avatar') {
      await ensureProfile(userID, req.user?.displayName ?? '用户');
      await pool.query(
        `UPDATE user_profiles SET avatar_asset_id = ? WHERE user_id = ?`,
        [assetID, userID]
      );
    } else {
      await ensurePreferences(userID);
      await pool.query(
        `UPDATE user_preferences
         SET background_mode = 'image',
             background_asset_id = ?
         WHERE user_id = ?`,
        [assetID, userID]
      );
    }

    sendSuccess(res, '资源已上传', {
      id: assetID,
      assetType,
      originalName,
      mimeType,
      sizeBytes: buffer.length,
      storageKey: relativePath
    });
  } catch (error) {
    next(error);
  }
};

export const getAsset = async (
  req: Request<{ assetId?: string }>,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const userID = getCurrentUserID(req);
    const assetID = parseInteger(req.params.assetId, 'assetId', 1, Number.MAX_SAFE_INTEGER);
    const [rows] = await pool.query(
      `SELECT id, user_id, storage_key, mime_type, original_name
       FROM user_assets
       WHERE id = ? AND user_id = ? AND status = 'active'
       LIMIT 1`,
      [assetID, userID]
    );
    const asset = (rows as AssetRow[])[0];

    if (!asset) {
      throw new AppError({
        httpStatus: 404,
        type: 'RESOURCE_NOT_FOUND',
        code: 'ASSET_NOT_FOUND',
        message: '资源不存在'
      });
    }

    res.type(asset.mime_type);
    res.sendFile(path.resolve(asset.storage_key));
  } catch (error) {
    next(error);
  }
};

const defaultPreferences: PreferenceData = {
  themeMode: 'dark',
  themeHue: 210,
  backgroundPreset: 'particle',
  backgroundAssetID: null,
  tablePageSize: 20,
  dashboardLayout: {
    version: 1,
    cards: [
      { id: 'database-count', visible: true, order: 10, config: {} },
      { id: 'table-count', visible: true, order: 20, config: {} },
      { id: 'storage-usage', visible: true, order: 30, config: {} },
      { id: 'operation-trend', visible: true, order: 40, config: {} },
      { id: 'database-distribution', visible: true, order: 50, config: {} },
      { id: 'recent-operations', visible: true, order: 60, config: {} }
    ]
  },
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
           background_asset_id = ?,
           layout_json = ?,
           confirm_preferences_json = ?
       WHERE user_id = ?`,
      [
        hueToThemeColor(nextPreferences.themeHue),
        nextPreferences.backgroundPreset,
        nextPreferences.backgroundAssetID,
        JSON.stringify({
          themeMode: nextPreferences.themeMode,
          tablePageSize: nextPreferences.tablePageSize,
          dashboardLayout: nextPreferences.dashboardLayout
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

    await recordAuditLog({
      req,
      userID,
      objectType: 'PREFERENCE',
      actionType: 'PREFERENCE_UPDATE',
      summary: '更新用户偏好',
      detail: {
        fields: Object.keys(patch)
      }
    });
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
        tablePageSize: defaultPreferences.tablePageSize,
        dashboardLayout: defaultPreferences.dashboardLayout
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
    `SELECT theme_color, background_mode, background_asset_id, layout_json, confirm_preferences_json
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

const ensureProfile = async (userID: number, fallbackNickname: string) => {
  const safeFallbackNickname = normalizeFallbackNickname(fallbackNickname);

  await pool.query(
    `INSERT IGNORE INTO user_profiles (user_id, nickname)
     VALUES (?, ?)`,
    [userID, safeFallbackNickname]
  );

  const [rows] = await pool.query(
    `SELECT p.user_id,
            p.nickname,
            p.avatar_asset_id,
            avatar.storage_key AS avatar_path,
            pref.background_asset_id,
            background.storage_key AS background_path
     FROM user_profiles p
     LEFT JOIN user_preferences pref ON pref.user_id = p.user_id
     LEFT JOIN user_assets avatar ON avatar.id = p.avatar_asset_id AND avatar.user_id = p.user_id AND avatar.status = 'active'
     LEFT JOIN user_assets background ON background.id = pref.background_asset_id AND background.user_id = p.user_id AND background.status = 'active'
     WHERE p.user_id = ?
     LIMIT 1`,
    [userID]
  );
  const profile = (rows as ProfileRow[])[0];

  return {
    userID,
    nickname: profile?.nickname ?? safeFallbackNickname,
    avatarAssetID: profile?.avatar_asset_id ?? null,
    avatarUrl: profile?.avatar_asset_id ? `/api/v1/users/me/assets/${profile.avatar_asset_id}` : null,
    backgroundAssetID: profile?.background_asset_id ?? null,
    backgroundUrl: profile?.background_asset_id ? `/api/v1/users/me/assets/${profile.background_asset_id}` : null
  };
};

const validatePreferencePatch = (body: PreferencePatchBody): Partial<PreferenceData> => {
  const patch: Partial<PreferenceData> = {};

  if (body.themeHue !== undefined) {
    patch.themeHue = parseInteger(body.themeHue, 'themeHue', 0, 359);
  }

  if (body.tablePageSize !== undefined) {
    patch.tablePageSize = parseInteger(body.tablePageSize, 'tablePageSize', 1, limits.maxPageSize);
  }

  if (body.dashboardLayout !== undefined) {
    patch.dashboardLayout = normalizeDashboardLayout(body.dashboardLayout);
  }

  if (body.backgroundPreset !== undefined) {
    if (
      body.backgroundPreset === 'particle'
      || body.backgroundPreset === 'image'
      || body.backgroundPreset === 'gradient'
    ) {
      patch.backgroundPreset = body.backgroundPreset;
    } else {
      throwValidationError('backgroundPreset 不合法');
    }
  }

  if (body.backgroundAssetID !== undefined) {
    patch.backgroundAssetID = body.backgroundAssetID === null
      ? null
      : parseInteger(body.backgroundAssetID, 'backgroundAssetID', 1, Number.MAX_SAFE_INTEGER);
  }

  for (const key of ['confirmBatchInsert', 'confirmBatchUpdate', 'confirmBatchDelete', 'confirmCascadeDelete'] as const) {
    const value = body[key];
    if (value !== undefined) {
      patch[key] = parseBoolean(value, key);
    }
  }

  return patch;
};

const validateNickname = (value: unknown): string => {
  if (typeof value === 'string') {
    const nickname = value.trim();

    if (nickname.length < 2 || nickname.length > 20) {
      throwValidationError('昵称长度必须为 2 到 20 个字符');
    }

    return nickname;
  }

  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message: '昵称不能为空'
  });
};

const normalizeFallbackNickname = (value: string): string => {
  const nickname = value.trim();

  if (nickname.length >= 2 && nickname.length <= 20) {
    return nickname;
  }

  return '用户';
};

const validateAssetType = (value: unknown): 'avatar' | 'background' => {
  if (value === 'avatar' || value === 'background') {
    return value;
  }

  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message: '资源类型仅支持 avatar 或 background'
  });
};

const validateAssetName = (value: unknown): string => {
  if (typeof value === 'string') {
    const originalName = value.trim();

    if (!originalName) {
      throwValidationError('资源文件名不能为空');
    }

    return originalName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120);
  }

  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message: '资源文件名不能为空'
  });
};

const validateMimeType = (value: unknown, assetType: 'avatar' | 'background'): string => {
  const allowedTypes = assetType === 'avatar'
    ? ['image/png', 'image/jpeg', 'image/webp']
    : ['image/png', 'image/jpeg', 'image/webp'];

  if (typeof value === 'string' && allowedTypes.includes(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    throwValidationError('资源 MIME 类型不能为空');
  }

  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message: '仅支持 png、jpg 或 webp 图片'
  });
};

const decodeBase64Asset = (value: unknown, assetType: 'avatar' | 'background'): Buffer => {
  if (typeof value === 'string') {
    const rawData = value.trim();

    if (!rawData) {
      throwValidationError('资源内容不能为空');
    }

    const payload = rawData.includes(',') ? rawData.split(',').pop() ?? '' : rawData;
    const buffer = Buffer.from(payload, 'base64');
    const limit = assetType === 'avatar' ? limits.maxAvatarBytes : limits.maxBackgroundBytes;

    if (buffer.length === 0 || buffer.length > limit) {
      throwValidationError(`资源大小不能超过 ${Math.floor(limit / 1024 / 1024)} MB`);
    }

    return buffer;
  }

  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_FIELD_INVALID',
    message: '资源内容不能为空'
  });
};

const ensureUserAssetCapacity = async (userID: number, nextBytes: number): Promise<void> => {
  const [rows] = await pool.query(
    `SELECT COALESCE(SUM(file_size), 0) AS total
     FROM user_assets
     WHERE user_id = ? AND status = 'active'`,
    [userID]
  );
  const total = Number((rows as Array<{ total: number }>)[0]?.total ?? 0);

  if (total + nextBytes > limits.maxUserAssetBytes) {
    throwValidationError(`用户资源总量不能超过 ${Math.floor(limits.maxUserAssetBytes / 1024 / 1024)} MB`);
  }
};

const saveAssetFile = async (
  userID: number,
  assetType: 'avatar' | 'background',
  originalName: string,
  buffer: Buffer
): Promise<string> => {
  const extension = path.extname(originalName).toLowerCase() || '.bin';
  const directory = path.join(env.assetStorageDir, String(userID), assetType);
  const filename = `${randomUUID()}${extension}`;
  const storedPath = path.join(directory, filename);

  await mkdir(directory, {
    recursive: true
  });
  await writeFile(storedPath, buffer);

  return storedPath;
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

const normalizeDashboardLayout = (value: unknown): DashboardLayout => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return cloneDefaultDashboardLayout();
  }

  const rawLayout = value as Record<string, unknown>;
  const rawCards = Array.isArray(rawLayout.cards) ? rawLayout.cards : [];
  const cardMap = new Map<string, DashboardCardLayout>();

  rawCards.forEach((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return;
    }

    const rawCard = item as Record<string, unknown>;

    if (typeof rawCard.id !== 'string' || !dashboardCardIDs.has(rawCard.id)) {
      return;
    }

    const order = typeof rawCard.order === 'number' && Number.isFinite(rawCard.order)
      ? Math.max(0, Math.min(9999, Math.trunc(rawCard.order)))
      : getDefaultDashboardCard(rawCard.id).order;

    cardMap.set(rawCard.id, {
      id: rawCard.id,
      visible: typeof rawCard.visible === 'boolean' ? rawCard.visible : true,
      order,
      config: normalizeDashboardCardConfig(rawCard.config)
    });
  });

  defaultPreferences.dashboardLayout.cards.forEach((card) => {
    if (!cardMap.has(card.id)) {
      cardMap.set(card.id, {
        ...card,
        config: { ...card.config }
      });
    }
  });

  return {
    version: 1,
    cards: [...cardMap.values()].sort((left, right) => left.order - right.order)
  };
};

const normalizeDashboardCardConfig = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => /^[A-Za-z][A-Za-z0-9_]{0,31}$/.test(key))
      .filter(([, item]) => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean' || item === null)
      .slice(0, 12)
  );
};

const cloneDefaultDashboardLayout = (): DashboardLayout => ({
  version: defaultPreferences.dashboardLayout.version,
  cards: defaultPreferences.dashboardLayout.cards.map((card) => ({
    ...card,
    config: { ...card.config }
  }))
});

const getDefaultDashboardCard = (id: string): DashboardCardLayout => {
  return defaultPreferences.dashboardLayout.cards.find((card) => card.id === id) ?? defaultPreferences.dashboardLayout.cards[0]!;
};

const rowToPreferenceData = (row: PreferenceRow): PreferenceData => {
  const layout = parseJsonObject(row.layout_json);
  const confirmation = parseJsonObject(row.confirm_preferences_json);

  return {
    themeMode: layout.themeMode === 'light' ? 'light' : 'dark',
    themeHue: themeColorToHue(row.theme_color),
    backgroundPreset: row.background_mode,
    backgroundAssetID: row.background_asset_id === null ? null : Number(row.background_asset_id),
    tablePageSize: typeof layout.tablePageSize === 'number' ? layout.tablePageSize : defaultPreferences.tablePageSize,
    dashboardLayout: normalizeDashboardLayout(layout.dashboardLayout),
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

const dashboardCardIDs = new Set(defaultPreferences.dashboardLayout.cards.map((card) => card.id));

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
