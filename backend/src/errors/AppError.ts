export type ErrorType =
  | 'VALIDATION_ERROR'
  | 'AUTH_ERROR'
  | 'AUTHZ_ERROR'
  | 'RESOURCE_NOT_FOUND'
  | 'RESOURCE_CONFLICT'
  | 'INTERNAL_ERROR';

type AppErrorOptions = {
  httpStatus: number;
  type: ErrorType;
  code: string;
  message: string;
  details?: string;
};

export class AppError extends Error {
  readonly httpStatus: number;
  readonly type: ErrorType;
  readonly code: string;
  readonly details: string | undefined;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.httpStatus = options.httpStatus;
    this.type = options.type;
    this.code = options.code;
    this.details = options.details;
  }
}
