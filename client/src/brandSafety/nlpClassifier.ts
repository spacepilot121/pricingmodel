import { ApiKeys, BrandSafetyEvidence, Creator } from '../types';
import { openAiJson } from '../api/openAiJson';
import { classificationSchema } from './classificationSchema';

export async function classifyEvidenceBatch(evidence: BrandSafetyEvidence[], creator: Creator, keys: ApiKeys): Promise<BrandSafetyEvidence[]> {
  const enriched: BrandSafetyEvidence[] = [];
  // One structured request per small group rather than one request per snippet.
  for (let start = 0; start < evidence.length; start += 5) {
    const batch = evidence.slice(start, start + 5);
    const response = await openAiJson(keys, 'reputation_evidence', {
      type: 'object', additionalProperties: false,
      properties: { items: { type: 'array', items: {
        type: 'object', additionalProperties: false,
        properties: { id: { type: 'integer' }, classification: classificationSchema },
        required: ['id', 'classification']
      } } }, required: ['items']
    }, JSON.stringify({
      task: 'Assess each search snippet for this exact creator. Distinguish alleged conduct by the creator (Offender), harm to the creator (Victim), and unrelated content. Use severity 0 and empty category where no conduct is alleged. Search snippets are limited evidence. Do not infer guilt or invent missing details. Return one item for every supplied id.',
      creator, evidence: batch.map((item, id) => ({ id, title: item.title, snippet: item.snippet, url: item.url }))
    }));
    if (!Array.isArray(response.items) || response.items.length !== batch.length) throw new Error('Incomplete evidence classification. No final score calculated.');
    const ids = new Set();
    for (const item of response.items) {
      if (!Number.isInteger(item.id) || item.id < 0 || item.id >= batch.length || ids.has(item.id)) throw new Error('Invalid evidence mapping.');
      ids.add(item.id);
      const c = item.classification;
      if (!['Offender','Victim','Unrelated'].includes(c?.stance) || !Number.isInteger(c.severity) || c.severity < 0 || c.severity > 5 || !classificationSchema.properties.category.enum.includes(c.category) || !['negative','neutral','positive'].includes(c.sentiment) || typeof c.summary !== 'string' || typeof c.mitigation !== 'boolean') throw new Error('Invalid classification fields.');
      if (c.stance !== 'Offender') { c.category = ''; c.severity = 0; }
      enriched.push({ ...batch[item.id], classification: c });
    }
  }
  return enriched;
}
