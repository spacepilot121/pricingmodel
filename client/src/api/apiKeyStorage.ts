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

export function saveApiKeys(keys: ApiKeys): ApiKeys {
  const merged = { ...loadApiKeys(), ...keys };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch (err) {
    console.warn('Unable to persist API keys', err);
  }
  return merged;
}

export function saveApiKey<K extends keyof ApiKeys>(key: K, value: ApiKeys[K]): ApiKeys {
  return saveApiKeys({ [key]: value } as ApiKeys);
}
