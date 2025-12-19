const STORAGE_KEY = 'api_base_override';
const QUERY_PARAM = 'apiBase';

function sanitizeBase(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw.trim().replace(/\/+$/, '');
}

function readQueryOverride(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    return sanitizeBase(params.get(QUERY_PARAM));
  } catch {
    return '';
  }
}

function readStoredOverride(): string {
  if (typeof window === 'undefined') return '';
  try {
    return sanitizeBase(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return '';
  }
}

function readEnvBase(): string {
  const raw = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';
  return sanitizeBase(raw);
}

function resolveApiBase(storedOverride?: string | null): string {
  const fromQuery = readQueryOverride();
  if (fromQuery) return fromQuery;

  const fromStorage = storedOverride === undefined ? readStoredOverride() : sanitizeBase(storedOverride);
  if (fromStorage) return fromStorage;

  return readEnvBase();
}

let cachedApiBase: string | null = null;

/**
 * Returns the configured API base (without trailing slash) for backend routes.
 * Priority: `?apiBase=` query param, stored override, then Vite env var.
 * Falls back to an empty string so callers can use relative `/api/*` paths.
 */
export function getApiBase(): string {
  if (cachedApiBase !== null) return cachedApiBase;
  cachedApiBase = resolveApiBase();
  return cachedApiBase;
}

/**
 * Persists a user-supplied API base (or clears it when empty) and returns the
 * resolved base that will be used for requests.
 */
export function saveApiBase(raw: string): string {
  const sanitized = sanitizeBase(raw);

  if (typeof window !== 'undefined') {
    try {
      if (sanitized) {
        window.localStorage.setItem(STORAGE_KEY, sanitized);
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore storage errors (e.g., private mode)
    }
  }

  cachedApiBase = resolveApiBase(sanitized || null);
  return cachedApiBase;
}

/**
 * Returns the stored override without considering query params or env vars.
 * Useful for populating settings inputs.
 */
export function loadStoredApiBase(): string {
  return readStoredOverride();
}
