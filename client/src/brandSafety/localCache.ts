import { BrandSafetyResult } from '../types';

const CACHE_KEY = 'brand_safety_local_cache_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

type CacheEntry = {
  timestamp: number;
  data: BrandSafetyResult;
};

type CacheMap = Record<string, CacheEntry>;

function normaliseKey(creatorName: string): string {
  return creatorName.trim().toLowerCase();
}

function loadCache(): CacheMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheMap;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (err) {
    console.warn('Unable to load local cache', err);
    return {};
  }
}

function persistCache(cache: CacheMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Unable to persist local cache', err);
  }
}

export function get(creatorName: string): CacheEntry | null {
  const cache = loadCache();
  return cache[normaliseKey(creatorName)] || null;
}

export function set(creatorName: string, resultObject: BrandSafetyResult) {
  const cache = loadCache();
  cache[normaliseKey(creatorName)] = { timestamp: Date.now(), data: resultObject };
  persistCache(cache);
}

export function isFresh(creatorName: string, days = 30): boolean {
  const entry = get(creatorName);
  if (!entry) return false;
  return Date.now() - entry.timestamp <= days * DAY_MS;
}

export function lastScannedDate(creatorName: string): Date | null {
  const entry = get(creatorName);
  if (!entry) return null;
  return new Date(entry.timestamp);
}
