import { ApiKeys, BrandSafetyEvidence, BrandSafetyResult, Creator, CreatorEntityData } from '../types';
import { classifyEvidenceBatch } from './nlpClassifier';
import { performSmartSearch } from './searchEngine';
import { countBy, normaliseScore } from './utils';
import { deriveRiskLevel, enrichEvidenceRisk } from './riskScoring';
import { isLikelyAboutCreator, verifyEntityWithGPT } from './entityDisambiguation';
import { MODEL_DEFAULT } from './brandSafetyConfig';

const RESULTS_STORAGE_KEY = 'brand_safety_results_cache_v3';

/**
 * Entity profile builder ensures every creator is represented by a consistent identifier set
 * used by the disambiguation layer.
 */
function buildCreatorEntityData(creator: Creator, provided?: CreatorEntityData): CreatorEntityData {
  const handle = creator.handle?.replace('@', '') || '';
  const baseIdentifiers = [creator.name, handle, creator.channelId, creator.channelUrl].filter(Boolean) as string[];
  const identifiers = Array.from(new Set([...(provided?.identifiers || []), ...baseIdentifiers]));
  return {
    primaryName: provided?.primaryName || creator.name,
    realName: provided?.realName || creator.name,
    identifiers: Array.from(new Set([...identifiers, creator.name, handle].filter(Boolean)))
  };
}

