const STORAGE_KEY = 'brandSafetyApiBaseUrl';
let queryApplied = false;

function normalizeBaseUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

function applyQueryParamOverride() {
  if (typeof window === 'undefined' || queryApplied) return;
  queryApplied = true;
  const params = new URLSearchParams(window.location.search);
  const queryBase = params.get('apiBase');
  if (queryBase) {
    setBrandSafetyBaseUrl(queryBase);
  }
}

export function getCustomBrandSafetyBaseUrl(): string | null {
  if (typeof window === 'undefined') return null;
  applyQueryParamOverride();
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored ? normalizeBaseUrl(stored) : null;
}

export function getBrandSafetyBaseUrl(): string {
  const envBase = import.meta.env?.VITE_BRAND_SAFETY_API_BASE?.trim();
  const customBase = getCustomBrandSafetyBaseUrl();
  return normalizeBaseUrl(customBase || envBase || '/api/brand-safety');
}

export function setBrandSafetyBaseUrl(url: string) {
  if (typeof window === 'undefined') return;
  const normalized = normalizeBaseUrl(url);
  if (!normalized) {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }
  window.localStorage.setItem(STORAGE_KEY, normalized);
}

export function clearBrandSafetyBaseUrl() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isUsingDefaultBrandSafetyBase(): boolean {
  const envBase = import.meta.env?.VITE_BRAND_SAFETY_API_BASE?.trim();
  const customBase = getCustomBrandSafetyBaseUrl();
  const effective = normalizeBaseUrl(customBase || envBase || '/api/brand-safety');
  const defaultBase = normalizeBaseUrl(envBase || '/api/brand-safety');
  return effective === defaultBase;
}
