export type Creator = {
  id: string;
  name: string;
  platform: 'YouTube' | 'Twitch' | 'TikTok' | 'Instagram' | 'Other';
  channelUrl?: string;
  channelId?: string;
  handle?: string;
};

export type CreatorProfile = {
  id: string;
  primaryName: string;
  altNames: string[];
  handles: string[];
  platform: string;
  channelUrl?: string;
  channelId?: string;
  description?: string;
};

export type RiskCategory =
  | 'harmToMinors'
  | 'sexualMisconduct'
  | 'violence'
  | 'hateOrDiscrimination'
  | 'fraudOrScam'
  | 'misinformation'
  | 'guidelineViolations'
  | 'personalDrama';

export type Sentiment = 'negative' | 'neutral' | 'positive';

export type ClassificationResult = {
  stance: 'Offender' | 'Victim' | 'Unrelated';
  category: RiskCategory | '';
  severity: number; // 1-5
  sentiment: Sentiment;
  mitigation: boolean;
  summary: string;
};

export type BrandSafetyEvidence = {
  title: string;
  snippet: string;
  url: string;
  classification: ClassificationResult;
  recency: number; // 0-1
  riskContribution: number;
};

export type RiskLevel = 'green' | 'amber' | 'red';

export type BrandSafetyResult = {
  creatorId: string;
  creatorName: string;
  creatorHandle?: string;
  riskScore: number;
  finalScore: number;
  riskLevel: RiskLevel;
  summary: string;
  evidence: BrandSafetyEvidence[];
  lastChecked: string;
  confidence: number;
  categoriesDetected: Partial<Record<RiskCategory, number>>;
};

export type ApiKeys = {
  googleCseApiKey?: string;
  googleCseCx?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  youtubeApiKey?: string;
};