function loadCachedResults(): BrandSafetyResult[] {
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

function buildSummary(evidence: BrandSafetyEvidence[]): string {
  if (!evidence.length) return 'No notable results found in search scope.';
  const top = [...evidence].sort((a, b) => b.riskContribution - a.riskContribution).slice(0, 3);
  return top
    .map((item) => item.classification.summary || item.snippet.slice(0, 120))
    .join(' ');
}

function computeConfidence(evidence: BrandSafetyEvidence[]): number {
  if (!evidence.length) return 0.1;
  const offenderEvidence = evidence.filter((e) => e.classification.stance === 'Offender');
  const severityAvg = offenderEvidence.reduce((acc, e) => acc + e.classification.severity, 0) /
    Math.max(1, offenderEvidence.length);
  const density = Math.min(1, evidence.length / 10);
  return Number((0.4 * density + 0.6 * (severityAvg / 5)).toFixed(2));
}

function computeFinalScore(evidence: BrandSafetyEvidence[]): number {
  if (!evidence.length) return 0;
  const sorted = [...evidence].sort((a, b) => b.riskContribution - a.riskContribution);
  const top = sorted.slice(0, 5);
  const avg = top.reduce((acc, e) => acc + e.riskContribution, 0) / Math.max(1, top.length);
  const evidenceBonus = Math.min(20, sorted.length * 2);
  return normaliseScore(avg + evidenceBonus);
}

function deduplicateEvidence(evidence: BrandSafetyEvidence[]): BrandSafetyEvidence[] {
  return evidence.filter((item, idx, arr) => arr.findIndex((other) => other.url === item.url) === idx);
}

function buildSnippetContext(item: BrandSafetyEvidence) {
  return {
    snippet: item.snippet,
    title: item.title,
    url: item.url,
    // Optional rich metadata if present from upstream search providers
    metaDescription: (item as any).metaDescription,
    richSnippet: (item as any).richSnippet
  };
}

async function validateSnippet(
  item: BrandSafetyEvidence,
  creatorData: CreatorEntityData,
  keys: ApiKeys
): Promise<boolean> {
  const context = buildSnippetContext(item);
  const heuristicPass = isLikelyAboutCreator(context, creatorData);

  if (heuristicPass) {
    return true;
  }

  const verification = await verifyEntityWithGPT(context, creatorData, {
    apiKey: keys.openAiApiKey,
    model: keys.openAiModel || MODEL_DEFAULT
  });

  return verification.matchesCreator;
}

async function shouldClassifySnippet(
  item: BrandSafetyEvidence,
  creatorData: CreatorEntityData,
  keys: ApiKeys
): Promise<boolean> {
  // Flexible OR logic: accept if either heuristic OR GPT agrees. Reject only when both fail.
  return validateSnippet(item, creatorData, keys);
}

async function validateEntities(
  evidence: BrandSafetyEvidence[],
  creatorData: CreatorEntityData,
  keys: ApiKeys
): Promise<BrandSafetyEvidence[]> {
  const validated: BrandSafetyEvidence[] = [];
  for (const item of evidence) {
    // The entity disambiguation layer prevents false positives like "Alias" when scanning Ali-A.
    const keep = await shouldClassifySnippet(item, creatorData, keys);
    if (keep) {
      validated.push(item);
    }
  }
  return validated;
}

export async function runBrandSafetyEngine(
  creator: Creator,
  keys: ApiKeys,
  entityDataOverride?: CreatorEntityData
): Promise<BrandSafetyResult> {
  /**
   * Architecture: enforce entity validation before any expensive NLP.
   * 1) Build search queries & call Google CSE.
   * 2) Deduplicate URLs.
   * 3) Local heuristic entity checks (cheap) -> discard obvious mismatches.
   * 4) GPT semantic disambiguation -> discard near-name false positives (Ali-A vs "Alias").
   * 5) Semantic classification on validated snippets.
   * 6) Risk scoring on classified evidence.
   * 7) Aggregate output + persistence.
   */
  const creatorData = buildCreatorEntityData(creator, entityDataOverride);

  if (!keys.openAiApiKey) {
    throw new Error('OpenAI API key is required for entity validation and classification.');
  }

  // 1) Build search queries & perform Google Search API calls (in searchEngine).
  const searchResults = await performSmartSearch(creator, keys);
  if (!searchResults.length) {
    return {
      creatorId: creator.id,
      creatorName: creator.name,
      creatorHandle: creator.handle,
      riskLevel: 'unknown',
      riskScore: null,
      finalScore: null,
      summary: 'Insufficient validated data to determine risk.',
      evidence: [],
      lastChecked: new Date().toISOString(),
      confidence: 0.1,
      categoriesDetected: {}
    };
  }

  // 2) Deduplicate URLs and run the Entity Disambiguation Layer BEFORE any semantic classification.
  const deduped = deduplicateEvidence(searchResults);
  const entityValidated = await validateEntities(deduped, creatorData, keys);

  if (!entityValidated.length) {
    const mentionInMetadata = deduped.some((item) =>
      isLikelyAboutCreator(
        {
          title: item.title,
          url: item.url,
          metaDescription: (item as any).metaDescription,
          richSnippet: (item as any).richSnippet,
          snippet: ''
        },
        creatorData
      )
    );

    const fallbackSnippet: BrandSafetyEvidence | null = mentionInMetadata
      ? {
          title: 'Search mention detected',
          snippet: 'Basic search mentions located but insufficient snippet text for verification.',
          url: deduped[0]?.url || '',
          source: 'fallback',
          classificationLabel: 'insufficient_data',
          classification: {
            stance: 'Unrelated',
            category: '',
            severity: 0,
            sentiment: 'neutral',
            mitigation: false,
            summary: 'insufficient_data'
          },
          recency: 0,
          riskContribution: 0
        }
      : null;

    return {
      creatorId: creator.id,
      creatorName: creator.name,
      creatorHandle: creator.handle,
      riskLevel: 'unknown',
      riskScore: null,
      finalScore: null,
      summary:
        fallbackSnippet?.snippet || 'Insufficient validated data to determine risk.',
      evidence: fallbackSnippet ? [fallbackSnippet] : [],
      lastChecked: new Date().toISOString(),
      confidence: 0.1,
      categoriesDetected: {}
    };
  }

  // 3) Only validated snippets enter semantic classification + risk scoring.
  const classified = await classifyEvidenceBatch(entityValidated, creator, keys);
  const enriched = enrichEvidenceRisk(classified, ['Offender', 'Victim', 'Unrelated']);
  const offenderCategories = countBy(
    enriched
      .filter((e) => e.classification.stance === 'Offender' && e.classification.category)
      .map((e) => e.classification.category as any)
  );

  const finalScore = computeFinalScore(enriched);
  const riskLevel = deriveRiskLevel(finalScore);
  const summary = buildSummary(enriched);
  const confidence = computeConfidence(enriched);

  const result: BrandSafetyResult = {
    creatorId: creator.id,
    creatorName: creator.name,
    creatorHandle: creator.handle,
    riskLevel,
    riskScore: finalScore,
    finalScore,
    summary,
    evidence: enriched,
    lastChecked: new Date().toISOString(),
    confidence,
    categoriesDetected: offenderCategories
  };

  persistResult(result);
  return result;
}

export function loadBrandSafetyCache(): BrandSafetyResult[] {
  return loadCachedResults();
}
