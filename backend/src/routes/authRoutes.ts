import { Router } from 'express';
// 稍后我们会去 controller 里写这个具体的函数
import { register, login } from '../controllers/authController.js'; 

const router = Router();

// 当收到针对 /register 的 POST 请求时，执行 authController 里的 register 函数
router.post('/register', register);
router.post('/login', login)

export default router;