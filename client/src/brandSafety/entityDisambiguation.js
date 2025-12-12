/**
 * Entity Disambiguation Layer
 * ---------------------------
 * This module guards the brand safety pipeline from false positives when search results mention
 * similar-looking names (e.g. "Ali-A" vs "Alias"). It performs two passes:
 *   1) Local heuristic filters that run quickly in the browser.
 *   2) A semantic confirmation with GPT to resolve close-call entities.
 */

import { MODEL_DEFAULT, MODEL_UPSCALE, OPENAI_CHAT_ENDPOINT } from './brandSafetyConfig';

const MISLEADING_TERMS = ['alias', 'aliexpress', 'analytical', 'analysis'];

const CREATOR_CONTEXT_TERMS = [
  'youtube',
  'youtuber',
  'influencer',
  'streamer',
  'twitch',
  'gaming',
  'beauty',
  'vlog',
  'commentary',
  'fashion',
  'lifestyle',
  'creator',
  'social media personality',
  'video',
  'stream'
];

/** Escape regex special characters so we can safely build boundary-aware expressions. */
function escapeRegExp(value = '') {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lightweight Levenshtein distance implementation for fuzzy matching. */
function levenshtein(a = '', b = '') {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  const matrix = Array.from({ length: aLen + 1 }, () => new Array(bLen + 1).fill(0));
  for (let i = 0; i <= aLen; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= bLen; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= aLen; i += 1) {
    for (let j = 1; j <= bLen; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[aLen][bLen];
}

function tokenise(text = '') {
  return text
    .split(/[^a-z0-9@'+-]+/i)
    .map((t) => t.trim())
    .filter(Boolean);
}

function normaliseSnippetInput(snippetOrContext = '') {
  if (typeof snippetOrContext === 'string') {
    return { snippet: snippetOrContext };
  }
  return snippetOrContext || { snippet: '' };
}

function urlToTokens(url = '') {
  try {
    const parsed = new URL(url);
    const pathTokens = tokenise(parsed.pathname.replace(/[/?#]/g, ' '));
    const hostTokens = tokenise(parsed.hostname.replace(/^www\./, ''));
    return [...hostTokens, ...pathTokens];
  } catch (err) {
    return tokenise(url);
  }
}

function buildContextualTokenSet(context = {}) {
  const { snippet = '', title = '', url = '', metaDescription = '', richSnippet = '' } = context;
  const combined = [title, url, metaDescription, richSnippet, snippet].filter(Boolean).join(' ');
  const tokens = tokenise(combined.toLowerCase());
  const urlTokens = urlToTokens(url.toLowerCase());
  return Array.from(new Set([...tokens, ...urlTokens]));
}

function hasContextTerm(text = '') {
  const lower = text.toLowerCase();
  return CREATOR_CONTEXT_TERMS.some((term) => new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i').test(lower));
}

function buildIdentifierSet(creatorData = {}) {
  const { primaryName, realName, identifiers = [] } = creatorData;
  const pool = [primaryName, realName, ...identifiers].filter(Boolean);
  return Array.from(new Set(pool));
}

/**
 * Local heuristic stage: reject obvious false positives before paying for GPT tokens.
 * - Filters misleading terms (alias, aliexpress, analysis, etc.).
 * - Requires the creator's name to appear as a whole word; substrings inside larger words are rejected
 *   unless the fuzzy distance is extremely small (<= 2 characters away).
 * - Accepts if any known identifier is present.
 */
export function isLikelyAboutCreator(snippetOrContext = '', creatorData = {}) {
  const context = normaliseSnippetInput(snippetOrContext);
  const { snippet = '', title = '', url = '', metaDescription = '', richSnippet = '' } = context;
  const aggregated = [title, metaDescription, richSnippet, snippet, url].filter(Boolean).join(' ').trim();
  if (!aggregated) return false;

  const lowerCombined = aggregated.toLowerCase();
  const tokens = buildContextualTokenSet(context);
  const hasMisleadingToken = tokens.some((token) => MISLEADING_TERMS.includes(token));
  const identifiers = buildIdentifierSet(creatorData);
  const normalisedPrimary = (creatorData.primaryName || '').toLowerCase().trim();
  const contextTermPresent = hasContextTerm(lowerCombined);

  for (const rawName of identifiers) {
    const name = rawName.toLowerCase().trim();
    if (!name) continue;

    const boundaryRegex = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    if (boundaryRegex.test(aggregated)) {
      return true;
    }

    // Reject only when the name is consumed entirely by a misleading token (alias, analysis, etc.).
    const misleadingCollision = tokens.some(
      (token) => MISLEADING_TERMS.includes(token) && levenshtein(token, name) <= 2
    );
    if (misleadingCollision) {
      continue;
    }

    const closeToken = tokens.find((token) => levenshtein(token, name) <= 2);
    if (closeToken) {
      return true;
    }

    const fuzzyToken = tokens.find((token) => levenshtein(token, name) <= 4);
    if (fuzzyToken && contextTermPresent) {
      return true;
    }
  }

  // Contextual acceptance: if the text clearly refers to creator ecosystems and the name is close, accept.
  if (contextTermPresent && normalisedPrimary) {
    const nearPrimary = tokens.find((token) => levenshtein(token, normalisedPrimary) <= 4);
    if (nearPrimary && !hasMisleadingToken) {
      return true;
    }
  }

  return false;
}

/**
 * Semantic disambiguation with GPT. This is slower and paid, so it runs only after the local filters.
 * The prompt instructs GPT to confirm the snippet really refers to the intended creator and to
 * reject near matches (Ali-A vs Alias/Alia/etc.).
 */
export async function verifyEntityWithGPT(snippetOrContext = '', creatorData = {}, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key is required for entity verification.');
  }

  const model = options.model || MODEL_DEFAULT;
  const identifierList = (creatorData.identifiers || []).join(', ');
  const context = normaliseSnippetInput(snippetOrContext);
  const contextForPrompt = [
    context.title ? `Title: ${context.title}` : '',
    context.url ? `URL: ${context.url}` : '',
    context.metaDescription ? `Meta: ${context.metaDescription}` : '',
    context.richSnippet ? `Rich snippet: ${context.richSnippet}` : '',
    context.snippet ? `Snippet: ${context.snippet}` : ''
  ]
    .filter(Boolean)
    .join('\n');
  const prompt = `We are checking whether the following web result refers to the creator ${
    creatorData.primaryName || 'the target creator'
  } (also known as: ${identifierList}).\n\n${contextForPrompt}\n\nRespond ONLY in JSON:\n{\n  "matchesCreator": true or false,\n  "reason": ""\n}\n\nRules:\n- Return false if the text refers to a different person with a similar name.\n- Return false if the text refers to a fictional character, artist, or influencer unrelated to ${
    creatorData.primaryName || 'the target creator'
  }.\n- Return false if the name appears inside another word (such as "alias").\n- If the text plausibly describes the creator based on career, platform, domain, or context, return true.\n- Only return false if it clearly refers to a different person.`;

  const response = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: model === MODEL_UPSCALE ? MODEL_UPSCALE : MODEL_DEFAULT,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: 'You are an entity disambiguation assistant for brand safety. Respond in JSON only.'
        },
        { role: 'user', content: prompt }
      ]
    })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'OpenAI entity verification failed');
  }

  const content = data?.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content);
    return {
      matchesCreator: Boolean(parsed.matchesCreator),
      reason: parsed.reason || ''
    };
  } catch (err) {
    return { matchesCreator: false, reason: 'Unable to parse GPT response' };
  }
}

/**
 * Example: Ali-A vs "Alias" Reddit article should be discarded by the heuristic layer.
 */
export function exampleAliARejectsAliasArticle() {
  const creatorData = {
    primaryName: 'Ali-A',
    realName: 'Alastair Aiken',
    identifiers: ['Ali-A', 'Ali A', 'Alastair Aiken', "Alastair 'Ali-A' Aiken", 'MrAliA', 'MoreAliA', 'AliA']
  };
  const snippet = 'Reddit thread claims Alias was involved in a leak yesterday.';
  return {
    snippet,
    expected: false,
    result: isLikelyAboutCreator(snippet, creatorData)
  };
}

export { levenshtein };
