import express from 'express';
import { evaluateCreatorRisk } from './brandSafetyService.js';
import { getAllResults, getResult, setResult } from './brandSafetyCache.js';
import { Creator } from './brandSafetyTypes.js';

const router = express.Router();

router.post('/scan-one', async (req, res) => {
  try {
    const creator: Creator = req.body.creator;
    const apiKeys = req.body.apiKeys;
    if (!creator || !creator.id) {
      return res.status(400).json({ error: 'creator is required' });
    }
    const result = await evaluateCreatorRisk(creator, apiKeys);
    setResult(result);
    res.json({ result });
  } catch (err: any) {
    console.error('scan-one failed', err);
    res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
  }
});

router.post('/scan-many', async (req, res) => {
  try {
    const creators: Creator[] = req.body.creators || [];
    const apiKeys = req.body.apiKeys;
    if (!Array.isArray(creators) || !creators.length) {
      return res.status(400).json({ error: 'creators array is required' });
    }
    const results = [] as any[];
    for (const creator of creators) {
      try {
        const result = await evaluateCreatorRisk(creator, apiKeys);
        setResult(result);
        results.push(result);
      } catch (innerErr: any) {
        console.error(`scan-many failed for ${creator.id}`, innerErr);
        results.push({ creatorId: creator.id, error: innerErr.message || 'Scan failed' });
      }
    }
    res.json({ results });
  } catch (err: any) {
    console.error('scan-many failed', err);
    res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
  }
});

router.get('/results', (_req, res) => {
  res.json({ results: getAllResults() });
});

router.get('/result/:creatorId', (req, res) => {
  const result = getResult(req.params.creatorId);
  if (!result) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ result });
});

export default router;
