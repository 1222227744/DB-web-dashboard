import axios from "axios";
import router from '../router/index'
import { ElMessage } from "element-plus";
import { clearAuthState, getAccessToken, setAccessToken } from "./auth";

declare module 'axios' {
  export interface AxiosRequestConfig {
    silentError?: boolean;
    _retry?: boolean;
  }
}

// 1、创建Axios实例
const service = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 10000,
  withCredentials: true,
});

let refreshPromise: Promise<string> | null = null;

// 2、请求拦截器，自动塞入token
service.interceptors.request.use(
  (config) => {
    const token = getAccessToken();

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
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;
    const isSilentError = Boolean(originalRequest?.silentError);
    const status = error.response?.status;
    const backendMessage = error.response?.data?.message;

    if (status === 401 && originalRequest && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
      originalRequest._retry = true;

      try {
        const newAccessToken = await refreshAccessToken();
        originalRequest.headers['Authorization'] = `Bearer ${newAccessToken}`;
        return service(originalRequest);
      } catch (refreshError) {
        clearAuthState();
        router.push('/login');
        if (!isSilentError) {
          ElMessage.error('登录状态已失效，请重新登录');
        }
        return Promise.reject(refreshError);
      }
    }

    let errorMsg = backendMessage || '网络异常，请稍后再试';

    if (status === 401) {
      clearAuthState();
      router.push('/login');
    }

    if (!isSilentError) {
      ElMessage.error(errorMsg);
    }

    return Promise.reject(error);
  }
);

const refreshAccessToken = async (): Promise<string> => {
  if (!refreshPromise) {
    refreshPromise = service.post('/v1/auth/refresh')
      .then((res: any) => {
        const accessToken = res.data.accessToken;
        setAccessToken(accessToken);
        return accessToken;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
};

export default service;
