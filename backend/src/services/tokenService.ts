import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { type AccessTokenPayload, type AuthUser } from '../types/auth.js';

const accessTokenExpiresIn = '15m';
const refreshTokenExpiresMs = 7 * 24 * 60 * 60 * 1000;

type RefreshTokenRow = {
  id: number;
  user_id: number;
  token_family: string;
  expires_at: Date;
  revoked_at: Date | null;
  account_no: string;
  user_name: string;
  status: 'active' | 'disabled';
};

export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

export const refreshCookieName = 'refreshToken';

export const createAccessToken = (user: AuthUser): string => {
  const payload: AccessTokenPayload = {
    sub: String(user.userID),
    accountNo: user.accountNo
  };

  return jwt.sign(payload, env.jwtAccessSecret, {
    expiresIn: accessTokenExpiresIn
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const payload = jwt.verify(token, env.jwtAccessSecret);

    if (typeof payload !== 'object' || typeof payload.sub !== 'string' || typeof payload.accountNo !== 'string') {
      throw new Error('Invalid access token payload');
    }

    return {
      sub: payload.sub,
      accountNo: payload.accountNo
    };
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AppError({
        httpStatus: 401,
        type: 'AUTH_ERROR',
        code: 'AUTH_TOKEN_EXPIRED',
        message: '登录状态已过期，请重新登录'
      });
    }

    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_TOKEN_INVALID',
      message: '登录凭证无效，请重新登录'
    });
  }
};

export const createTokenPair = async (user: AuthUser, tokenFamily: string = crypto.randomUUID()): Promise<TokenPair> => {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenExpiresMs);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, token_family, expires_at)
     VALUES (?, ?, ?, ?)`,
    [user.userID, refreshTokenHash, tokenFamily, refreshTokenExpiresAt]
  );

  return {
    accessToken: createAccessToken(user),
    refreshToken,
    refreshTokenExpiresAt
  };
};

export const rotateRefreshToken = async (refreshToken: string): Promise<TokenPair> => {
  const tokenHash = hashRefreshToken(refreshToken);
  const refreshTokenRow = await findRefreshToken(tokenHash);

  if (!refreshTokenRow) {
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_REFRESH_MISSING',
      message: '刷新凭证缺失，请重新登录'
    });
  }

  if (refreshTokenRow.revoked_at) {
    await revokeTokenFamily(refreshTokenRow.user_id, refreshTokenRow.token_family);
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_REFRESH_REUSE_DETECTED',
      message: '登录状态异常，请重新登录'
    });
  }

  if (refreshTokenRow.expires_at.getTime() <= Date.now()) {
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_REFRESH_EXPIRED',
      message: '登录状态已失效，请重新登录'
    });
  }

  if (refreshTokenRow.status !== 'active') {
    throw new AppError({
      httpStatus: 403,
      type: 'AUTHZ_ERROR',
      code: 'AUTH_USER_DISABLED',
      message: '账号已被禁用'
    });
  }

  await revokeRefreshToken(tokenHash);

  return createTokenPair(
    {
      userID: refreshTokenRow.user_id,
      accountNo: refreshTokenRow.account_no,
      displayName: refreshTokenRow.user_name,
      status: refreshTokenRow.status
    },
    refreshTokenRow.token_family
  );
};

export const revokeRefreshToken = async (refreshTokenOrHash: string): Promise<void> => {
  const tokenHash = refreshTokenOrHash.length === 64
    ? refreshTokenOrHash
    : hashRefreshToken(refreshTokenOrHash);

  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE token_hash = ?`,
    [tokenHash]
  );
};

const revokeTokenFamily = async (userID: number, tokenFamily: string): Promise<void> => {
  await pool.query(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
     WHERE user_id = ? AND token_family = ?`,
    [userID, tokenFamily]
  );
};

const findRefreshToken = async (tokenHash: string): Promise<RefreshTokenRow | null> => {
  const [rows] = await pool.query(
    `SELECT
       rt.id,
       rt.user_id,
       rt.token_family,
       rt.expires_at,
       rt.revoked_at,
       u.account_no,
       u.user_name,
       u.status
     FROM refresh_tokens rt
     INNER JOIN users u ON u.id = rt.user_id
     WHERE rt.token_hash = ?
     LIMIT 1`,
    [tokenHash]
  );

  const refreshTokenRows = rows as RefreshTokenRow[];
  return refreshTokenRows[0] ?? null;
};

const hashRefreshToken = (refreshToken: string): string => {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
};
