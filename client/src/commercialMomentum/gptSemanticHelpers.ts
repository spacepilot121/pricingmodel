import { ApiKeys, CommercialPost, CommercialSemanticSummary, SponsoredTone } from '../types';

const OPENAI_CHAT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const MODEL_DEFAULT = import.meta.env?.VITE_OPENAI_MODEL?.trim() || 'gpt-4o-mini';

function buildClientPayload(model: string, prompt: string) {
  return {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: 'You are assisting a marketing analyst. Respond with valid JSON only.' },
      { role: 'user', content: prompt }
    ]
  };
}

export async function inferSponsoredWithGpt(caption: string, keys: ApiKeys): Promise<boolean> {
  if (!keys.openAiApiKey) return false;
  const model = keys.openAiModel || MODEL_DEFAULT;
  const res = await fetch(OPENAI_CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keys.openAiApiKey}`
    },
    body: JSON.stringify(
      buildClientPayload(
        model,
        'Is this post sponsored content. Respond true or false.\n\nPost caption:\n' + (caption || '')
      )
    )
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || 'Unable to classify sponsorship.');
  }
  const content = data?.choices?.[0]?.message?.content || 'false';
  try {
    const parsed = JSON.parse(content);
    if (typeof parsed === 'boolean') return parsed;
    if (typeof parsed?.answer === 'boolean') return parsed.answer;
  } catch (err) {
    // fall through
  }
  return /true/i.test(content);
}

export async function classifyToneForSponsoredPosts(
  posts: CommercialPost[],
  keys: ApiKeys
): Promise<CommercialSemanticSummary> {
  if (!keys.openAiApiKey || !posts.length) {
    return { toneCounts: {}, audienceSummary: '' };
  }
  const model = keys.openAiModel || MODEL_DEFAULT;
  const toneCounts: Partial<Record<SponsoredTone, number>> = {};
  const reactions: string[] = [];

  for (const post of posts) {
    const prompt = `You are analysing influencer sponsored content.
Classify the tone as one of:

authentic
neutral
overly commercial
audience resistant

Summarise audience reaction in one sentence.

Caption:\n${post.caption || ''}`;

    const res = await fetch(OPENAI_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${keys.openAiApiKey}`
      },
      body: JSON.stringify(buildClientPayload(model, prompt))
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error?.message || 'Unable to classify sponsored tone.');
    }
    const content = data?.choices?.[0]?.message?.content || '';
    try {
      const parsed = JSON.parse(content) as { tone?: SponsoredTone; summary?: string };
      if (parsed.tone) {
        toneCounts[parsed.tone] = (toneCounts[parsed.tone] || 0) + 1;
      }
      if (parsed.summary) reactions.push(parsed.summary);
    } catch (err) {
      // If parsing fails, fall back to simple heuristic extraction.
      const lower = content.toLowerCase();
      if (lower.includes('authentic')) toneCounts['authentic'] = (toneCounts['authentic'] || 0) + 1;
      else if (lower.includes('neutral')) toneCounts['neutral'] = (toneCounts['neutral'] || 0) + 1;
      else if (lower.includes('resistant'))
        toneCounts['audience resistant'] = (toneCounts['audience resistant'] || 0) + 1;
      else if (lower.includes('commercial')) toneCounts['overly commercial'] = (toneCounts['overly commercial'] || 0) + 1;
    }
  }

  return {
    toneCounts,
    audienceSummary: reactions[0] || ''
  };
}
