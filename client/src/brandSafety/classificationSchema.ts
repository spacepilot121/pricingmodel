export const classificationSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    stance: { type: 'string', enum: ['Offender', 'Victim', 'Unrelated'] },
    category: { type: 'string', enum: ['', 'harmToMinors', 'sexualMisconduct', 'violence', 'hateOrDiscrimination', 'fraudOrScam', 'misinformation', 'guidelineViolations', 'personalDrama', 'insufficient_data'] },
    severity: { type: 'integer', minimum: 0, maximum: 5 },
    sentiment: { type: 'string', enum: ['negative', 'neutral', 'positive'] },
    mitigation: { type: 'boolean' }, summary: { type: 'string' }
  },
  required: ['stance', 'category', 'severity', 'sentiment', 'mitigation', 'summary']
};
