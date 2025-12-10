import { BrandSafetyResult, Creator } from '../types';

const BASE_URL = '/api/brand-safety';

async function handleResponse(res: Response) {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Request failed');
  }
  return res.json();
}

export async function scanManyCreators(creators: Creator[]): Promise<BrandSafetyResult[]> {
  const res = await fetch(`${BASE_URL}/scan-many`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creators })
  });
  const data = await handleResponse(res);
  return data.results;
}

export async function scanOneCreator(creator: Creator): Promise<BrandSafetyResult> {
  const res = await fetch(`${BASE_URL}/scan-one`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creator })
  });
  const data = await handleResponse(res);
  return data.result;
}

export async function getAllBrandSafetyResults(): Promise<BrandSafetyResult[]> {
  const res = await fetch(`${BASE_URL}/results`);
  const data = await handleResponse(res);
  return data.results;
}
