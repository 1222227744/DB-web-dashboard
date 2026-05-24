import { type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';                 // 引入数据库连接池
import { generateAccountNo, isValidPassword } from '../utils/helper.js'; // 引入纯工具函数
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js'

// 导出 register 处理函数
export const register = async (req: Request, res: Response) => {
    try {
        // --- 1. 拆解请求 (Parse) ---
        const { userName, password } = req.body;

        // --- 2. 业务校验拦截 (Validate) ---
        if (!userName || !password) {
            return res.status(400).json({
                code: 400,
                message: "请检查是否有必填项为空",
                data: null
            });
        }

        const cleanUserName = userName.trim();
        if (cleanUserName.length < 2 || cleanUserName.length > 20) {
            return res.status(400).json({
                code: 400,
                message: "昵称长度必须为2到20个字符",
                data: null
            });
        }

        // 这里的校验逻辑被极大地简化了，因为我们把它抽到了 helper 里
        if (!isValidPassword(password)) {
            return res.status(400).json({
                code: 400,
                message: "密码必须为8-16位且包含数字和字母",
                data: null
            });
        }

        // --- 3. 核心业务处理 (Process) ---
        let accountNo = '';
        let isUnique = false;

        // 防碰撞机制：生成账号并查库验证
        while (!isUnique) {
            accountNo = generateAccountNo(); // 调用 helper 里的生成函数
            
            // 查询数据库里有没有这个账号
            const [rows]: any = await pool.query(
                'SELECT id FROM users WHERE account_no = ?', 
                [accountNo]
            );
            
            if (rows.length === 0) {
                isUnique = true; // 数据库里没查到，说明这个账号是独一无二的！
            }
        }

        // Bcrypt 密码加密运算
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // --- 4. 持久化落盘 (IO) ---
        await pool.query(
            'INSERT INTO users (user_name, account_no, password_hash) VALUES (?, ?, ?)',
            [cleanUserName, accountNo, passwordHash]
        );

        // --- 5. 统一响应组装 (Respond) ---
        res.status(200).json({
            code: 200,
            message: "注册成功",
            data: {
                accountNo: accountNo,
                userName: cleanUserName
            }
        });

    } catch (error) {
        // 全局兜底捕获异常
        console.error('【注册接口异常】:', error);
        res.status(500).json({
            code: 500,
            message: "服务器繁忙，账号注册失败，请重试",
            data: null
        });
    }
};

export const login = async (req: Request, res: Response) => {
    try{
        const { accountNo, password } = req.body;

        if (typeof accountNo !== 'string' || typeof password !== 'string') {
            return res.status(400).json({
                code: 400,
                message: '登录失败：请填写账号和密码',
                data: null
            });
        }

        const cleanAccountNo = accountNo.trim();

        if (!cleanAccountNo || !password) {
            return res.status(400).json({
                code: 400,
                message: '登录失败：请填写账号和密码',
                data: null
            });
        }

        if (!/^\d{10}$/.test(cleanAccountNo)) {
            return res.status(400).json({
                code: 400,
                message: '登录失败：账号格式不正确',
                data: null
            });
        }

        const [rows]: any = await pool.query(
            'SELECT id, user_name, password_hash FROM users WHERE account_no = ?', 
            [cleanAccountNo]
        )

        const user = rows[0]

        if (!user){
            return res.status(401).json({
                code: 401,
                message: "登录失败：账号或密码错误",
                data: null
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password_hash)

        if (!isPasswordValid){
            return res.status(401).json({
                code: 401,
                message: "登录失败：账号或密码错误",
                data: null
            });
        }

        const token = jwt.sign(
            {
                userID: user.id,
                accountNo: cleanAccountNo
            },
            env.jwtAccessSecret,
            { expiresIn: '7d'}  // 设置过期时间
        )

        res.status(200).json({
            code: 200,
            message: "登录成功",
            data: {
                token: token, 
                userName: user.user_name    // 数据库中拿出的昵称
            }
        })

    }catch(error){
        console.error('【登录接口异常】:', error);
        res.status(500).json({
            code: 500,
            message: "服务器繁忙，登录失败，请稍后再试",
            data: null
        });
    }
}
