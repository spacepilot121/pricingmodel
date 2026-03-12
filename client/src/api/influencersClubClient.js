// Lightweight client for Influencers.club with localStorage caching and rate-limit aware fetches.
// This module intentionally avoids logging secrets or responses.
import { getApiBase } from './backendConfig';

const PRIMARY_BASE_URL = 'https://api-dashboard.influencers.club/public/v1';
const LEGACY_BASE_URL = 'https://api.influencers.club/v1';
const DISCOVERY_PATH = '/discovery/';
const CONTENT_POSTS_PATH = '/creators/content/posts/';
const CACHE_KEY = 'influencersClub_cache_v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const ENDPOINTS = {
  profile: { apiPath: DISCOVERY_PATH, proxyPath: 'discovery' },
  posts: { apiPath: CONTENT_POSTS_PATH, proxyPath: 'posts' }
};

function normalizePlatform(platform) {
  return String(platform || 'youtube').trim().toLowerCase();
}

function buildDiscoveryPayload(handle, platform, limit = 1) {
  const query = String(handle || '').trim();
  return {
    platform: normalizePlatform(platform),
    paging: { limit, page: 0 },
    sort: { sort_by: 'relevancy', sort_order: 'desc' },
    filters: {
      ai_search: query,
      channel_url: query.startsWith('http') ? [query] : undefined,
      exclude_role_based_emails: false,
      exclude_previous: false
    }
  };
}

function getApiKey() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem('influencersClub_apiKey') || '').trim();
}

function loadCache() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function persistCache(cache) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Unable to persist Influencers.club cache', err);
  }
}

function buildCacheKey(kind, handle, platform) {
  return `${kind}:${(platform || 'unknown').toLowerCase()}:${(handle || '').toLowerCase()}`;
}

function getCached(kind, handle, platform) {
  const cache = loadCache();
  const key = buildCacheKey(kind, handle, platform);
  const entry = cache[key];
  if (!entry) return null;
  if (Date.now() - entry.timestamp > TTL_MS) return null;
  return entry.data;
}

function setCached(kind, handle, platform, data) {
  const cache = loadCache();
  const key = buildCacheKey(kind, handle, platform);
  cache[key] = { timestamp: Date.now(), data };
  persistCache(cache);
}

function buildProxyUrl(proxyPath) {
  const base = getApiBase() || '';
  return proxyPath ? `${base}/api/influencers-club/${proxyPath}` : '';
}

function buildDirectUrls(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return [`${PRIMARY_BASE_URL}${suffix}`, `${LEGACY_BASE_URL}${suffix}`];
}

function withDocsAuthHeaders(apiKey) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    'x-api-key': apiKey,
    'api-key': apiKey
  };
}

function asDocsDiscoveryPayload(payload) {
  const source = payload && typeof payload === 'object' ? payload : {};
  if (source.filters || source.paging || source.sort || source.platform) {
    return source;
  }

  const query = String(source.handle || source.ai_search || '').trim();
  return {
    platform: normalizePlatform(source.platform || 'youtube'),
    paging: { limit: Number(source.limit) || 1, page: 0 },
    sort: { sort_by: 'relevancy', sort_order: 'desc' },
    filters: {
      ai_search: query,
      exclude_role_based_emails: false,
      exclude_previous: false
    }
  };
}

function isLikelyNetworkError(err) {
  return err?.message === 'Failed to fetch' || err?.name === 'TypeError' || !err?.status;
}

function shouldFallbackToProxy(err) {
  const status = Number(err?.status || 0);
  if (isLikelyNetworkError(err)) return true;
  return status === 404 || status === 405;
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload || {})
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message || data?.error || data?.message || `Request failed with ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function fetchWithAuth(endpointKey, payload, kind, handle, platform) {
  const endpointConfig = ENDPOINTS[endpointKey];
  if (!endpointConfig) {
    throw new Error('Unknown Influencers.club endpoint.');
  }

  const cached = getCached(kind, handle, platform);
  if (cached) return cached;

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Influencers.club API key is missing.');
  }

  const directHeaders = withDocsAuthHeaders(apiKey);
  const requestPayload = endpointKey === 'profile' ? asDocsDiscoveryPayload(payload) : payload;

  const tryProxy = async (directError) => {
    const proxyUrl = buildProxyUrl(endpointConfig.proxyPath);
    if (!proxyUrl) {
      throw directError;
    }
    try {
      return await postJson(proxyUrl, { ...(requestPayload || {}), apiKey }, directHeaders);
    } catch (proxyErr) {
      const proxyMessage =
        proxyErr?.message || proxyErr?.response?.data?.error?.message || 'Proxy request failed.';
      const combined = [
        directError?.message || 'Influencers.club request failed.',
        `Proxy: ${proxyMessage}`,
        'If you are using a static host (e.g. GitHub Pages), run the backend server and ensure /api/influencers-club/* routes are reachable.'
      ].join(' ');
      const error = new Error(combined);
      error.status = proxyErr?.status || proxyErr?.response?.status;
      throw error;
    }
  };

  let data;
  let lastDirectError = null;
  for (const directUrl of buildDirectUrls(endpointConfig.apiPath)) {
    try {
      data = await postJson(directUrl, requestPayload, directHeaders);
      break;
    } catch (err) {
      lastDirectError = err;
      if (!shouldFallbackToProxy(err)) {
        throw err;
      }
    }
  }

  if (!data) {
    data = await tryProxy(lastDirectError);
  }

  setCached(kind, handle, platform, data);
  return data;
}

export async function fetchCreatorProfile(handle, platform) {
  const payload = buildDiscoveryPayload(handle, platform, 1);
  return fetchWithAuth('profile', payload, 'profile', handle, platform);
}

export async function fetchRecentPosts(handle, platform) {
  const payload = {
    platform: normalizePlatform(platform),
    handle: String(handle || '').trim(),
    count: 12,
    pagination_token: ''
  };

  const data = await fetchWithAuth('posts', payload, 'posts', handle, platform);
  return Array.isArray(data?.result?.items) ? data.result.items : [];
}

export function clearInfluencersClubCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CACHE_KEY);
}
