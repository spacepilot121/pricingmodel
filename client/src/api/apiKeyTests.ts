import { ApiKeys } from '../types';
import { getApiBase } from './backendConfig';

export type ServiceTestResult = { ok: boolean; message: string };
export type GoogleTestResult = ServiceTestResult & { keyOk: boolean; cxOk: boolean };
export type ApiKeyTestResults = {
  googleTest: GoogleTestResult;
  openAiTest: ServiceTestResult;
  influencersClubTest: ServiceTestResult;
};

const GOOGLE_SEARCH_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';
const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const INFLUENCERS_CLUB_PROFILE_ENDPOINT = 'https://api.influencers.club/v1/creators/profile';
const API_BASE = getApiBase();

function isNetworkError(err: any) {
  return err?.message === 'Failed to fetch' || err?.name === 'TypeError' || !err?.status;
}

async function testGoogleKeys(keys: ApiKeys): Promise<GoogleTestResult> {
  const apiKey = keys.googleCseApiKey?.trim();
  const cx = keys.googleCseCx?.trim();
  const keyOk = Boolean(apiKey);
  const cxOk = Boolean(cx);

  if (!apiKey || !cx) {
    return { ok: false, keyOk, cxOk, message: 'Missing Google Search API key or CX' };
  }

  const params = new URLSearchParams({ q: 'test', key: apiKey, cx, num: '1' });
  try {
    const res = await fetch(`${GOOGLE_SEARCH_ENDPOINT}?${params.toString()}`);
    const data = await res.json();
    if (res.ok) {
      return { ok: true, keyOk: true, cxOk: true, message: 'Valid' };
    }
    return {
      ok: false,
      keyOk: true,
      cxOk: true,
      message: data?.error?.message || 'Google Search validation failed'
    };
  } catch (err: any) {
    return { ok: false, keyOk: true, cxOk: true, message: err?.message || 'Google Search validation failed' };
  }
}

async function testOpenAiKey(keys: ApiKeys): Promise<ServiceTestResult> {
  const apiKey = keys.openAiApiKey?.trim();
  if (!apiKey) {
    return { ok: false, message: 'Missing OpenAI API key' };
  }

  try {
    const res = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 5,
        temperature: 0
      })
    });

    const data = await res.json();
    if (res.ok) {
      return { ok: true, message: 'Valid' };
    }
    return { ok: false, message: data?.error?.message || 'OpenAI validation failed' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'OpenAI validation failed' };
  }
}

type InfluencersTestResponse = { ok: boolean; message: string };

async function runInfluencersValidation(
  url: string,
  body: Record<string, any>,
  headers: Record<string, string> = {}
): Promise<InfluencersTestResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);

  if (res.status === 401 || res.status === 403) {
    return { ok: false, message: data?.error?.message || 'Influencers.club validation failed' };
  }

  if (res.status === 429) {
    return { ok: false, message: 'Influencers.club rate limited the request. Please retry shortly.' };
  }

  if (!res.ok) {
    return {
      ok: false,
      message: data?.error?.message || data?.error || `Influencers.club responded with ${res.status}`
    };
  }

  const hasData = Boolean(data && Object.keys(data).length > 0);
  return { ok: hasData, message: hasData ? 'Valid' : 'Influencers.club returned an empty response' };
}

async function testInfluencersClubKey(keys: ApiKeys): Promise<ServiceTestResult> {
  const apiKey = keys.influencersClubApiKey?.trim();
  if (!apiKey) {
    return { ok: false, message: 'Missing Influencers.club API key' };
  }

  const payload = { handle: 'healthcheck', platform: 'YouTube', limit: 1 };

  try {
    return await runInfluencersValidation(INFLUENCERS_CLUB_PROFILE_ENDPOINT, payload, { 'x-api-key': apiKey });
  } catch (err: any) {
    if (!isNetworkError(err)) {
      return { ok: false, message: err?.message || 'Influencers.club validation failed' };
    }

    const proxyUrl = `${API_BASE || ''}/api/influencers-club/profile`;
    try {
      return await runInfluencersValidation(proxyUrl, { ...payload, apiKey });
    } catch (proxyErr: any) {
      const proxyMessage = proxyErr?.message || 'Proxy validation failed.';
      return {
        ok: false,
        message: `Influencers.club API: ${err?.message || 'Failed to fetch'}. Proxy: ${proxyMessage}. If you are running from a static host, start the backend server and ensure /api/influencers-club/profile is reachable.`
      };
    }
  }
}

export async function testApiKeys(keys: ApiKeys): Promise<ApiKeyTestResults> {
  const [googleTest, openAiTest, influencersClubTest] = await Promise.all([
    testGoogleKeys(keys),
    testOpenAiKey(keys),
    testInfluencersClubKey(keys)
  ]);

  return { googleTest, openAiTest, influencersClubTest };
}
