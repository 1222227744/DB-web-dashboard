import dotenv from 'dotenv';

dotenv.config();

const optionalEnv = (name: string, defaultValue: string): string => {
  const value = process.env[name];

  if (!value) {
    return defaultValue;
  }

  return value;
};

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`缺少必要环境变量：${name}`);
  }

  return value;
};

const toNumber = (name: string, value: string): number => {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数`);
  }

  return numberValue;
};

export const env = {
  port: toNumber('PORT', optionalEnv('PORT', '3000')),
  corsOrigin: optionalEnv('CORS_ORIGIN', 'http://localhost:5173'),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  dbHost: requiredEnv('DB_HOST'),
  dbUser: requiredEnv('DB_USER'),
  dbPassword: requiredEnv('DB_PASSWORD'),
  dbName: requiredEnv('DB_NAME'),
  jwtAccessSecret: requiredEnv('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: requiredEnv('JWT_REFRESH_SECRET'),
  assetStorageDir: optionalEnv('ASSET_STORAGE_DIR', 'storage/assets')
};
