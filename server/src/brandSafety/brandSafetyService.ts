import axios from 'axios';
import OpenAI from 'openai';
import { APOLOGY_SIGNAL_KEYWORDS, CONTROVERSY_KEYWORDS, RISK_THRESHOLDS, YOUTUBE_MAX_RECENT_VIDEOS } from './brandSafetyConfig.js';
import {
  BrandSafetyResult,
  Creator,
  CreatorProfile,
  Incident,
  SearchResultItem,
  BrandSafetyError,
  ApiKeys
} from './brandSafetyTypes.js';

function requireKey(value: string | undefined, envKey: string, label?: string): string {
  const resolved = value || process.env[envKey];
  if (!resolved) {
    const err: BrandSafetyError = new Error(`Missing required environment variables: ${label || envKey}`);
    err.status = 500;
    throw err;
  }
  return resolved;
}

function createOpenAIClient(apiKeys?: ApiKeys): OpenAI {
  const apiKey = requireKey(apiKeys?.openAiApiKey, 'OPENAI_API_KEY');
  return new OpenAI({ apiKey });
}

function resolveModel(apiKeys?: ApiKeys): string {
  return apiKeys?.openAiModel || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
}

function pickRiskLevel(score: number): 'Green' | 'Amber' | 'Red' {
  if (score <= RISK_THRESHOLDS.greenMax) return 'Green';
  if (score <= RISK_THRESHOLDS.amberMax) return 'Amber';
  return 'Red';
}

export async function evaluateCreatorRisk(creator: Creator, apiKeys: ApiKeys = {}): Promise<BrandSafetyResult> {
  const profile = await resolveCreatorProfile(creator, apiKeys);
  const searchItems = await searchReputationForCreator(profile, apiKeys);
  const searchIncidents = await classifySearchResultsWithOpenAI(profile, searchItems, apiKeys);
  const youtubeIncidents = await scanYouTubeMetadataForSignals(profile, apiKeys);
  const incidents = [...searchIncidents, ...youtubeIncidents];
  const { riskScore, riskLevel, categories, topDomains } = aggregateRiskScore(incidents);
  const summary = await summariseCreatorRiskWithOpenAI(profile, incidents, riskScore, riskLevel, apiKeys);

  return {
    creatorId: creator.id,
    creatorProfile: profile,
    riskScore,
    riskLevel,
    incidentCategories: categories,
    topSourceDomains: topDomains,
    incidents,
    summary,
    lastChecked: new Date().toISOString()
  };
}

async function resolveCreatorProfile(creator: Creator, apiKeys: ApiKeys): Promise<CreatorProfile> {
  if (creator.platform === 'YouTube') {
    const youtubeKey = apiKeys.youtubeApiKey || process.env.YOUTUBE_API_KEY;
    if (youtubeKey && (creator.channelId || creator.channelUrl)) {
      const channelId = await resolveYouTubeChannelId(creator, youtubeKey);
      if (channelId) {
        const profile = await fetchYouTubeProfile(channelId, youtubeKey);
        if (profile) return profile;
      }
    }
  }
  return {
    id: creator.id,
    primaryName: creator.name,
    altNames: [],
    handles: [],
    platform: creator.platform,
    channelUrl: creator.channelUrl,
    channelId: creator.channelId,
    description: undefined
  };
}

async function resolveYouTubeChannelId(creator: Creator, apiKey: string): Promise<string | undefined> {
  if (creator.channelId) return creator.channelId;
  if (!creator.channelUrl) return undefined;
  const url = creator.channelUrl;
  const handleMatch = url.match(/youtube\.com\/(?:@)([A-Za-z0-9_\-\.]+)/);
  if (handleMatch) {
    const handle = handleMatch[1];
    const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: { part: 'id', forHandle: handle, key: apiKey }
    });
    const channel = res.data.items?.[0];
    return channel?.id;
  }
  const idMatch = url.match(/channel\/([A-Za-z0-9_-]+)/);
  if (idMatch) return idMatch[1];
  return undefined;
}

