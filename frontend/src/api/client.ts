/// <reference types="vite/client" />

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10000;
const INITIAL_BACKOFF_MS = 500;

function isRetryable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429;
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const init: RequestInit = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, REQUEST_TIMEOUT_MS);
      if (res.ok) {
        return res.json() as Promise<T>;
      }
      if (!isRetryable(res.status) || attempt === MAX_RETRIES) {
        throw new Error(`API ${res.status}: ${endpoint}`);
      }
      lastError = new Error(`API ${res.status}: ${endpoint}`);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        lastError = new Error(`API timeout: ${endpoint}`);
      } else if (e instanceof Error && e.message.startsWith('API ')) {
        throw e;
      } else {
        lastError = e instanceof Error ? e : new Error(String(e));
      }
      if (attempt === MAX_RETRIES) break;
    }
    await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** attempt));
  }

  throw lastError ?? new Error(`API failed: ${endpoint}`);
}
