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

// ============================================================================
// RETRY LOGIC - Automatic retries for failed API calls with exponential backoff
// ============================================================================

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  onRetry?: (attempt: number, error: AxiosError, nextDelayMs: number) => void;
  onError?: (error: AxiosError) => void;
}

// Determine if an error is retryable
const isRetryableError = (error: AxiosError): boolean => {
  const status = error.response?.status;
  const code = (error as any).code;

  // Retryable HTTP status codes: timeouts, rate limits, server errors
  if (status === 408 || status === 429 || (status !== undefined && status >= 500)) {
    return true;
  }

  // Retryable network errors
  const retryableNetworkErrors = [
    'ECONNABORTED',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ENETUNREACH',
    'ETIMEDOUT',
    'ERR_NETWORK',
    'ERR_FR_TOO_MANY_REDIRECTS',
  ];

  if (code && retryableNetworkErrors.includes(code)) {
    return true;
  }

  // Non-retryable: client errors (except 408/429), auth errors
  if (status !== undefined && status >= 400 && status < 500) {
    return false;
  }

  return false;
};

// Calculate delay with exponential backoff and optional jitter
const calculateDelay = (
  attempt: number,
  initialDelayMs: number = 1000,
  maxDelayMs: number = 32000,
  jitter: boolean = true
): number => {
  // Exponential backoff: 2^(attempt-1) * initialDelayMs
  const exponentialDelay = Math.min(
    Math.pow(2, attempt - 1) * initialDelayMs,
    maxDelayMs
  );

  if (!jitter) return exponentialDelay;

  // Add jitter: ±20%
  const jitterAmount = exponentialDelay * 0.2;
  const minDelay = exponentialDelay - jitterAmount;
  const maxDelay = exponentialDelay + jitterAmount;

  return minDelay + Math.random() * (maxDelay - minDelay);
};

// Wrapper for API calls with automatic retry logic
export const withRetry = async <T>(
  apiCall: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> => {
  const {
    maxRetries = 3,
    initialDelayMs = 1000,
    maxDelayMs = 32000,
    jitter = true,
    onRetry,
    onError,
  } = options;

  let lastError: AxiosError | null = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await apiCall();
    } catch (error) {
      lastError = error as AxiosError;

      // If not retryable or max retries reached, throw
      if (!isRetryableError(lastError) || attempt > maxRetries) {
        onError?.(lastError);
        throw error;
      }

      // Calculate delay and wait
      const delayMs = calculateDelay(
        attempt,
        initialDelayMs,
        maxDelayMs,
        jitter
      );

      onRetry?.(attempt, lastError, delayMs);

      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  // Should not reach here, but throw if it does
  if (lastError) {
    onError?.(lastError);
    throw lastError;
  }

  throw new Error('Unexpected error in retry wrapper');
};

export default agentAPI;
