/**
 * Entity Disambiguation Layer
 * ---------------------------
 * This module guards the brand safety pipeline from false positives when search results mention
 * similar-looking names (e.g. "Ali-A" vs "Alias"). It performs two passes:
 *   1) Local heuristic filters that run quickly in the browser.
 *   2) A semantic confirmation with GPT to resolve close-call entities.
 */

import { MODEL_DEFAULT, MODEL_UPSCALE, OPENAI_CHAT_ENDPOINT } from './brandSafetyConfig';

const MISLEADING_TERMS = [
  'alias',
  'alia',
  'aliah',
  'aliana',
  'ali-express',
  'aliexpress',
  'alis',
  'alii',
  'analysis'
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
export function isLikelyAboutCreator(snippet = '', creatorData = {}) {
  if (!snippet.trim()) return false;
  const lowerSnippet = snippet.toLowerCase();

  if (MISLEADING_TERMS.some((term) => lowerSnippet.includes(term))) {
    return false;
  }

  const identifiers = buildIdentifierSet(creatorData);
  const tokens = tokenise(lowerSnippet);
  const normalisedPrimary = (creatorData.primaryName || '').toLowerCase().trim();

  for (const rawName of identifiers) {
    const name = rawName.toLowerCase().trim();
    if (!name) continue;

    const boundaryRegex = new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i');
    if (boundaryRegex.test(snippet)) {
      return true;
    }

    const tokenContainingName = tokens.find((token) => token.includes(name));
    if (tokenContainingName) {
      // Name appears inside another word (e.g. "analysis"). Only accept if it is a very close typo.
      const distance = levenshtein(tokenContainingName, normalisedPrimary || name);
      return distance <= 2;
    }
  }

  // Fuzzy safety net: allow small typos that are close to the primary name.
  if (normalisedPrimary) {
    const closeToken = tokens.find((token) => levenshtein(token, normalisedPrimary) <= 2);
    if (closeToken) return true;
  }

  return false;
}

/**
 * Semantic disambiguation with GPT. This is slower and paid, so it runs only after the local filters.
 * The prompt instructs GPT to confirm the snippet really refers to the intended creator and to
 * reject near matches (Ali-A vs Alias/Alia/etc.).
 */
export async function verifyEntityWithGPT(snippet = '', creatorData = {}, options = {}) {
  const apiKey = options.apiKey;
  if (!apiKey) {
    throw new Error('OpenAI API key is required for entity verification.');
  }

  const model = options.model || MODEL_DEFAULT;
  const identifierList = (creatorData.identifiers || []).join(', ');
  const prompt = `We are checking whether the following text refers to the creator ${
    creatorData.primaryName || 'the target creator'
  } (also known as: ${identifierList}).\n\nRespond ONLY in JSON:\n{\n  "matchesCreator": true or false,\n  "reason": ""\n}\n\nRules:\n- Return false if the text refers to a different person with a similar name.\n- Return false if the text refers to a fictional character, artist, or influencer unrelated to ${
    creatorData.primaryName || 'the target creator'
  }.\n- Return false if the name appears inside another word (such as "alias").\n- If unclear, return false.`;

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
