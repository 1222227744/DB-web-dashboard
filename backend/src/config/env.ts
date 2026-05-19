import dotenv from 'dotenv';

dotenv.config();

const requiredEnv = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`缺少必要环境变量：${name}`);
  }

  return value;
};

export const env = {
  port: process.env.PORT || '3000',
  dbHost: requiredEnv('DB_HOST'),
  dbUser: requiredEnv('DB_USER'),
  dbPassword: requiredEnv('DB_PASSWORD'),
  dbName: requiredEnv('DB_NAME'),
  jwtSecret: requiredEnv('JWT_SECRET')
};
