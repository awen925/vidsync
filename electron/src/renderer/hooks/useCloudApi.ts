import axios, { AxiosInstance, AxiosError } from 'axios';
import { supabase } from '../lib/supabaseClient';

const API_BASE_URL = 'http://127.0.0.1:29999/v1';
let accessToken: string | null = null;

export const agentAPI: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

agentAPI.interceptors.request.use(async (config) => {
  try {
    // get latest session from supabase client (handles refresh automatically)
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } catch (e) {
    // ignore and proceed without token
  }
  return config;
});

agentAPI.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear it and force re-authentication
      accessToken = null;
      try {
        localStorage.removeItem('token');
      } catch (e) {}
      // Redirect to auth page so user can sign in again (will mount the login UI)
      try {
        if (typeof window !== 'undefined') window.location.href = '/auth';
      } catch (e) {}
    }
    return Promise.reject(error);
  }
);

export const setAccessToken = (token: string) => {
  accessToken = token;
  try {
    localStorage.setItem('token', token);
  } catch (e) {}
};

export const cloudAPI: AxiosInstance = axios.create({
  baseURL: process.env.REACT_APP_CLOUD_URL || 'http://localhost:3000/api',
  timeout: 10000,
});

cloudAPI.interceptors.request.use(async (config) => {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      config.headers = config.headers || {};
      (config.headers as any).Authorization = `Bearer ${token}`;
    }
  } catch (e) {}
  return config;
});

cloudAPI.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      // Clear stored token and redirect to login
      accessToken = null;
      try {
        localStorage.removeItem('token');
      } catch (e) {}
      try {
        if (typeof window !== 'undefined') window.location.href = '/auth';
      } catch (e) {}
    }
    return Promise.reject(error);
  }
);

export default agentAPI;
