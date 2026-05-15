import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

// 加载 .env 文件中的环境变量到 process.env 内存中
dotenv.config();


// 创建 TCP 数据库连接池
const pool = mysql.createPool({
    host: process.env.DB_HOST as string,
    user: process.env.DB_USER as string,
    password: process.env.DB_PASSWORD as string,
    database: process.env.DB_NAME as string,
    waitForConnections: true,
    connectionLimit: 10, // 维持 10 个 TCP 长连接复用
    queueLimit: 0
});

// 测试连接是否畅通
pool.getConnection()
    .then(conn => {
        console.log('✅ 数据库 DB_App 连接池就绪！');
        conn.release(); // 测试完立刻把连接放回池子里
    })
    .catch(err => {
        console.error('❌ 数据库连接失败:', err);
    });

export default pool;