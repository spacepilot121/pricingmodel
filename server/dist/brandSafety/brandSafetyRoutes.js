import express from 'express';
import { evaluateCreatorRisk, testApiKey } from './brandSafetyService.js';
import { getAllResults, getResult, setResult } from './brandSafetyCache.js';
const router = express.Router();
router.post('/scan-one', async (req, res) => {
    try {
        const creator = req.body.creator;
        const apiKeys = req.body.apiKeys;
        if (!creator || !creator.id) {
            return res.status(400).json({ error: 'creator is required' });
        }
        const result = await evaluateCreatorRisk(creator, apiKeys);
        setResult(result);
        res.json({ result });
    }
    catch (err) {
        console.error('scan-one failed', err);
        res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
    }
});
router.post('/scan-many', async (req, res) => {
    try {
        const creators = req.body.creators || [];
        const apiKeys = req.body.apiKeys;
        if (!Array.isArray(creators) || !creators.length) {
            return res.status(400).json({ error: 'creators array is required' });
        }
        const results = [];
        for (const creator of creators) {
            try {
                const result = await evaluateCreatorRisk(creator, apiKeys);
                setResult(result);
                results.push(result);
            }
            catch (innerErr) {
                console.error(`scan-many failed for ${creator.id}`, innerErr);
                results.push({ creatorId: creator.id, error: innerErr.message || 'Scan failed' });
            }
        }
        res.json({ results });
    }
    catch (err) {
        console.error('scan-many failed', err);
        res.status(err.status || 500).json({ error: err.message || 'Unexpected error' });
    }
});
router.post('/test-key', async (req, res) => {
    try {
        const service = req.body.service;
        const apiKeys = req.body.apiKeys;
        if (!service) {
            return res.status(400).json({ error: 'service is required' });
        }
        const result = await testApiKey(service, apiKeys);
        res.json(result);
    }
    catch (err) {
        console.error('test-key failed', err);
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
