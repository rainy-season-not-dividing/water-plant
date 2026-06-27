/// <reference types="vite/client" />

const DEFAULT_MODEL_BASE_URL = 'https://static.whyfjz.com/waterplant/models';

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

export function getModelUrl(fileName: string): string {
  const baseUrl = import.meta.env.VITE_MODEL_BASE_URL ?? DEFAULT_MODEL_BASE_URL;
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  return `${normalizedBaseUrl}/${fileName}`;
}
