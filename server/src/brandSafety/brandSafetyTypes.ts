export type Creator = {
  id: string;
  name: string;
  platform: 'YouTube' | 'Twitch' | 'TikTok' | 'Other';
  channelUrl?: string;
  channelId?: string;
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

export type Incident = {
  aboutSamePerson: boolean;
  category:
    | 'racism'
    | 'harassment'
    | 'fraud'
    | 'sexual_misconduct'
    | 'hate_speech'
    | 'grooming'
    | 'abuse'
    | 'scam'
    | 'lawsuit'
    | 'other'
    | 'none';
  severity: 1 | 2 | 3;
  credibility: 1 | 2 | 3;
  approxYear?: number | null;
  summary: string;
  sourceDomain: string;
  sourceTitle: string;
  sourceUrl: string;
};

export type BrandSafetyResult = {
  creatorId: string;
  creatorProfile: CreatorProfile;
  riskScore: number;
  riskLevel: 'Green' | 'Amber' | 'Red';
  incidentCategories: string[];
  topSourceDomains: string[];
  incidents: Incident[];
  summary: string;
  lastChecked: string;
};

export type SearchResultItem = {
  keyword: string;
  title: string;
  snippet: string;
  link: string;
  displayLink: string;
  searchQuery: string;
};

export type BrandSafetyError = Error & { status?: number };

export type ApiKeys = {
  googleCseApiKey?: string;
  googleCseCx?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  youtubeApiKey?: string;
};
