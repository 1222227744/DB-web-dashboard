import express from 'express';
import authRoutes from './routes/authRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import databaseRoutes from './routes/databaseRoutes.js';
import statsRoutes from './routes/statsRoutes.js';
import userRoutes from './routes/userRoutes.js';
import cors from 'cors';
import { env } from './config/env.js';
import { verifyDatabaseConnection } from './config/db.js';
import { ensureSystemSchema } from './config/systemSchema.js';
import { errorMiddleware, notFoundMiddleware } from './middlewares/errorMiddleware.js';

const app = express();

app.use(cors({
  origin: env.corsOrigin,
  credentials: true
}));
app.use(express.json({
  limit: '12mb'
}));

app.get('/api/v1/health', (_req, res) => {
  res.status(200).json({
    code: 200,
    message: 'ok',
    data: {
      service: 'DB Application API',
      env: env.nodeEnv
    }
  });
});

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/audit-logs', auditRoutes);
app.use('/api/v1/databases', databaseRoutes);
app.use('/api/v1/stats', statsRoutes);
app.use('/api/v1/users', userRoutes);
app.use(notFoundMiddleware);
app.use(errorMiddleware);

const startServer = async (): Promise<void> => {
  try {
    await verifyDatabaseConnection();
    console.log(`✅ 数据库 ${env.dbName} 连接池就绪`);
    await ensureSystemSchema();
    console.log('✅ 系统数据表检查完成');

    app.listen(env.port, () => {
      console.log(`🚀 Server running on port ${env.port}`);
    });
  } catch (error) {
    console.error('❌ 服务启动失败:', error);
    process.exit(1);
  }
};

void startServer();
