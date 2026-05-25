import { AppError } from '../errors/AppError.js';

const identifierPattern = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

export const validateSqlIdentifier = (value: unknown, label: string): string => {
  if (typeof value !== 'string') {
    throwIdentifierError(`${label}不能为空`);
  }

  const identifier = (value as string).trim();

  if (!identifier) {
    throwIdentifierError(`${label}不能为空`);
  }

  if (!identifierPattern.test(identifier)) {
    throwIdentifierError(`${label}需以英文字母开头，只能包含英文字母、数字和下划线，长度为 1 到 64 位`);
  }

  return identifier;
};

export const quoteIdentifier = (identifier: string): string => {
  return `\`${identifier.replaceAll('`', '``')}\``;
};

export const throwIdentifierError = (message: string): never => {
  throw new AppError({
    httpStatus: 400,
    type: 'VALIDATION_ERROR',
    code: 'VALIDATION_IDENTIFIER_INVALID',
    message
  });
};
