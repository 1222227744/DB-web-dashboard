import { type ErrorRequestHandler, type RequestHandler } from 'express';
import { AppError } from '../errors/AppError.js';

export const notFoundMiddleware: RequestHandler = (req, _res, next) => {
  next(new AppError({
    httpStatus: 404,
    type: 'RESOURCE_NOT_FOUND',
    code: 'ROUTE_NOT_FOUND',
    message: '接口不存在',
    details: `${req.method} ${req.originalUrl}`
  }));
};

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.httpStatus).json({
      code: error.httpStatus,
      message: error.message,
      data: null,
      error: {
        type: error.type,
        code: error.code,
        source: 'server',
        details: error.details ?? null,
        fieldErrors: [],
        mysql: null
      }
    });
    return;
  }

  console.error('【未处理异常】:', error);
  res.status(500).json({
    code: 500,
    message: '服务端异常，请稍后再试',
    data: null,
    error: {
      type: 'INTERNAL_ERROR',
      code: 'INTERNAL_ERROR',
      source: 'server',
      details: null,
      fieldErrors: [],
      mysql: null
    }
  });
};
