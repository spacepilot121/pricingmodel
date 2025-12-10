import fs from 'fs';
import path from 'path';
import { BrandSafetyResult } from './brandSafetyTypes.js';

const cacheFilePath = path.resolve(process.cwd(), 'server/data/brandSafetyCache.json');

const cacheMap: Map<string, BrandSafetyResult> = new Map();

function loadCacheFromDisk() {
  try {
    if (fs.existsSync(cacheFilePath)) {
      const raw = fs.readFileSync(cacheFilePath, 'utf-8');
      const parsed: BrandSafetyResult[] = JSON.parse(raw);
      parsed.forEach((item) => cacheMap.set(item.creatorId, item));
    }
  } catch (err) {
    console.error('Failed to load brand safety cache:', err);
  }
}

function persistCacheToDisk() {
  try {
    const arr = Array.from(cacheMap.values());
    fs.mkdirSync(path.dirname(cacheFilePath), { recursive: true });
    fs.writeFileSync(cacheFilePath, JSON.stringify(arr, null, 2));
  } catch (err) {
    console.error('Failed to persist brand safety cache:', err);
  }
}

loadCacheFromDisk();

export function getResult(creatorId: string): BrandSafetyResult | undefined {
  return cacheMap.get(creatorId);
}

export function setResult(result: BrandSafetyResult): void {
  cacheMap.set(result.creatorId, result);
  persistCacheToDisk();
}

export function getAllResults(): BrandSafetyResult[] {
  return Array.from(cacheMap.values());
}
