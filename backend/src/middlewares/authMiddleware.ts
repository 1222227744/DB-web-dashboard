import { type RequestHandler } from 'express';
import pool from '../config/db.js';
import { AppError } from '../errors/AppError.js';
import { verifyAccessToken } from '../services/tokenService.js';
import { type AuthUser } from '../types/auth.js';

type UserRow = {
  id: number;
  account_no: string;
  user_name: string;
  status: 'active' | 'disabled';
};

export const authMiddleware: RequestHandler = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new AppError({
        httpStatus: 401,
        type: 'AUTH_ERROR',
        code: 'AUTH_TOKEN_MISSING',
        message: '缺少登录凭证'
      });
    }

    const token = authHeader.slice('Bearer '.length);
    const payload = verifyAccessToken(token);

    const [rows] = await pool.query(
      `SELECT id, account_no, user_name, status
       FROM users
       WHERE id = ? AND account_no = ?
       LIMIT 1`,
      [Number(payload.sub), payload.accountNo]
    );
    const userRows = rows as UserRow[];
    const user = userRows[0];

    if (!user) {
      throw new AppError({
        httpStatus: 401,
        type: 'AUTH_ERROR',
        code: 'AUTH_TOKEN_INVALID',
        message: '登录凭证无效，请重新登录'
      });
    }

    if (user.status !== 'active') {
      throw new AppError({
        httpStatus: 403,
        type: 'AUTHZ_ERROR',
        code: 'AUTH_USER_DISABLED',
        message: '账号已被禁用'
      });
    }

    const authUser: AuthUser = {
      userID: user.id,
      accountNo: user.account_no,
      displayName: user.user_name,
      status: user.status
    };
    req.user = authUser;
    next();
  } catch (error) {
    next(error);
  }
};