async function fetchYouTubeProfile(channelId: string, apiKey: string): Promise<CreatorProfile | undefined> {
  const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
    params: { part: 'snippet,contentDetails', id: channelId, key: apiKey }
  });
  const channel = res.data.items?.[0];
  if (!channel) return undefined;
  const snippet = channel.snippet;
  const handles: string[] = [];
  if (snippet.customUrl) handles.push(snippet.customUrl);
  return {
    id: channelId,
    primaryName: snippet.title,
    altNames: snippet?.title ? [snippet.title] : [],
    handles,
    platform: 'YouTube',
    channelUrl: `https://www.youtube.com/channel/${channelId}`,
    channelId,
    description: snippet.description
  };
}

async function searchReputationForCreator(profile: CreatorProfile, apiKeys: ApiKeys): Promise<SearchResultItem[]> {
  const apiKey = requireKey(apiKeys.googleCseApiKey, 'GOOGLE_CSE_API_KEY');
  const cx = requireKey(apiKeys.googleCseCx, 'GOOGLE_CSE_CX');
  const results: SearchResultItem[] = [];
  for (const keyword of CONTROVERSY_KEYWORDS) {
    const query = `"${profile.primaryName}" ${keyword}`;
    const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
      params: { key: apiKey, cx, q: query, num: 3 }
    });
    const items = res.data.items || [];
    items.forEach((item: any) => {
      results.push({
        keyword,
        title: item.title,
        snippet: item.snippet,
        link: item.link,
        displayLink: item.displayLink,
        searchQuery: query
      });
    });
  }
  return results;
}

async function classifySearchResultsWithOpenAI(
  profile: CreatorProfile,
  items: SearchResultItem[],
  apiKeys: ApiKeys
): Promise<Incident[]> {
  if (!items.length) return [];
  const openai = createOpenAIClient(apiKeys);
  const promptItems = items
    .map(
      (item, idx) =>
        `${idx + 1}. Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}\nKeyword: ${item.keyword}`
    )
    .join('\n\n');
  try {
    const response = await openai.responses.create({
      model: resolveModel(apiKeys),
      input: [
        {
          role: 'system',
          content:
            'You assess public reputation risk for a creator on behalf of brands. Identify whether each search result refers to the same person and whether it alleges controversy. Never claim allegations are true; describe them as reported or alleged.'
        },
        {
          role: 'user',
          content: `Creator name: ${profile.primaryName}. Platform: ${profile.platform}.\nSearch results:\n${promptItems}\n\nReturn strict JSON with shape {"incidents": [...Incident]}.`
        }
      ],
      response_format: { type: 'json_object' }
    } as any);

    const text = (response as any).output?.[0]?.content?.[0]?.text || '';
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed.incidents) ? (parsed.incidents as Incident[]) : [];
  } catch (err) {
    console.error('OpenAI classification failed', err);
    return [];
  }
}

async function scanYouTubeMetadataForSignals(profile: CreatorProfile, apiKeys: ApiKeys): Promise<Incident[]> {
  if (profile.platform !== 'YouTube' || !profile.channelId) return [];
  const apiKey = requireKey(apiKeys.youtubeApiKey, 'YOUTUBE_API_KEY', 'YOUTUBE_API_KEY (or provide via settings)');
  try {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        channelId: profile.channelId,
        order: 'date',
        maxResults: YOUTUBE_MAX_RECENT_VIDEOS,
        key: apiKey
      }
    });
    const items: any[] = res.data.items || [];
    const candidateVideos = items
      .map((item) => ({
        videoId: item.id?.videoId,
        title: item.snippet?.title || '',
        description: item.snippet?.description || '',
        publishedAt: item.snippet?.publishedAt
      }))
      .filter((v) =>
        APOLOGY_SIGNAL_KEYWORDS.some((kw) =>
          `${v.title} ${v.description}`.toLowerCase().includes(kw.toLowerCase())
        )
      );
    if (!candidateVideos.length) return [];
    return classifyYouTubeSignalsWithOpenAI(profile, candidateVideos, apiKeys);
  } catch (err) {
    console.error('YouTube metadata scan failed', err);
    return [];
  }
}

