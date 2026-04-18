import axios from 'axios';
import { useAuthStore } from '@/store/auth.store';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api/v1';

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

apiClient.interceptors.request.use(config => {
  const token = useAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

apiClient.interceptors.response.use(
  res => res,
  async err => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const { refreshToken, setTokens, logout } = useAuthStore.getState();
      if (refreshToken) {
        try {
          const res = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefresh } = res.data;
          setTokens(accessToken, newRefresh);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch {
          logout();
        }
      } else {
        logout();
      }
    }
    return Promise.reject(err);
  }
);

export default apiClient;
