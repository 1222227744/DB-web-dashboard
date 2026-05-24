import { type NextFunction, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { AppError } from '../errors/AppError.js';
import {
  createTokenPair,
  refreshCookieName,
  revokeRefreshToken,
  rotateRefreshToken
} from '../services/tokenService.js';
import { generateAccountNo, isValidPassword } from '../utils/helper.js';
import { sendSuccess } from '../utils/response.js';
import { type AuthUser } from '../types/auth.js';

type RegisterBody = {
  userName?: unknown;
  password?: unknown;
};

type LoginBody = {
  accountNo?: unknown;
  password?: unknown;
};

type UserRow = {
  id: number;
  account_no: string;
  user_name: string;
  password_hash: string;
  status: 'active' | 'disabled';
};

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { userName, password } = req.body as RegisterBody;

    if (typeof userName !== 'string' || typeof password !== 'string') {
      throw new AppError({
        httpStatus: 400,
        type: 'VALIDATION_ERROR',
        code: 'VALIDATION_FIELD_REQUIRED',
        message: '昵称和密码均为必填项'
      });
    }

    const cleanUserName = userName.trim();
    if (cleanUserName.length < 2 || cleanUserName.length > 20) {
      throw new AppError({
        httpStatus: 400,
        type: 'VALIDATION_ERROR',
        code: 'VALIDATION_FIELD_INVALID',
        message: '昵称长度必须为 2 到 20 个字符'
      });
    }

    if (!isValidPassword(password)) {
      throw new AppError({
        httpStatus: 400,
        type: 'VALIDATION_ERROR',
        code: 'VALIDATION_PASSWORD_INVALID',
        message: '密码必须为 8-16 位且包含英文字母和数字'
      });
    }

    const accountNo = await createUniqueAccountNo();
    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      'INSERT INTO users (user_name, account_no, password_hash) VALUES (?, ?, ?)',
      [cleanUserName, accountNo, passwordHash]
    );

    sendSuccess(res, '注册成功', {
      accountNo,
      userName: cleanUserName
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { accountNo, password } = req.body as LoginBody;

    if (typeof accountNo !== 'string' || typeof password !== 'string') {
      throw new AppError({
        httpStatus: 400,
        type: 'VALIDATION_ERROR',
        code: 'VALIDATION_FIELD_REQUIRED',
        message: '请填写账号和密码'
      });
    }

    const cleanAccountNo = accountNo.trim();

    if (!cleanAccountNo || !password) {
      throw new AppError({
        httpStatus: 400,
        type: 'VALIDATION_ERROR',
        code: 'VALIDATION_FIELD_REQUIRED',
        message: '请填写账号和密码'
      });
    }

    if (!/^\d{10}$/.test(cleanAccountNo)) {
      throw new AppError({
        httpStatus: 400,
        type: 'VALIDATION_ERROR',
        code: 'VALIDATION_IDENTIFIER_INVALID',
        message: '账号格式不正确'
      });
    }

    const user = await findUserByAccountNo(cleanAccountNo);

    if (!user) {
      throw new AppError({
        httpStatus: 401,
        type: 'AUTH_ERROR',
        code: 'AUTH_CREDENTIAL_INVALID',
        message: '账号与密码不匹配'
      });
    }
    const validUser = user;

    if (validUser.status !== 'active') {
      throw new AppError({
        httpStatus: 403,
        type: 'AUTHZ_ERROR',
        code: 'AUTH_USER_DISABLED',
        message: '账号已被禁用'
      });
    }

    const isPasswordValid = await bcrypt.compare(password, validUser.password_hash);

    if (!isPasswordValid) {
      throw new AppError({
        httpStatus: 401,
        type: 'AUTH_ERROR',
        code: 'AUTH_CREDENTIAL_INVALID',
        message: '账号与密码不匹配'
      });
    }

    const authUser = toAuthUser(validUser);
    const tokenPair = await createTokenPair(authUser);
    setRefreshTokenCookie(res, tokenPair.refreshToken, tokenPair.refreshTokenExpiresAt);

    await pool.query(
      'UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?',
      [validUser.id]
    );

    sendSuccess(res, '登录成功', {
      accessToken: tokenPair.accessToken,
      user: authUser
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = getRefreshTokenFromCookie(req);
    const tokenPair = await rotateRefreshToken(refreshToken);
    setRefreshTokenCookie(res, tokenPair.refreshToken, tokenPair.refreshTokenExpiresAt);

    sendSuccess(res, '刷新成功', {
      accessToken: tokenPair.accessToken
    });
  } catch (error) {
    next(error);
  }
};

export const logout = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const refreshToken = getRefreshTokenFromCookie(req);
    await revokeRefreshToken(refreshToken);
    clearRefreshTokenCookie(res);
    sendSuccess(res, '退出登录成功', null);
  } catch (error) {
    clearRefreshTokenCookie(res);
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user) {
      throw new AppError({
        httpStatus: 401,
        type: 'AUTH_ERROR',
        code: 'AUTH_TOKEN_MISSING',
        message: '缺少登录凭证'
      });
    }

    sendSuccess(res, 'success', req.user);
  } catch (error) {
    next(error);
  }
};

const createUniqueAccountNo = async (): Promise<string> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const accountNo = generateAccountNo();
    const [rows] = await pool.query(
      'SELECT id FROM users WHERE account_no = ? LIMIT 1',
      [accountNo]
    );

    if ((rows as Array<{ id: number }>).length === 0) {
      return accountNo;
    }
  }

  throw new AppError({
    httpStatus: 500,
    type: 'INTERNAL_ERROR',
    code: 'INTERNAL_ERROR',
    message: '账号生成失败，请稍后重试'
  });
};

const findUserByAccountNo = async (accountNo: string): Promise<UserRow | null> => {
  const [rows] = await pool.query(
    `SELECT id, account_no, user_name, password_hash, status
     FROM users
     WHERE account_no = ?
     LIMIT 1`,
    [accountNo]
  );
  const userRows = rows as UserRow[];
  return userRows[0] ?? null;
};

const toAuthUser = (user: UserRow): AuthUser => ({
  userID: user.id,
  accountNo: user.account_no,
  displayName: user.user_name,
  status: user.status
});

const getRefreshTokenFromCookie = (req: Request): string => {
  const cookieValue = parseCookie(req.headers.cookie ?? '', refreshCookieName);

  if (typeof cookieValue !== 'string' || !cookieValue) {
    throw new AppError({
      httpStatus: 401,
      type: 'AUTH_ERROR',
      code: 'AUTH_REFRESH_MISSING',
      message: '刷新凭证缺失，请重新登录'
    });
  }

  return cookieValue;
};

const parseCookie = (cookieHeader: string, name: string): string | undefined => {
  const cookies = cookieHeader.split(';');

  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const cookieName = cookie.slice(0, separatorIndex).trim();
    if (cookieName !== name) {
      continue;
    }

    return decodeURIComponent(cookie.slice(separatorIndex + 1).trim());
  }

  return undefined;
};

const setRefreshTokenCookie = (res: Response, refreshToken: string, expiresAt: Date): void => {
  res.cookie(refreshCookieName, refreshToken, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    expires: expiresAt,
    path: '/api/v1/auth'
  });
};

const clearRefreshTokenCookie = (res: Response): void => {
  res.clearCookie(refreshCookieName, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/api/v1/auth'
  });
};
