/// <reference types="vite/client" />

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 10000;
const COCKPIT_TIMEOUT_MS = 20000;
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

function resolveTimeout(endpoint: string): number {
  return endpoint.startsWith('/cockpit/') ? COCKPIT_TIMEOUT_MS : REQUEST_TIMEOUT_MS;
}

function resolveMaxRetries(endpoint: string): number {
  return endpoint.startsWith('/cockpit/') ? 1 : MAX_RETRIES;
}

export async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  const init: RequestInit = {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  };

  let lastError: Error | null = null;
  const timeoutMs = resolveTimeout(endpoint);
  const maxRetries = resolveMaxRetries(endpoint);

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, init, timeoutMs);
      if (res.ok) {
        const contentType = res.headers.get('content-type') ?? '';
        if (!contentType.includes('application/json')) {
          const body = await res.text();
          const hint = body.trim().startsWith('<')
            ? '前端资源版本与后端接口可能不一致，请强制刷新页面后重试'
            : `接口返回了非 JSON 内容：${contentType || 'unknown'}`;
          throw new Error(`API invalid response: ${endpoint}. ${hint}`);
        }
        return res.json() as Promise<T>;
      }
      if (!isRetryable(res.status) || attempt === maxRetries) {
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
      if (attempt === maxRetries) break;
    }
    await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * 2 ** attempt));
  }

  throw lastError ?? new Error(`API failed: ${endpoint}`);
}
