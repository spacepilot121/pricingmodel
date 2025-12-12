import {
  MITIGATION_PENALTY,
  RECENCY_BUCKETS,
  RECENCY_DEFAULT,
  RISK_BANDS,
  SEVERITY_WEIGHT,
  SENTIMENT_ADJUSTMENT,
  SOURCE_INDEX_WEIGHT
} from './brandSafetyConfig';
import { BrandSafetyEvidence, ClassificationResult, RiskCategory, RiskLevel } from '../types';
import { normaliseScore } from './utils';

// Risk scoring operates only on content that survived entity disambiguation and semantic
// classification; at this point we assume every snippet truly refers to the target creator.
function monthsSince(year: number): number {
  const now = new Date();
  const then = new Date(year, 0, 1);
  const diffMs = now.getTime() - then.getTime();
  return diffMs / (1000 * 60 * 60 * 24 * 30);
}

function parseRelativeMonths(snippet: string): number | null {
  const lower = snippet.toLowerCase();
  if (/(this year|recently)/.test(lower)) return 6;
  if (/last year/.test(lower)) return 12;
  const yearsAgoMatch = lower.match(/(\d+)\s+years? ago/);
  if (yearsAgoMatch) {
    return parseInt(yearsAgoMatch[1], 10) * 12;
  }
  const monthsAgoMatch = lower.match(/(\d+)\s+months? ago/);
  if (monthsAgoMatch) {
    return parseInt(monthsAgoMatch[1], 10);
  }
  return null;
}

export function detectRecencyWeight(snippet: string): number {
  const years = snippet.match(/(20\d{2}|19\d{2})/g);
  if (years && years.length) {
    const latestYear = Math.max(...years.map((y) => parseInt(y, 10)));
    const months = monthsSince(latestYear);
    const bucket = RECENCY_BUCKETS.find((b) => months <= b.maxMonths);
    return bucket?.weight ?? RECENCY_DEFAULT;
  }

  const relativeMonths = parseRelativeMonths(snippet);
  if (relativeMonths !== null) {
    const bucket = RECENCY_BUCKETS.find((b) => relativeMonths <= b.maxMonths);
    return bucket?.weight ?? RECENCY_DEFAULT;
  }

  return RECENCY_DEFAULT;
}

function severityWeight(category: RiskCategory | ''): number {
  if (!category) return 1;
  return SEVERITY_WEIGHT[category];
}

export function calculateRiskContribution(
  classification: ClassificationResult,
  recencyWeight: number,
  sourceIndex: number
): number {
  const severityScore = classification.severity * severityWeight(classification.category);
  const recencyScore = recencyWeight * 10;
  const sentimentScore = SENTIMENT_ADJUSTMENT[classification.sentiment];
  const sourceScore = SOURCE_INDEX_WEIGHT * Math.max(1, 10 - sourceIndex);
  const mitigation = classification.mitigation ? MITIGATION_PENALTY : 0;

  const rawScore = severityScore + recencyScore + sentimentScore + sourceScore - mitigation;
  return normaliseScore(rawScore);
}

export function deriveRiskLevel(score: number | null): RiskLevel {
  if (score === null || Number.isNaN(score)) return 'unknown';
  const band = RISK_BANDS.find((b) => score >= b.min && score <= b.max);
  return band?.band || 'green';
}

export function enrichEvidenceRisk(
  evidence: BrandSafetyEvidence[],
  stanceFilter: ('Offender' | 'Victim' | 'Unrelated')[] = ['Offender', 'Victim', 'Unrelated']
): BrandSafetyEvidence[] {
  return evidence.map((item, idx) => {
    const recency = detectRecencyWeight(item.snippet);
    const contribution = stanceFilter.includes(item.classification.stance)
      ? calculateRiskContribution(item.classification, recency, idx)
      : 0;
    return { ...item, recency, riskContribution: contribution };
  });
}
