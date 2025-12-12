import axios from 'axios';
import OpenAI from 'openai';
import { APOLOGY_SIGNAL_KEYWORDS, CONTROVERSY_KEYWORDS, RISK_THRESHOLDS, YOUTUBE_MAX_RECENT_VIDEOS } from './brandSafetyConfig.js';
function requireKey(value, envKey, label) {
    const resolved = value || process.env[envKey];
    if (!resolved) {
        const err = new Error(`Missing required environment variables: ${label || envKey}`);
        err.status = 500;
        throw err;
    }
    return resolved;
}
function createOpenAIClient(apiKeys) {
    const apiKey = requireKey(apiKeys?.openAiApiKey, 'OPENAI_API_KEY');
    return new OpenAI({ apiKey });
}
function resolveModel(apiKeys) {
    return apiKeys?.openAiModel || process.env.OPENAI_MODEL || 'gpt-4.1-mini';
}
function uniqueStrings(values) {
    const set = new Set(values.map((v) => v?.trim()).filter(Boolean));
    return Array.from(set).slice(0, 5);
}
function normaliseHandle(handle) {
    if (!handle)
        return undefined;
    const trimmed = handle.trim();
    if (!trimmed)
        return undefined;
    return trimmed.startsWith('@') ? trimmed : `@${trimmed}`;
}
function extractHandleFromUrl(url) {
    if (!url)
        return undefined;
    const handleMatch = url.match(/youtube\.com\/(?:@)([A-Za-z0-9_\-\.]+)/);
    if (handleMatch)
        return `@${handleMatch[1]}`;
    return undefined;
}
function pickRiskLevel(score) {
    if (score <= RISK_THRESHOLDS.greenMax)
        return 'Green';
    if (score <= RISK_THRESHOLDS.amberMax)
        return 'Amber';
    return 'Red';
}
function buildError(message, status = 500) {
    const err = new Error(message);
    err.status = status;
    return err;
}
export async function testApiKey(service, apiKeys = {}) {
    try {
        if (service === 'google') {
            const key = requireKey(apiKeys.googleCseApiKey, 'GOOGLE_CSE_API_KEY');
            const cx = requireKey(apiKeys.googleCseCx, 'GOOGLE_CSE_CX');
            await axios.get('https://www.googleapis.com/customsearch/v1', {
                params: { key, cx, q: 'brand safety connectivity test', num: 1 }
            });
            return { ok: true, message: 'Google Custom Search key responded successfully.' };
        }
        if (service === 'openai') {
            const openai = createOpenAIClient(apiKeys);
            await openai.responses.create({
                model: resolveModel(apiKeys),
                input: [{ role: 'user', content: 'Return the word ok.' }],
                max_output_tokens: 1
            });
            return { ok: true, message: 'OpenAI key authenticated successfully.' };
        }
        if (service === 'youtube') {
            const apiKey = requireKey(apiKeys.youtubeApiKey, 'YOUTUBE_API_KEY', 'YOUTUBE_API_KEY (or provide via settings)');
            await axios.get('https://www.googleapis.com/youtube/v3/search', {
                params: { part: 'snippet', q: 'brand safety test', type: 'channel', maxResults: 1, key: apiKey }
            });
            return { ok: true, message: 'YouTube Data API key responded successfully.' };
        }
    }
    catch (err) {
        console.error(`API key test failed for ${service}`, err?.response?.data || err);
        const status = err?.response?.status || err?.status || 500;
        const message = err?.response?.data?.error?.message || err?.response?.data?.error || err?.message || 'Key test failed';
        throw buildError(message, status);
    }
    throw buildError('Unsupported service for API key test', 400);
}
export async function evaluateCreatorRisk(creator, apiKeys = {}) {
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
async function resolveCreatorProfile(creator, apiKeys) {
    const providedHandle = normaliseHandle(creator.handle);
    if (creator.platform === 'YouTube') {
        const youtubeKey = apiKeys.youtubeApiKey || process.env.YOUTUBE_API_KEY;
        if (youtubeKey && (creator.channelId || creator.channelUrl)) {
            const channelId = await resolveYouTubeChannelId(creator, youtubeKey);
            if (channelId) {
                const profile = await fetchYouTubeProfile(channelId, youtubeKey);
                if (profile) {
                    const handles = uniqueStrings([
                        ...profile.handles,
                        providedHandle,
                        extractHandleFromUrl(creator.channelUrl)
                    ]);
                    const altNames = uniqueStrings([
                        ...profile.altNames,
                        creator.name,
                        providedHandle?.replace(/^@/, ''),
                        ...handles.map((h) => h.replace(/^@/, ''))
                    ]);
                    return { ...profile, handles, altNames };
                }
            }
        }
    }
    return {
        id: creator.id,
        primaryName: creator.name,
        altNames: uniqueStrings([creator.name, providedHandle?.replace(/^@/, '')]),
        handles: uniqueStrings([providedHandle, extractHandleFromUrl(creator.channelUrl)]),
        platform: creator.platform,
        channelUrl: creator.channelUrl,
        channelId: creator.channelId,
        description: undefined
    };
}
async function resolveYouTubeChannelId(creator, apiKey) {
    if (creator.channelId)
        return creator.channelId;
    if (!creator.channelUrl)
        return undefined;
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
    if (idMatch)
        return idMatch[1];
    return undefined;
}
async function fetchYouTubeProfile(channelId, apiKey) {
    const res = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'snippet,contentDetails', id: channelId, key: apiKey }
    });
    const channel = res.data.items?.[0];
    if (!channel)
        return undefined;
    const snippet = channel.snippet;
    const handles = [];
    if (snippet.customUrl)
        handles.push(normaliseHandle(snippet.customUrl) || snippet.customUrl);
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
async function searchReputationForCreator(profile, apiKeys) {
    const apiKey = requireKey(apiKeys.googleCseApiKey, 'GOOGLE_CSE_API_KEY');
    const cx = requireKey(apiKeys.googleCseCx, 'GOOGLE_CSE_CX');
    const results = [];
    const searchNames = uniqueStrings([
        profile.primaryName,
        ...profile.altNames,
        ...profile.handles,
        profile.channelUrl
    ]).map((name) => name.replace(/^https?:\/\//, ''));
    async function pushGoogleResults(query, keyword) {
        const res = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: { key: apiKey, cx, q: query, num: 3 }
        });
        const items = res.data.items || [];
        items.forEach((item) => {
            if (!item?.link)
                return;
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
    for (const name of searchNames) {
        for (const keyword of CONTROVERSY_KEYWORDS) {
            const baseQuery = `"${name}" ${keyword}`;
            await pushGoogleResults(baseQuery, keyword);
            if (profile.platform === 'YouTube') {
                await pushGoogleResults(`site:youtube.com ${baseQuery}`, keyword);
            }
        }
    }
    const youtubeResults = await searchYouTubeForControversy(profile, apiKeys, searchNames);
    const deduped = results
        .concat(youtubeResults)
        .filter((item, idx, arr) => arr.findIndex((i) => i.link === item.link) === idx);
    return deduped;
}
async function searchYouTubeForControversy(profile, apiKeys, searchNames) {
    if (!apiKeys.youtubeApiKey || profile.platform !== 'YouTube')
        return [];
    try {
        const scopedKeywords = CONTROVERSY_KEYWORDS.slice(0, 6);
        const names = searchNames.slice(0, 2);
        const results = [];
        for (const name of names) {
            for (const keyword of scopedKeywords) {
                const q = `${name} ${keyword}`;
                const res = await axios.get('https://www.googleapis.com/youtube/v3/search', {
                    params: {
                        part: 'snippet',
                        q,
                        type: 'video',
                        maxResults: 2,
                        key: apiKeys.youtubeApiKey
                    }
                });
                const items = res.data.items || [];
                items.forEach((item) => {
                    const videoId = item.id?.videoId;
                    if (!videoId)
                        return;
                    results.push({
                        keyword,
                        title: item.snippet?.title || 'YouTube result',
                        snippet: item.snippet?.description || '',
                        link: `https://www.youtube.com/watch?v=${videoId}`,
                        displayLink: 'youtube.com',
                        searchQuery: q
                    });
                });
            }
        }
        return results;
    }
    catch (err) {
        console.error('YouTube controversy search failed', err);
        return [];
    }
}
async function classifySearchResultsWithOpenAI(profile, items, apiKeys) {
    if (!items.length)
        return [];
    const openai = createOpenAIClient(apiKeys);
    const promptItems = items
        .map((item, idx) => `${idx + 1}. Title: ${item.title}\nSnippet: ${item.snippet}\nLink: ${item.link}\nKeyword: ${item.keyword}`)
        .join('\n\n');
    try {
        const response = await openai.responses.create({
            model: resolveModel(apiKeys),
            input: [
                {
                    role: 'system',
                    content: 'You assess public reputation risk for a creator on behalf of brands. Identify whether each search result refers to the same person and whether it alleges controversy. Never claim allegations are true; describe them as reported or alleged.'
                },
                {
                    role: 'user',
                    content: `Creator name: ${profile.primaryName}. Platform: ${profile.platform}.\nSearch results:\n${promptItems}\n\nReturn strict JSON with shape {"incidents": [...Incident]}.`
                }
            ],
            response_format: { type: 'json_object' }
        });
        const text = response.output?.[0]?.content?.[0]?.text || '';
        const parsed = JSON.parse(text.trim());
        return Array.isArray(parsed.incidents) ? parsed.incidents : [];
    }
    catch (err) {
        console.error('OpenAI classification failed', err);
        return [];
    }
}
async function scanYouTubeMetadataForSignals(profile, apiKeys) {
    if (profile.platform !== 'YouTube' || !profile.channelId)
        return [];
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
        const items = res.data.items || [];
        const candidateVideos = items
            .map((item) => ({
            videoId: item.id?.videoId,
            title: item.snippet?.title || '',
            description: item.snippet?.description || '',
            publishedAt: item.snippet?.publishedAt
        }))
            .filter((v) => APOLOGY_SIGNAL_KEYWORDS.some((kw) => `${v.title} ${v.description}`.toLowerCase().includes(kw.toLowerCase())));
        if (!candidateVideos.length)
            return [];
        return classifyYouTubeSignalsWithOpenAI(profile, candidateVideos, apiKeys);
    }
    catch (err) {
        console.error('YouTube metadata scan failed', err);
        return [];
    }
}
async function classifyYouTubeSignalsWithOpenAI(profile, videos, apiKeys) {
    const openai = createOpenAIClient(apiKeys);
    try {
        const videoList = videos
            .map((v, idx) => `${idx + 1}. Title: ${v.title}\nDescription: ${v.description}\nPublished: ${v.publishedAt || 'unknown'}\nVideo URL: https://www.youtube.com/watch?v=${v.videoId}`)
            .join('\n\n');
        const response = await openai.responses.create({
            model: resolveModel(apiKeys),
            input: [
                {
                    role: 'system',
                    content: 'Determine if these videos are apologies or responses to personal controversy. Use cautious language and never assert allegations as facts.'
                },
                {
                    role: 'user',
                    content: `Creator ${profile.primaryName}. Videos:\n${videoList}\nReturn strict JSON with {"incidents": [...Incident]}.`
                }
            ],
            response_format: { type: 'json_object' }
        });
        const text = response.output?.[0]?.content?.[0]?.text || '';
        const parsed = JSON.parse(text.trim());
        return Array.isArray(parsed.incidents) ? parsed.incidents : [];
    }
    catch (err) {
        console.error('OpenAI YouTube signal classification failed', err);
        return [];
    }
}
export function aggregateRiskScore(incidents) {
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
async function summariseCreatorRiskWithOpenAI(profile, incidents, riskScore, riskLevel, apiKeys) {
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
                    content: 'Write a short, neutral brand-safety summary in cautious language. Emphasize that items are reported or alleged and avoid implying truth.'
                },
                {
                    role: 'user',
                    content: `Creator: ${profile.primaryName} (${profile.platform}). Risk score: ${riskScore} (${riskLevel}).\nIncidents: ${JSON.stringify(simplified)}\nProvide 2-3 sentences.`
                }
            ]
        });
        const text = response.output?.[0]?.content?.[0]?.text || '';
        return text.trim();
    }
    catch (err) {
        console.error('OpenAI summary failed', err);
        return 'Unable to generate summary at this time.';
    }
}
