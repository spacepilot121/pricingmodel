import { ApiKeys, BrandSafetyEvidence, BrandSafetyResult, Creator } from '../types';
import { classifyEvidenceBatch } from './nlpClassifier';
import { performSmartSearch } from './searchEngine';
import { countBy, normaliseScore } from './utils';
import { deriveRiskLevel, enrichEvidenceRisk } from './riskScoring';

const RESULTS_STORAGE_KEY = 'brand_safety_results_cache_v3';

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
  if (!evidence.length) return 0.2;
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

export async function runBrandSafetyEngine(
  creator: Creator,
  keys: ApiKeys
): Promise<BrandSafetyResult> {
  const searchResults = await performSmartSearch(creator, keys);
  if (!searchResults.length) {
    return {
      creatorId: creator.id,
      creatorName: creator.name,
      creatorHandle: creator.handle,
      riskLevel: 'green',
      riskScore: 0,
      finalScore: 0,
      summary: 'Search returned no notable articles.',
      evidence: [],
      lastChecked: new Date().toISOString(),
      confidence: 0.2,
      categoriesDetected: {}
    };
  }

  const classified = await classifyEvidenceBatch(searchResults, creator, keys);
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
