import axios from "axios";
import router from '../router/index'
import { ElMessage } from "element-plus";

// 1、创建Axios实例
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,

  timeout: 10000,
});

// 2、请求拦截器，自动塞入token
service.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');

    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 3、响应拦截器（统一报错）
service.interceptors.response.use(
  (response) => {
    const res = response.data;

    if (res.code === 200){
      return res;
    } else {
      ElMessage.error(res.message || '系统业务异常');

      return Promise.reject(new Error(res.message || 'Error'));
    }
  },
  (error) => {
    console.error('响应拦截报错:', error);

    const status = error.response?.status;
    const backendMessage = error.response?.data?.message;

    let errorMsg = backendMessage || '网络异常，请稍后再试';

    if (status === 401) {
      const hasToken = Boolean(localStorage.getItem('token'));

      if (hasToken) {
        localStorage.removeItem('token');
        localStorage.removeItem('userName');
        router.push('/login');
      }
    }

    ElMessage.error(errorMsg);
    return Promise.reject(error);
  }
);

export default service;