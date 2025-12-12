import { loadApiKeys } from './apiKeyStorage';
import { BrandSafetyResult, Creator } from '../types';

const BASE_URL = '/api/brand-safety';

async function handleResponse(res: Response) {
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (err) {
    console.warn('Failed to parse response JSON', err);
  }

  if (!res.ok) {
    const message = data?.error || data?.message || text || 'Request failed';
    throw new Error(message);
  }

  return data;
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
