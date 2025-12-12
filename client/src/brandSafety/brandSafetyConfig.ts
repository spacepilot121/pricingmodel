import { RiskCategory, RiskLevel, Sentiment } from '../types';

export const SEARCH_QUERY_TEMPLATES = [
  '${creator} allegations',
  '${creator} scandal',
  '${creator} police investigation',
  '${creator} accused of',
  '${creator} controversy explained',
  '${creator} backlash',
  '${creator} misconduct',
  '${creator} drama timeline',
  '${creator} apology video',
  '${creator} lawsuit',
  '${creator} charges',
  '${creator} exposed',
  '${creator} statement addressing',
  '${creator} incident',
  '${creator} grooming controversy',
  '${creator} minor-related allegations',
  '${creator} financial fraud',
  '${creator} racism accusation',
  '${creator} hate speech',
  '${creator} sexual misconduct',
  // Identity anchors ensure the engine has non-controversial references it can validate against.
  '${creator}',
  '${creator} youtube',
  '${creator} influencer',
  '${creator} interview',
  '${creator} biography',
  '${creator} profile',
  '${creator} channel',
  '${creator} news'
];

export const MITIGATION_KEYWORDS = [
  'resolved',
  'apology',
  'denied allegations',
  'false accusations',
  'no evidence',
  'dismissed',
  'settled',
  'closed investigation'
];

export const CONTROVERSY_KEYWORDS = [
  'allegations',
  'controversy',
  'scandal',
  'lawsuit',
  'charges',
  'accused',
  'backlash',
  'exposed'
];

export const SEVERITY_WEIGHT: Record<RiskCategory, number> = {
  harmToMinors: 5,
  sexualMisconduct: 5,
  violence: 4,
  hateOrDiscrimination: 4,
  fraudOrScam: 3,
  misinformation: 3,
  guidelineViolations: 2,
  personalDrama: 1,
  insufficient_data: 0
};

export const SENTIMENT_ADJUSTMENT: Record<Sentiment, number> = {
  negative: 10,
  neutral: 0,
  positive: -10
};

export const MITIGATION_PENALTY = 15;
export const RECENCY_DEFAULT = 0.5;

export const RECENCY_BUCKETS = [
  { maxMonths: 12, weight: 1 },
  { maxMonths: 36, weight: 0.6 },
  { maxMonths: 60, weight: 0.3 },
  { maxMonths: Infinity, weight: 0.1 }
];

export const MODEL_DEFAULT = import.meta.env?.VITE_OPENAI_MODEL?.trim() || 'gpt-4o-mini';
export const MODEL_UPSCALE = 'gpt-4o';
export const MAX_RESULTS = 40;
export const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
export const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

export const RISK_BANDS: { band: Exclude<RiskLevel, 'unknown'>; min: number; max: number }[] = [
  { band: 'green', min: 0, max: 25 },
  { band: 'amber', min: 26, max: 60 },
  { band: 'red', min: 61, max: 100 }
];

export const SOURCE_INDEX_WEIGHT = 1.5;

export const OUTPUT_STRUCTURE = {
  creator: '',
  riskLevel: '' as RiskLevel,
  finalScore: null as number | null,
  confidence: 0,
  categoriesDetected: {} as Partial<Record<RiskCategory, number>>,
  evidence: [] as any[]
};

export const SEARCH_BATCH_SIZE = 4;
export const CLASSIFICATION_BATCH_SIZE = 3;
export const MAX_RETRIES = 3;
