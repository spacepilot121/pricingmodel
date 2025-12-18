import { ApiKeys } from '../types';

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

async function testInfluencersClubKey(keys: ApiKeys): Promise<ServiceTestResult> {
  const apiKey = keys.influencersClubApiKey?.trim();
  if (!apiKey) {
    return { ok: false, message: 'Missing Influencers.club API key' };
  }

  try {
    const res = await fetch(INFLUENCERS_CLUB_PROFILE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({ handle: 'healthcheck', platform: 'YouTube', limit: 1 })
    });

    const data = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: data?.error?.message || 'Influencers.club validation failed' };
    }

    if (res.ok) {
      return { ok: true, message: 'Valid' };
    }

    return { ok: true, message: data?.error?.message || 'Influencers.club key accepted' };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Influencers.club validation failed' };
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
