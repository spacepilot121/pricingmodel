// Lightweight client for Influencers.club with localStorage caching and rate-limit aware fetches.
// This module intentionally avoids logging secrets or responses.

const BASE_URL = 'https://api.influencers.club/v1';
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

async function fetchWithAuth(path, payload, kind, handle, platform) {
  const cached = getCached(kind, handle, platform);
  if (cached) return cached;

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('Influencers.club API key is missing.');
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey
    },
    body: JSON.stringify(payload || {})
  });

  if (res.status === 429) {
    throw new Error('Rate limited by Influencers.club. Please retry later.');
  }

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data?.error?.message || 'Influencers.club request failed';
    throw new Error(message);
  }

  setCached(kind, handle, platform, data);
  return data;
}

export async function fetchCreatorProfile(handle, platform) {
  return fetchWithAuth('/creators/profile', { handle, platform }, 'profile', handle, platform);
}

export async function fetchRecentPosts(handle, platform) {
  // The API is expected to return an array of posts with captions and engagement metrics.
  return fetchWithAuth('/creators/posts', { handle, platform, limit: 50 }, 'posts', handle, platform);
}

export function clearInfluencersClubCache() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CACHE_KEY);
}
