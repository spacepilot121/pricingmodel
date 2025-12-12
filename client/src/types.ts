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

export type BrandSafetyEvidence = {
  title: string;
  snippet: string;
  url: string;
};

export type BrandSafetyResult = {
  creatorId: string;
  creatorName: string;
  creatorHandle?: string;
  riskScore: number;
  riskLevel: 'Low' | 'Medium' | 'High';
  summary: string;
  evidence: BrandSafetyEvidence[];
  lastChecked: string;
};

export type ApiKeys = {
  googleCseApiKey?: string;
  googleCseCx?: string;
  openAiApiKey?: string;
  openAiModel?: string;
  youtubeApiKey?: string;
};
