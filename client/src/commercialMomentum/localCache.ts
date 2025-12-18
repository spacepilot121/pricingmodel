import { CommercialMomentumResult } from '../types';

const CACHE_KEY = 'commercialMomentum_cache_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_DAYS = 7;

type CacheEntry = {
  timestamp: number;
  data: CommercialMomentumResult;
};

type CacheMap = Record<string, CacheEntry>;

function normaliseKey(name: string) {
  return name.trim().toLowerCase();
}

function loadCache(): CacheMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CacheMap) : {};
  } catch (err) {
    console.warn('Unable to load commercial momentum cache', err);
    return {};
  }
}

function persistCache(cache: CacheMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Unable to persist commercial momentum cache', err);
  }
}

export function get(creatorName: string): CacheEntry | null {
  const cache = loadCache();
  return cache[normaliseKey(creatorName)] || null;
}

export function set(creatorName: string, result: CommercialMomentumResult) {
  const cache = loadCache();
  cache[normaliseKey(creatorName)] = { timestamp: Date.now(), data: result };
  persistCache(cache);
}

export function isFresh(creatorName: string, days = TTL_DAYS) {
  const entry = get(creatorName);
  if (!entry) return false;
  return Date.now() - entry.timestamp <= days * DAY_MS;
}

export function loadAll() {
  const cache = loadCache();
  return Object.values(cache).map((entry) => entry.data);
}
