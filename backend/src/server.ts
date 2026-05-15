import express from 'express';
import dotenv from 'dotenv';
import authRoutes from './routes/authRoutes.js';
import cors from 'cors'

// 导入.env中的变量
dotenv.config();
// 初始化
const app = express();
// 使用中间件来处理json数据
app.use(cors())
app.use(express.json());
// 路由挂载：把所有以 /api/v1/auth 开头的请求，都扔给 authRoutes 去分发处理
app.use('/api/v1/auth', authRoutes);
// 设定该后端服务跑在哪个端口
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});