import axios, { AxiosInstance, AxiosError } from 'axios';

const API_BASE_URL = 'http://127.0.0.1:29999/v1';
let accessToken: string | null = null;

export const agentAPI: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

agentAPI.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

agentAPI.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired, clear it
      accessToken = null;
    }
    return Promise.reject(error);
  }
);

export const setAccessToken = (token: string) => {
  accessToken = token;
};

export const cloudAPI: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_CLOUD_URL || 'http://localhost:3000/api',
  timeout: 10000,
});

cloudAPI.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

export default agentAPI;
