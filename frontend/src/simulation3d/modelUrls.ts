/// <reference types="vite/client" />

const DEFAULT_MODEL_BASE_URL = '/models';
const PROBE_TIMEOUT_MS = 8000;
const resolvedModelUrls = new Set<string>();
let runtimeContextLogged = false;

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

function logRuntimeContext(baseUrl: string): void {
  if (!import.meta.env.DEV || runtimeContextLogged || typeof window === 'undefined') return;
  runtimeContextLogged = true;

  console.info('[model-probe] page origin:', window.location.origin);
  console.info('[model-probe] page href:', window.location.href);
  console.info('[model-probe] secure context:', window.isSecureContext);
  console.info('[model-probe] configured model base url:', baseUrl);
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

async function probeModelUrl(url: string): Promise<void> {
  if (!import.meta.env.DEV || typeof window === 'undefined') return;

  console.groupCollapsed(`[model-probe] ${url}`);

  try {
    const corsHead = await fetchWithTimeout(url, {
      method: 'HEAD',
      mode: 'cors',
      cache: 'no-store',
    });
    console.info('[model-probe] cors HEAD ok:', {
      status: corsHead.status,
      contentType: corsHead.headers.get('content-type'),
      accessControlAllowOrigin: corsHead.headers.get('access-control-allow-origin'),
      timingAllowOrigin: corsHead.headers.get('timing-allow-origin'),
    });
  } catch (error) {
    console.error('[model-probe] cors HEAD failed:', error);
  }

  try {
    const opaqueHead = await fetchWithTimeout(url, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
    });
    console.info('[model-probe] no-cors HEAD result:', {
      type: opaqueHead.type,
      status: opaqueHead.status,
      ok: opaqueHead.ok,
    });
  } catch (error) {
    console.error('[model-probe] no-cors HEAD failed:', error);
  }

  console.groupEnd();
}

export function getModelUrl(fileName: string): string {
  const baseUrl = import.meta.env.VITE_MODEL_BASE_URL ?? DEFAULT_MODEL_BASE_URL;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const resolvedUrl = `${normalizedBaseUrl}/${fileName}`;

  if (import.meta.env.DEV && typeof window !== 'undefined') {
    logRuntimeContext(normalizedBaseUrl);

    if (!resolvedModelUrls.has(resolvedUrl)) {
      resolvedModelUrls.add(resolvedUrl);
      console.info(`[model-probe] resolved ${fileName} -> ${resolvedUrl}`);
      void probeModelUrl(resolvedUrl);
    }
  }

  return resolvedUrl;
}