async function classifyYouTubeSignalsWithOpenAI(
  profile: CreatorProfile,
  videos: { videoId: string; title: string; description: string; publishedAt?: string }[],
  apiKeys: ApiKeys
): Promise<Incident[]> {
  const openai = createOpenAIClient(apiKeys);
  try {
    const videoList = videos
      .map(
        (v, idx) =>
          `${idx + 1}. Title: ${v.title}\nDescription: ${v.description}\nPublished: ${v.publishedAt || 'unknown'}\nVideo URL: https://www.youtube.com/watch?v=${v.videoId}`
      )
      .join('\n\n');
    const response = await openai.responses.create({
      model: resolveModel(apiKeys),
      input: [
        {
          role: 'system',
          content:
            'Determine if these videos are apologies or responses to personal controversy. Use cautious language and never assert allegations as facts.'
        },
        {
          role: 'user',
          content: `Creator ${profile.primaryName}. Videos:\n${videoList}\nReturn strict JSON with {"incidents": [...Incident]}.`
        }
      ],
      response_format: { type: 'json_object' }
    } as any);
    const text = (response as any).output?.[0]?.content?.[0]?.text || '';
    const parsed = JSON.parse(text.trim());
    return Array.isArray(parsed.incidents) ? (parsed.incidents as Incident[]) : [];
  } catch (err) {
    console.error('OpenAI YouTube signal classification failed', err);
    return [];
  }
}

export function aggregateRiskScore(incidents: Incident[]): {
  riskScore: number;
  riskLevel: 'Green' | 'Amber' | 'Red';
  categories: string[];
  topDomains: string[];
} {
  const relevant = incidents.filter((i) => i.aboutSamePerson && i.category !== 'none');
  let total = 0;
  const now = new Date();
  relevant.forEach((incident) => {
    let base = incident.severity * incident.credibility * 10;
    if (incident.approxYear) {
      const yearsAgo = now.getFullYear() - incident.approxYear;
      if (yearsAgo > 3) {
        base = base / 2;
      }
    }
    total += base;
  });
  const riskScore = Math.min(100, Math.round(total));
  const riskLevel = pickRiskLevel(riskScore);
  const categories = Array.from(new Set(relevant.map((i) => i.category)));
  const topDomains = Array.from(new Set(relevant.map((i) => i.sourceDomain))).slice(0, 5);
  return { riskScore, riskLevel, categories, topDomains };
}

async function summariseCreatorRiskWithOpenAI(
  profile: CreatorProfile,
  incidents: Incident[],
  riskScore: number,
  riskLevel: 'Green' | 'Amber' | 'Red',
  apiKeys: ApiKeys
): Promise<string> {
  const openai = createOpenAIClient(apiKeys);
  const simplified = incidents.map((i) => ({
    category: i.category,
    summary: i.summary,
    sourceDomain: i.sourceDomain,
    approxYear: i.approxYear,
    aboutSamePerson: i.aboutSamePerson,
    severity: i.severity,
    credibility: i.credibility
  }));
  try {
    const response = await openai.responses.create({
      model: resolveModel(apiKeys),
      input: [
        {
          role: 'system',
          content:
            'Write a short, neutral brand-safety summary in cautious language. Emphasize that items are reported or alleged and avoid implying truth.'
        },
        {
          role: 'user',
          content: `Creator: ${profile.primaryName} (${profile.platform}). Risk score: ${riskScore} (${riskLevel}).\nIncidents: ${JSON.stringify(
            simplified
          )}\nProvide 2-3 sentences.`
        }
      ]
    } as any);
    const text = (response as any).output?.[0]?.content?.[0]?.text || '';
    return text.trim();
  } catch (err) {
    console.error('OpenAI summary failed', err);
    return 'Unable to generate summary at this time.';
  }
}
