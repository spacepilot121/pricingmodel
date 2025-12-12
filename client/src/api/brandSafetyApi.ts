import { ApiKeys, BrandSafetyEvidence, BrandSafetyResult, Creator } from '../types';
import { loadApiKeys, saveApiKeys } from './apiKeyStorage';

const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const RESULTS_STORAGE_KEY = 'brand_safety_results_cache_v2';
const DEFAULT_OPENAI_MODEL = import.meta.env?.VITE_OPENAI_MODEL?.trim() || 'gpt-4o-mini';

const QUERY_SUFFIXES = [
  'allegations',
  'controversy',
  'police',
  'lawsuit',
  'racism',
  'accusations',
  'scandal'
];

type GoogleSearchResponse = {
  items?: { title?: string; snippet?: string; link?: string }[];
  error?: { message?: string };
};

type Classification = { riskLevel: BrandSafetyResult['riskLevel']; summary: string };

function mergeWithEnvKeys(keys: ApiKeys): ApiKeys {
  return {
    googleCseApiKey: keys.googleCseApiKey || import.meta.env?.VITE_GOOGLE_CSE_API_KEY?.trim(),
    googleCseCx: keys.googleCseCx || import.meta.env?.VITE_GOOGLE_CSE_CX?.trim(),
    openAiApiKey: keys.openAiApiKey || import.meta.env?.VITE_OPENAI_API_KEY?.trim(),
    openAiModel: keys.openAiModel || DEFAULT_OPENAI_MODEL,
    youtubeApiKey: keys.youtubeApiKey
  };
}

export function loadCachedResults(): BrandSafetyResult[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RESULTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BrandSafetyResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Unable to load cached brand safety results', err);
    return [];
  }
}

function persistResult(result: BrandSafetyResult) {
  if (typeof window === 'undefined') return;
  const existing = loadCachedResults();
  const next = existing.filter((r) => r.creatorId !== result.creatorId).concat(result);
  try {
    window.localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn('Unable to persist brand safety result', err);
  }
}

function ensureKeys(keys?: ApiKeys): ApiKeys {
  const merged = mergeWithEnvKeys(keys || loadApiKeys());
  saveApiKeys(merged);
  return merged;
}

function buildQueries(creator: Creator): string[] {
  const base = creator.name.trim();
  const handle = creator.handle?.trim();
  return QUERY_SUFFIXES.map((suffix) => `${base} ${handle ? `${handle} ` : ''}${suffix}`.trim());
}

async function fetchGoogleResults(query: string, keys: ApiKeys): Promise<BrandSafetyEvidence[]> {
  if (!keys.googleCseApiKey || !keys.googleCseCx) {
    throw new Error('Google Search API key and CX are required.');
  }

  const params = new URLSearchParams({
    key: keys.googleCseApiKey,
    cx: keys.googleCseCx,
    q: query,
    num: '5'
  });

  const res = await fetch(`${GOOGLE_SEARCH_ENDPOINT}?${params.toString()}`);
  const data: GoogleSearchResponse = await res.json();

  if (!res.ok) {
    const message = data?.error?.message || 'Google search failed';
    throw new Error(message);
  }

  return (data.items || [])
    .filter((item) => item?.link && (item.title || item.snippet))
    .map((item) => ({
      title: item.title || 'Untitled result',
      snippet: item.snippet || 'No snippet available',
      url: item.link || '#'
    }));
}

async function classifyWithOpenAI(text: string, keys: ApiKeys, creator: Creator): Promise<Classification> {
  if (!keys.openAiApiKey) {
    throw new Error('OpenAI API key is required.');
  }

  const model = keys.openAiModel || DEFAULT_OPENAI_MODEL;
  const system =
    'You are a brand safety analyst. Review the provided articles and classify the advertiser risk level for the creator.' +
    ' Respond with a short JSON object containing riskLevel (Low, Medium, High) and summary.';
  const user = [
    `Creator name: ${creator.name}`,
    creator.handle ? `Handle or ID: ${creator.handle}` : null,
    'Articles and snippets:',
    text,
    'Return JSON only in the format {"riskLevel":"Low|Medium|High","summary":"..."}.',
    'Be concise and objective.'
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keys.openAiApiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.3
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const message = data?.error?.message || 'OpenAI classification failed';
    throw new Error(message);
  }

  const content: string = data?.choices?.[0]?.message?.content || '';

  try {
    const parsed = JSON.parse(content) as Classification;
    if (parsed?.riskLevel && parsed?.summary) {
      return parsed;
    }
  } catch (err) {
    console.warn('Failed to parse model response as JSON, falling back to heuristic', err);
  }

  const fallbackSummary = content?.trim() || 'No summary returned.';
  const riskLevelMatch = /high/i.test(content)
    ? 'High'
    : /medium/i.test(content)
    ? 'Medium'
    : 'Low';
  return { riskLevel: riskLevelMatch as Classification['riskLevel'], summary: fallbackSummary };
}

function aggregateSnippets(evidence: BrandSafetyEvidence[]): string {
  return evidence
    .map((item, idx) => `(${idx + 1}) ${item.title}: ${item.snippet} [${item.url}]`)
    .join('\n');
}

function deriveRiskScore(level: BrandSafetyResult['riskLevel']): number {
  if (level === 'High') return 90;
  if (level === 'Medium') return 60;
  return 20;
}

export async function scanOneCreator(creator: Creator, providedKeys?: ApiKeys): Promise<BrandSafetyResult> {
  const keys = ensureKeys(providedKeys);
  const queries = buildQueries(creator);
  const evidenceLists = await Promise.all(queries.map((q) => fetchGoogleResults(q, keys)));
  const evidence = evidenceLists.flat();
  const uniqueEvidence = evidence.filter((item, idx, arr) => arr.findIndex((e) => e.url === item.url) === idx);
  const aggregatedText = aggregateSnippets(uniqueEvidence);
  const classification = await classifyWithOpenAI(aggregatedText || 'No notable articles found.', keys, creator);

  const result: BrandSafetyResult = {
    creatorId: creator.id,
    creatorName: creator.name,
    creatorHandle: creator.handle,
    riskLevel: classification.riskLevel,
    riskScore: deriveRiskScore(classification.riskLevel),
    summary: classification.summary,
    evidence: uniqueEvidence,
    lastChecked: new Date().toISOString()
  };

  persistResult(result);
  return result;
}

export async function scanManyCreators(creators: Creator[], keys?: ApiKeys): Promise<BrandSafetyResult[]> {
  const mergedKeys = ensureKeys(keys);
  const results: BrandSafetyResult[] = [];
  for (const creator of creators) {
    try {
      const result = await scanOneCreator(creator, mergedKeys);
      results.push(result);
    } catch (err: any) {
      results.push({
        creatorId: creator.id,
        creatorName: creator.name,
        creatorHandle: creator.handle,
        riskLevel: 'Low',
        riskScore: 0,
        summary: err?.message || 'Scan failed',
        evidence: [],
        lastChecked: new Date().toISOString()
      });
    }
  }
  return results;
}
