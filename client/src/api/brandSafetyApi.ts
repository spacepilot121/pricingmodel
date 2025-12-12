import { loadApiKeys } from './apiKeyStorage';
import { BrandSafetyResult, Creator } from '../types';

const BASE_URL = '/api/brand-safety';

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

  if (res.status === 405 || htmlError) {
    return 'This action needs the backend server running. The hosted demo cannot test API keys — run the app locally with the server started to verify them.';
  }

  return text || 'Request failed';
}

export async function scanManyCreators(creators: Creator[]): Promise<BrandSafetyResult[]> {
  const res = await fetch(`${BASE_URL}/scan-many`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creators, apiKeys: loadApiKeys() })
  });
  const data = await handleResponse(res);
  return data.results;
}

export async function scanOneCreator(creator: Creator): Promise<BrandSafetyResult> {
  const res = await fetch(`${BASE_URL}/scan-one`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator, apiKeys: loadApiKeys() })
  });
  const data = await handleResponse(res);
  return data.result;
}

export async function getAllBrandSafetyResults(): Promise<BrandSafetyResult[]> {
  const res = await fetch(`${BASE_URL}/results`);
  const data = await handleResponse(res);
  return data.results;
}

export async function testApiKey(service: ApiKeyService): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE_URL}/test-key`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ service, apiKeys: loadApiKeys() })
  });
  return handleResponse(res);
}
