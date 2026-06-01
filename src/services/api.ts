/**
 * API 封装（axios + token 管理）
 *
 * 关键设计：
 * - 防止 refresh token 过期时的无限循环
 * - 防止多个请求同时刷新 token 的竞态
 * - 启动时不验证 token 有效性（交给 API 返回 401 时再处理）
 */

import axios, { AxiosError } from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// ---- Token 管理 ----

function getToken() {
  return localStorage.getItem('cowcat_token');
}

function getRefreshToken() {
  return localStorage.getItem('cowcat_refresh');
}

function saveTokens(token: string, refreshToken: string) {
  localStorage.setItem('cowcat_token', token);
  localStorage.setItem('cowcat_refresh', refreshToken);
}

function clearTokens() {
  localStorage.removeItem('cowcat_token');
  localStorage.removeItem('cowcat_refresh');
}

// 防止并发 refresh 的锁
let isRefreshing = false;
// 在 refresh 期间排队的请求
let pendingQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: any) => void;
}> = [];

function processQueue(error: any, token?: string) {
  pendingQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error);
    } else {
      resolve(token!);
    }
  });
  pendingQueue = [];
}

// ---- 请求拦截器 ----

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ---- 响应拦截器 ----

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const url = originalRequest.url || '';

    // 登录接口的 401 不拦截——那是密码错误
    if (error.response?.status === 401 && url.includes('/admin/auth') && !url.includes('/refresh')) {
      return Promise.reject(error);
    }

    // refresh 接口自身的 401——refresh token 过期，直接登出
    if (error.response?.status === 401 && url.includes('/admin/auth/refresh')) {
      clearTokens();
      window.dispatchEvent(new CustomEvent('auth:expired'));
      return Promise.reject(error);
    }

    // 其他接口的 401 → token 过期，尝试刷新
    if (error.response?.status === 401) {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        clearTokens();
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject(error);
      }

      // 防止重复刷新：如果正在刷新，加入队列等待
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push({
            resolve: (newToken: string) => {
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      isRefreshing = true;

      try {
        const res = await axios.post('/api/admin/auth/refresh', { refreshToken });
        const { token, refreshToken: newRefreshToken } = res.data;

        saveTokens(token, newRefreshToken || refreshToken);

        // 先解锁，再处理排队请求 — 避免新 401 请求在队列排空后永久挂起
        isRefreshing = false;
        processQueue(null, token);

        // 重试原请求
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        isRefreshing = false;
        processQueue(refreshError);
        clearTokens();
        // 使用自定义事件而非 window.location.href，避免整页重载（保留 React 状态，更快）
        window.dispatchEvent(new CustomEvent('auth:expired'));
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  },
);

// ---- 公开接口 ----

export async function getSpeak() {
  const res = await api.get('/speak');
  return res.data;
}

// ---- 鉴权 ----

export async function login(password: string) {
  const res = await api.post('/admin/auth', { password });
  return res.data;
}

export async function changePassword(oldPassword: string, newPassword: string) {
  const res = await api.put('/admin/password', { oldPassword, newPassword });
  return res.data;
}

// ---- 提示词 ----

export async function getPrompts() {
  const res = await api.get('/admin/prompts');
  return Array.isArray(res.data) ? res.data : [];
}

export async function createPrompt(data: any) {
  const res = await api.post('/admin/prompts', data);
  return res.data;
}

export async function updatePrompt(id: string, data: any) {
  const res = await api.put('/admin/prompts', data, { params: { id } });
  return res.data;
}

export async function deletePrompt(id: string) {
  const res = await api.delete('/admin/prompts', { params: { id } });
  return res.data;
}

// ---- 语料库 ----

export async function getCorpus(params?: any) {
  const res = await api.get('/admin/corpus', { params });
  const data = res.data;
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 50,
  };
}

export async function createCorpus(data: any) {
  const res = await api.post('/admin/corpus', data);
  return res.data;
}

export async function batchImportCorpus(items: any[]) {
  const res = await api.post('/admin/corpus', { batch: true, items });
  return res.data;
}

export async function updateCorpus(id: string, data: any) {
  const res = await api.put('/admin/corpus', data, { params: { id } });
  return res.data;
}

export async function deleteCorpus(id: string) {
  const res = await api.delete('/admin/corpus', { params: { id } });
  return res.data;
}

// ---- 设置 ----

export async function getSettings() {
  const res = await api.get('/admin/settings');
  return res.data;
}

export async function updateSettings(data: any) {
  const res = await api.put('/admin/settings', data);
  return res.data;
}

// ---- 生成 ----

export async function triggerGenerate(prompt?: string) {
  const res = await api.post('/admin/generate', { prompt: prompt || '' });
  return res.data;
}

// ---- 日志 ----

export async function getLogs(params?: any) {
  const res = await api.get('/admin/logs', { params });
  const data = res.data;
  return {
    items: Array.isArray(data?.items) ? data.items : [],
    total: data?.total ?? 0,
    page: data?.page ?? 1,
    pageSize: data?.pageSize ?? 20,
  };
}

export async function exportLogs(params?: any) {
  // 使用 axios 发送请求，token 由拦截器自动附加
  const res = await api.get('/admin/logs/export', {
    params,
    responseType: 'blob',
  });
  return res.data;
}

// ---- 内容管理 ----

export async function getContent() {
  const res = await api.get('/admin/content');
  return res.data;
}

export async function updateContent(content: any) {
  const res = await api.put('/admin/content', { content });
  return res.data;
}

export default api;
