import { ApiKeys } from '../types';

const STORAGE_KEY = 'brand_safety_api_keys';

export function loadApiKeys(): ApiKeys {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as ApiKeys;
    }
  } catch (err) {
    console.warn('Unable to load saved API keys', err);
  }
  return {};
}

export function saveApiKeys(keys: ApiKeys): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch (err) {
    console.warn('Unable to persist API keys', err);
  }
}
