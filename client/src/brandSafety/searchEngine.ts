import {
  GOOGLE_SEARCH_ENDPOINT,
  MAX_RESULTS,
  SEARCH_BATCH_SIZE,
  SEARCH_IDENTITY_BOOSTERS,
  SEARCH_QUERY_BLOCKS
} from './brandSafetyConfig';
import { ApiKeys, BrandSafetyEvidence, Creator } from '../types';

function buildIdentityTokens(creator: Creator): string[] {
  const cleanedHandle = creator.handle?.replace(/^@/, '')?.trim();
  const cleanedChannel = creator.channelUrl?.replace(/^https?:\/\//, '').trim();
  const tokens = [creator.name, cleanedHandle, creator.channelId, cleanedChannel]
    .filter(Boolean)
    .map((token) => token!.trim()) as string[];
  return Array.from(new Set(tokens)).filter(Boolean);
}

function buildQueryStrings(creator: Creator): string[] {
  // Build one identity-anchored query that aggregates all reputational themes to keep calls to a
  // single Google request per creator.
  const identityTokens = buildIdentityTokens(creator);
  const identityClause = identityTokens
    .map((token) => `"${token}"`)
    .filter(Boolean)
    .join(' OR ');

  const boosters = SEARCH_IDENTITY_BOOSTERS.map((token) => `"${token}"`).join(' OR ');
  const fallbackIdentity = (creator.name || creator.handle || identityTokens[0] || 'creator').trim();
  const base = identityClause ? `(${identityClause})` : `"${fallbackIdentity}"`;
  const identityAnchors = boosters ? `${base} (${boosters})` : base;

  const termClause = Array.from(new Set(SEARCH_QUERY_BLOCKS.flat()))
    .map((term) => `"${term}"`)
    .join(' OR ');

  return [`${identityAnchors} (${termClause})`.trim()];
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
