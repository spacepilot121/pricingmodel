import { loadApiKeys } from './apiKeyStorage';
import { BrandSafetyResult, Creator } from '../types';
import { getBrandSafetyBaseUrl } from './brandSafetyConfig';

export type ApiKeyService = 'google' | 'openai' | 'youtube';

async function handleResponse(res: Response) {
  const text = await res.text();
  let data: any = null;
  const contentType = res.headers.get('content-type') || '';
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn('Failed to parse response JSON', err);
  }

  if (!res.ok) {
    const message = data?.error || data?.message || buildFallbackError(res, text, contentType);
    throw new Error(message);
  }

  return data;
}

function buildFallbackError(res: Response, text: string, contentType: string) {
  const htmlError = contentType.includes('text/html') || /<html/i.test(text);
  const sanitizedText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const backendMessage =
    'Brand safety checks need the Express backend. If you are on GitHub Pages or another static host, set Settings → API endpoint to a deployed server (with CORS enabled) and retry.';

  if (res.status === 405) {
    return backendMessage;
  }

  if (htmlError) {
    return backendMessage;
  }

  return sanitizedText || 'Request failed';
}

function buildUrl(path: string) {
  const base = getBrandSafetyBaseUrl();
  const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${normalizedBase}${normalizedPath}`;
}

export async function scanManyCreators(creators: Creator[]): Promise<BrandSafetyResult[]> {
  const res = await fetch(buildUrl('/scan-many'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creators, apiKeys: loadApiKeys() })
  });
  const data = await handleResponse(res);
  return data.results;
}

export async function scanOneCreator(creator: Creator): Promise<BrandSafetyResult> {
  const res = await fetch(buildUrl('/scan-one'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator, apiKeys: loadApiKeys() })
  });
  const data = await handleResponse(res);
  return data.result;
}

export async function getAllBrandSafetyResults(): Promise<BrandSafetyResult[]> {
  const res = await fetch(buildUrl('/results'));
  const data = await handleResponse(res);
  return data.results;
}

export async function testApiKey(service: ApiKeyService): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(buildUrl('/test-key'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, apiKeys: loadApiKeys() })
  });
  return handleResponse(res);
}
