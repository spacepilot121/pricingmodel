export type Creator = {
  id: string;
  name: string;
  platform: 'YouTube' | 'Twitch' | 'TikTok' | 'Instagram' | 'Other';
  channelUrl?: string;
  channelId?: string;
  handle?: string;
  /**
   * Optional entity profile used by the disambiguation layer to avoid false positives.
   */
  entityData?: CreatorEntityData;
};

/**
 * Reusable entity profile passed into the brand safety engine. Example:
 * {
 *   primaryName: 'Ali-A',
 *   realName: 'Alastair Aiken',
 *   identifiers: ['Ali-A', 'Ali A', "Alastair 'Ali-A' Aiken", 'MrAliA', 'MoreAliA', 'AliA']
 * }
 */
export type CreatorEntityData = {
  primaryName: string;
  realName?: string;
  identifiers: string[];
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
  | 'personalDrama'
  | 'insufficient_data';

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
  source?: string;
  metaDescription?: string;
  richSnippet?: string;
  classificationLabel?: 'insufficient_data';
  classification: ClassificationResult;
  recency: number; // 0-1
  recencyMonths?: number | null;
  riskContribution: number;
};

export type RiskLevel = 'green' | 'amber' | 'red' | 'unknown';

export type BrandSafetyResult = {
  creatorId: string;
  creatorName: string;
  creatorHandle?: string;
  riskScore: number | null;
  finalScore: number | null;
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
  influencersClubApiKey?: string;
};

export type CommercialPost = {
  id: string;
  caption?: string;
  createdAt?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  views?: number;
  clicks?: number;
  link?: string;
  isSponsored?: boolean;
};

export type SponsoredTone = 'authentic' | 'neutral' | 'overly commercial' | 'audience resistant';

export type CommercialSemanticSummary = {
  toneCounts: Partial<Record<SponsoredTone, number>>;
  audienceSummary: string;
};

export type CommercialMomentumSignals = {
  daysSinceLastSponsoredPost: number | null;
  sponsoredPostsLast30Days: number;
  sponsoredPostsLast60Days: number;
  sponsoredPostsLast90Days: number;
  averageDaysBetweenSponsoredPosts: number | null;
  avgSponsoredEngagement: number;
  avgOrganicEngagement: number;
  engagementRatio: number;
  followerGrowthRate?: number | null;
  engagementTrend?: number | null;
  semanticSummary?: CommercialSemanticSummary;
};

export type CreatorProfileInsights = {
  emails?: string[];
  followerCount?: number;
  subscriberCount?: number;
  viewCount?: number;
  videoCount?: number;
  country?: string;
  platformHandle?: string;
  profilePicture?: string;
  description?: string;
  link?: string;
};

export type CommercialMomentumResult = {
  creatorId: string;
  creatorName: string;
  creatorHandle?: string;
  platform?: Creator['platform'];
  score: number;
  recommendation: string;
  signals: CommercialMomentumSignals;
  lastSponsoredPostDate?: string | null;
  lastChecked: string;
  keyDrivers: string[];
  semanticSummary?: CommercialSemanticSummary;
  status?: 'ok' | 'stale' | 'error';
  summary?: string;
  primaryEmail?: string;
  profileInsights?: CreatorProfileInsights;
};
