import {
  GOOGLE_SEARCH_ENDPOINT,
  MAX_RESULTS,
  SEARCH_BATCH_SIZE,
  SEARCH_QUERY_TEMPLATES
} from './brandSafetyConfig';
import { ApiKeys, BrandSafetyEvidence, Creator } from '../types';

function buildQueryStrings(creator: Creator): string[] {
  const creatorToken = [creator.name, creator.handle].filter(Boolean).join(' ').trim();
  // Expanded identity-focused templates give the validator benign anchors to confirm the right person before scanning drama.
  return SEARCH_QUERY_TEMPLATES.map((template) =>
    template.replace('${creator}', creatorToken || creator.name)
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function searchOnce(query: string, keys: ApiKeys): Promise<BrandSafetyEvidence[]> {
  if (!keys.googleCseApiKey || !keys.googleCseCx) {
    throw new Error('Google Search API key and CX are required.');
  }

  const params = new URLSearchParams({
    key: keys.googleCseApiKey,
    cx: keys.googleCseCx,
    q: query,
    num: '5'
  });

  const res = await fetch(`${GOOGLE_SEARCH_ENDPOINT}?${params.toString()}`);
  const data: { items?: { title?: string; snippet?: string; link?: string }[]; error?: any } =
    await res.json();

  if (!res.ok) {
    const message = data?.error?.message || 'Google search failed';
    throw new Error(message);
  }

  return (
    data.items || []
  )
    .filter((item) => item?.link && (item.title || item.snippet))
    .map((item) => ({
      title: item.title || 'Untitled result',
      snippet: item.snippet || 'No snippet available',
      url: item.link || '#',
      classification: {
        stance: 'Unrelated',
        category: '',
        severity: 0,
        sentiment: 'neutral',
        mitigation: false,
        summary: ''
      },
      recency: 0,
      riskContribution: 0
    }));
}

export async function performSmartSearch(
  creator: Creator,
  keys: ApiKeys
): Promise<BrandSafetyEvidence[]> {
  const queries = buildQueryStrings(creator);
  const batches = chunk(queries, SEARCH_BATCH_SIZE);
  const collected: BrandSafetyEvidence[] = [];
  const errors: string[] = [];
  for (const batch of batches) {
    const results = await Promise.allSettled(batch.map((q) => searchOnce(q, keys)));
    results.forEach((res) => {
      if (res.status === 'fulfilled') {
        collected.push(...res.value);
      } else {
        const reason = (res.reason as any)?.message || String(res.reason || 'Unknown error');
        errors.push(reason);
      }
    });
  }

  if (!collected.length && errors.length) {
    const uniqueErrors = Array.from(new Set(errors.filter(Boolean)));
    const message = uniqueErrors[0] || 'Google search request failed';
    throw new Error(`${message}. Check your Google API key and CX configuration.`);
  }

  const unique = collected.filter(
    (item, idx, arr) => arr.findIndex((other) => other.url === item.url) === idx
  );

  return unique.slice(0, MAX_RESULTS);
}
