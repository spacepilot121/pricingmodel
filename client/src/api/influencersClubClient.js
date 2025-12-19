// Lightweight client for Influencers.club with localStorage caching and rate-limit aware fetches.
// This module intentionally avoids logging secrets or responses.
import { getApiBase } from './backendConfig';

const PRIMARY_BASE_URL = 'https://api-dashboard.influencers.club/public/v1';
const LEGACY_BASE_URL = 'https://api.influencers.club/v1';
const DISCOVERY_PATH = '/discovery/';
const CONTENT_DETAILS_PATH = '/creators/content/details/';
const API_BASE = getApiBase();
const CACHE_KEY = 'influencersClub_cache_v1';
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getApiKey() {
  if (typeof window === 'undefined') return '';
  return window.localStorage.getItem('influencersClub_apiKey') || '';
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

function buildProxyUrl(path) {
  const endpoint = path.includes('content/details')
    ? 'content'
    : path.includes('discovery')
      ? 'discovery'
      : path.includes('posts')
        ? 'posts'
        : path.includes('profile')
          ? 'profile'
          : '';
  if (!endpoint) return '';
  const base = API_BASE || '';
  return `${base}/api/influencers-club/${endpoint}`;
}

function buildDirectUrls(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return [`${PRIMARY_BASE_URL}${suffix}`, `${LEGACY_BASE_URL}${suffix}`];
}

function isLikelyNetworkError(err) {
  return err?.message === 'Failed to fetch' || err?.name === 'TypeError' || !err?.status;
}

async function postJson(url, payload, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
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

async function fetchWithAuth(path, payload, kind, handle, platform) {
  const cached = getCached(kind, handle, platform);
  if (cached) return cached;

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Influencers.club API key is missing.');
  }

  const directHeaders = { Authorization: `Bearer ${apiKey}` };

  const tryProxy = async (directError) => {
    const proxyUrl = buildProxyUrl(path);
    if (!proxyUrl) {
      throw directError;
    }
    try {
      return await postJson(proxyUrl, { ...(payload || {}), apiKey }, directHeaders);
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
  let lastNetworkError = null;
  for (const directUrl of buildDirectUrls(path)) {
    try {
      data = await postJson(directUrl, payload, directHeaders);
      break;
    } catch (err) {
      if (!isLikelyNetworkError(err)) {
        throw err;
      }
      lastNetworkError = err;
    }
  }

  if (!data) {
    data = await tryProxy(lastNetworkError);
  }

  setCached(kind, handle, platform, data);
  return data;
}

export async function fetchCreatorProfile(handle, platform) {
  return fetchWithAuth(DISCOVERY_PATH, { handle, platform }, 'profile', handle, platform);
}

export async function fetchRecentPosts(handle, platform) {
  // The API is expected to return an array of posts with captions and engagement metrics.
  return fetchWithAuth(CONTENT_DETAILS_PATH, { handle, platform, limit: 50 }, 'posts', handle, platform);
}

export function clearInfluencersClubCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CACHE_KEY);
}
