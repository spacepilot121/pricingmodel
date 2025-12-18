import { ApiKeys } from '../types';

const STORAGE_KEY_LEGACY = 'brand_safety_api_keys';
const GOOGLE_KEY_STORAGE = 'brandSafety_googleKey';
const GOOGLE_CX_STORAGE = 'brandSafety_googleCx';
const OPENAI_KEY_STORAGE = 'brandSafety_openAiKey';
const INFLUENCERS_CLUB_KEY_STORAGE = 'influencersClub_apiKey';

function persistValue(storageKey: string, value?: string) {
  if (typeof window === 'undefined') return;
  if (value) {
    window.localStorage.setItem(storageKey, value);
  } else {
    window.localStorage.removeItem(storageKey);
  }
}

function loadLegacyObject(): ApiKeys {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (stored) {
      return JSON.parse(stored) as ApiKeys;
    }
  } catch (err) {
    console.warn('Unable to load legacy saved API keys', err);
  }
  return {};
}

export function loadApiKeys(): ApiKeys {
  const googleCseApiKey = localStorage.getItem(GOOGLE_KEY_STORAGE)?.trim();
  const googleCseCx = localStorage.getItem(GOOGLE_CX_STORAGE)?.trim();
  const openAiApiKey = localStorage.getItem(OPENAI_KEY_STORAGE)?.trim();
  const influencersClubApiKey = localStorage.getItem(INFLUENCERS_CLUB_KEY_STORAGE)?.trim();
  const legacy = loadLegacyObject();

  return {
    googleCseApiKey: googleCseApiKey || legacy.googleCseApiKey,
    googleCseCx: googleCseCx || legacy.googleCseCx,
    openAiApiKey: openAiApiKey || legacy.openAiApiKey,
    openAiModel: legacy.openAiModel,
    youtubeApiKey: legacy.youtubeApiKey,
    influencersClubApiKey: influencersClubApiKey || legacy.influencersClubApiKey
  };
}

export function saveApiKeys(keys: ApiKeys): ApiKeys {
  const merged = { ...loadApiKeys(), ...keys };

  try {
    persistValue(GOOGLE_KEY_STORAGE, merged.googleCseApiKey?.trim());
    persistValue(GOOGLE_CX_STORAGE, merged.googleCseCx?.trim());
    persistValue(OPENAI_KEY_STORAGE, merged.openAiApiKey?.trim());
    persistValue(INFLUENCERS_CLUB_KEY_STORAGE, merged.influencersClubApiKey?.trim());

    // Persist optional keys to legacy object for backwards compatibility.
    const legacyPayload: ApiKeys = {
      googleCseApiKey: merged.googleCseApiKey,
      googleCseCx: merged.googleCseCx,
      openAiApiKey: merged.openAiApiKey,
      openAiModel: merged.openAiModel,
      youtubeApiKey: merged.youtubeApiKey,
      influencersClubApiKey: merged.influencersClubApiKey
    };
    localStorage.setItem(STORAGE_KEY_LEGACY, JSON.stringify(legacyPayload));
  } catch (err) {
    console.warn('Unable to persist API keys', err);
  }

  return merged;
}

export function saveApiKey<K extends keyof ApiKeys>(key: K, value: ApiKeys[K]): ApiKeys {
  return saveApiKeys({ [key]: value } as ApiKeys);
}
