import {
  CLASSIFICATION_BATCH_SIZE,
  MAX_RETRIES,
  MODEL_DEFAULT,
  OPENAI_CHAT_ENDPOINT
} from './brandSafetyConfig';
import { ApiKeys, BrandSafetyEvidence, ClassificationResult, Creator } from '../types';
import { wait } from './utils';

const CACHE_KEY = 'brand_safety_classification_cache_v1';

type CacheMap = Record<string, ClassificationResult>;

function loadCache(): CacheMap {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CacheMap;
    return parsed || {};
  } catch (err) {
    console.warn('Failed to load classifier cache', err);
    return {};
  }
}

function persistCache(cache: CacheMap) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch (err) {
    console.warn('Failed to persist classifier cache', err);
  }
}

const cacheStore: CacheMap = loadCache();

function buildUserPrompt(evidence: BrandSafetyEvidence, creator: Creator) {
  return `You are a brand safety intelligence classifier for advertisers.
Given text describing a creator, perform the following:

1. Classify whether this text indicates:
   - Offender (creator is doing harm)
   - Victim (creator is being harmed)
   - Unrelated (drama not involving creator, or false positive)

2. Identify the risk category if Offender:
   - harmToMinors
   - sexualMisconduct
   - violence
   - hateOrDiscrimination
   - fraudOrScam
   - misinformation
   - guidelineViolations
   - personalDrama (low risk)

3. Rate severity on a scale of 1 to 5.

4. Identify sentiment:
   - negative
   - neutral
   - positive toward creator

5. Detect mitigation indicators such as:
   - accusations denied
   - lacks evidence
   - false allegations
   - resolved issue
   - misreporting

6. Extract a short, factual summary (max 2 sentences).

Context:
Creator: ${creator.name} ${creator.handle ? `(${creator.handle})` : ''}
Title: ${evidence.title}
Snippet: ${evidence.snippet}

Respond in JSON with fields:
{
  "stance": "",
  "category": "",
  "severity": 0,
  "sentiment": "",
  "mitigation": false,
  "summary": ""
}`;
}

async function classifyWithBackoff(
  evidence: BrandSafetyEvidence,
  creator: Creator,
  keys: ApiKeys
): Promise<ClassificationResult> {
  const cacheHit = cacheStore[evidence.url];
  if (cacheHit) return cacheHit;

  if (!keys.openAiApiKey) {
    throw new Error('OpenAI API key is required.');
  }

  const model = keys.openAiModel || MODEL_DEFAULT;
  let attempt = 0;
  let lastError: any;

  while (attempt < MAX_RETRIES) {
    try {
      const res = await fetch(OPENAI_CHAT_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${keys.openAiApiKey}`
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: 'You are an expert brand safety classifier returning structured JSON only.'
            },
            { role: 'user', content: buildUserPrompt(evidence, creator) }
          ]
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'OpenAI classification failed');
      }

      const content: string = data?.choices?.[0]?.message?.content || '';
      const parsed = JSON.parse(content) as ClassificationResult;
      parsed.severity = Number(parsed.severity || 0);
      cacheStore[evidence.url] = parsed;
      persistCache(cacheStore);
      return parsed;
    } catch (err: any) {
      lastError = err;
      attempt += 1;
      if (attempt >= MAX_RETRIES) break;
      await wait(Math.pow(2, attempt) * 400);
    }
  }

  throw lastError || new Error('Classification failed');
}

export async function classifyEvidenceBatch(
  evidence: BrandSafetyEvidence[],
  creator: Creator,
  keys: ApiKeys
): Promise<BrandSafetyEvidence[]> {
  const batches = [] as BrandSafetyEvidence[][];
  for (let i = 0; i < evidence.length; i += CLASSIFICATION_BATCH_SIZE) {
    batches.push(evidence.slice(i, i + CLASSIFICATION_BATCH_SIZE));
  }

  const enriched: BrandSafetyEvidence[] = [];
  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map(async (ev) => ({ ...ev, classification: await classifyWithBackoff(ev, creator, keys) }))
    );
    results.forEach((res) => {
      if (res.status === 'fulfilled') {
        enriched.push(res.value);
      }
    });
  }

  return enriched;
}
