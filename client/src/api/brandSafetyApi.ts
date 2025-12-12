import { runBrandSafetyEngine, loadBrandSafetyCache } from '../brandSafety/brandSafetyEngine';
import { ApiKeys, BrandSafetyResult, Creator, CreatorEntityData } from '../types';
import { loadApiKeys } from './apiKeyStorage';

const DEFAULT_OPENAI_MODEL = import.meta.env?.VITE_OPENAI_MODEL?.trim() || 'gpt-4o-mini';

function ensureKeys(keys?: ApiKeys): ApiKeys {
  const stored = keys || loadApiKeys();
  return {
    googleCseApiKey: stored.googleCseApiKey,
    googleCseCx: stored.googleCseCx,
    openAiApiKey: stored.openAiApiKey,
    openAiModel: stored.openAiModel || DEFAULT_OPENAI_MODEL,
    youtubeApiKey: stored.youtubeApiKey
  };
}

export function loadCachedResults(): BrandSafetyResult[] {
  return loadBrandSafetyCache();
}

export async function scanOneCreator(
  creator: Creator,
  providedKeys?: ApiKeys,
  creatorData?: CreatorEntityData
): Promise<BrandSafetyResult> {
  const keys = ensureKeys(providedKeys);
  return runBrandSafetyEngine(creator, keys, creatorData || creator.entityData);
}

export async function scanManyCreators(
  creators: Creator[],
  keys?: ApiKeys,
  entityDataByCreatorId?: Record<string, CreatorEntityData>
): Promise<BrandSafetyResult[]> {
  const mergedKeys = ensureKeys(keys);
  const results: BrandSafetyResult[] = [];
  for (const creator of creators) {
    try {
      const result = await scanOneCreator(creator, mergedKeys, entityDataByCreatorId?.[creator.id]);
      results.push(result);
    } catch (err: any) {
      results.push({
        creatorId: creator.id,
        creatorName: creator.name,
        creatorHandle: creator.handle,
        riskLevel: 'unknown',
        riskScore: null,
        finalScore: null,
        summary: err?.message || 'Scan failed',
        evidence: [],
        lastChecked: new Date().toISOString(),
        confidence: 0,
        categoriesDetected: {}
      });
    }
  }
  return results;
}
