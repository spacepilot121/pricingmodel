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

const MANDATORY_RED_CATEGORIES: RiskCategory[] = ['harmToMinors', 'sexualMisconduct'];

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

export function detectRecencyMonths(snippet: string): number | null {
  const years = snippet.match(/(20\d{2}|19\d{2})/g);
  if (years && years.length) {
    const latestYear = Math.max(...years.map((y) => parseInt(y, 10)));
    return monthsSince(latestYear);
  }

  const relativeMonths = parseRelativeMonths(snippet);
  if (relativeMonths !== null) {
    return relativeMonths;
  }

  return null;
}

export function detectRecencyWeight(snippet: string): number {
  const months = detectRecencyMonths(snippet);
  if (months !== null) {
    const bucket = RECENCY_BUCKETS.find((b) => months <= b.maxMonths);
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
  // Severe harm to minors and sexual misconduct should never be downgraded by mitigation
  // flags because brand safety policy treats these as non-negotiable red lines.
  const mitigationExempt = MANDATORY_RED_CATEGORIES.includes(classification.category as RiskCategory);
  const mitigation = classification.mitigation && !mitigationExempt ? MITIGATION_PENALTY : 0;

  const rawScore = severityScore + recencyScore + sentimentScore + sourceScore - mitigation;
  return normaliseScore(rawScore);
}

export function deriveRiskLevel(score: number | null): RiskLevel {
  if (score === null || Number.isNaN(score)) return 'unknown';
  const band = RISK_BANDS.find((b) => score >= b.min && score <= b.max);
  return band?.band || 'green';
}

function calculateCompositeScore(evidence: BrandSafetyEvidence[]): number {
  if (!evidence.length) return 0;
  const sorted = [...evidence].sort((a, b) => b.riskContribution - a.riskContribution);
  const top = sorted.slice(0, 5);
  const avg = top.reduce((acc, e) => acc + e.riskContribution, 0) / Math.max(1, top.length);
  const evidenceBonus = Math.min(20, sorted.length * 2);
  return normaliseScore(avg + evidenceBonus);
}

function computeBaseConfidence(evidence: BrandSafetyEvidence[]): number {
  if (!evidence.length) return 0.1;
  const offenderEvidence = evidence.filter((e) => e.classification.stance === 'Offender');
  const severityAvg =
    offenderEvidence.reduce((acc, e) => acc + e.classification.severity, 0) /
    Math.max(1, offenderEvidence.length);
  const density = Math.min(1, evidence.length / 10);
  return Number((0.4 * density + 0.6 * (severityAvg / 5)).toFixed(2));
}

function computeHighSeverityScore(evidence: BrandSafetyEvidence[]): number {
  const offenderEvidence = evidence.filter((e) => e.classification.stance === 'Offender');
  const highSeverityScores = offenderEvidence.map((item) =>
    item.classification.severity * severityWeight(item.classification.category) * 5
  );
  return highSeverityScores.length ? Math.max(...highSeverityScores) : 0;
}

function hasRecentHighSeverity(evidence: BrandSafetyEvidence[]): boolean {
  return evidence.some((item) => {
    if (item.classification.severity < 4 || item.classification.stance !== 'Offender') return false;
    const months =
      typeof item.recencyMonths === 'number' ? item.recencyMonths : detectRecencyMonths(item.snippet);
    if (months === null) return false;
    return months <= 24;
  });
}

export function evaluateRiskOutcome(
  evidence: BrandSafetyEvidence[]
): { finalScore: number; riskLevel: RiskLevel; confidence: number } {
  if (!evidence.length) {
    return { finalScore: 0, riskLevel: 'unknown', confidence: 0.1 };
  }

  const offenderEvidence = evidence.filter((e) => e.classification.stance === 'Offender');
  const highSeverity = offenderEvidence.filter((e) => e.classification.severity >= 4);
  const compositeScore = calculateCompositeScore(evidence);
  const highSeverityScore = computeHighSeverityScore(highSeverity);
  const weightedCompositeScore = compositeScore;
  let finalScore = Math.max(highSeverityScore, weightedCompositeScore);
  let riskLevel = deriveRiskLevel(finalScore);
  let confidence = computeBaseConfidence(evidence);

  // Mandatory red triggers protect users against severe reputational risks even when
  // blended averages might dilute the signal.
  const mandatory = highSeverity.find((item) =>
    MANDATORY_RED_CATEGORIES.includes(item.classification.category as RiskCategory)
  );
  if (mandatory) {
    const forcedScore = Math.min(100, 95 + (mandatory.classification.severity - 4) * 5);
    return {
      finalScore: Math.max(finalScore, forcedScore),
      riskLevel: 'red',
      confidence: Math.max(confidence, 0.9)
    };
  }

  if (highSeverity.length >= 2) {
    return { finalScore: 100, riskLevel: 'red', confidence: 1 };
  }

  if (hasRecentHighSeverity(highSeverity)) {
    return {
      finalScore: Math.max(finalScore, 98),
      riskLevel: 'red',
      confidence: Math.max(confidence, 0.95)
    };
  }

  finalScore = Math.max(highSeverityScore, weightedCompositeScore);
  riskLevel = deriveRiskLevel(finalScore);

  return { finalScore, riskLevel, confidence };
}

export function enrichEvidenceRisk(
  evidence: BrandSafetyEvidence[],
  stanceFilter: ('Offender' | 'Victim' | 'Unrelated')[] = ['Offender', 'Victim', 'Unrelated']
): BrandSafetyEvidence[] {
  return evidence.map((item, idx) => {
    const recency = detectRecencyWeight(item.snippet);
    const recencyMonths = detectRecencyMonths(item.snippet);
    const contribution = stanceFilter.includes(item.classification.stance)
      ? calculateRiskContribution(item.classification, recency, idx)
      : 0;
    return { ...item, recency, recencyMonths, riskContribution: contribution };
  });
}
