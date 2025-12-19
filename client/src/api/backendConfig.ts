/**
 * Returns the configured API base (without trailing slash) for backend routes.
 * Falls back to an empty string so callers can use relative `/api/*` paths.
 */
export function getApiBase(): string {
  const raw = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) || '';
  if (!raw || typeof raw !== 'string') return '';
  return raw.replace(/\/+$/, '');
}
