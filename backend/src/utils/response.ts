import { type Response } from 'express';
import { randomUUID } from 'node:crypto';

export const sendSuccess = <T>(
  res: Response,
  message: string,
  data: T
): void => {
  res.status(200).json({
    code: 200,
    message,
    data,
    traceId: randomUUID()
  });
};
