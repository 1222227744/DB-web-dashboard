import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

// 1. 定义路由表 (把 URL 映射到对应的组件页面)
const routes: Array<RouteRecordRaw> = [
  {
    path: '/',
    redirect: '/login' // 访问根目录时，自动重定向到登录页
  },
  {
    path: '/login',
    name: 'Login',
    // 懒加载：只有用户访问这个 URL 时，才去加载对应的代码文件，极大地提升网页打开速度
    component: () => import('../views/Login.vue') 
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('../views/Register.vue')
  }
];

// 2. 创建路由实例
const router = createRouter({
  history: createWebHistory(), // 使用 HTML5 模式，URL 里没有丑陋的 # 号
  routes
});

export default router;