import axios from 'axios';
import express from 'express';
const router = express.Router();
const BASE_URL = process.env.INFLUENCERS_CLUB_BASE_URL || 'https://api-dashboard.influencers.club';
const API_PREFIX = process.env.INFLUENCERS_CLUB_API_PREFIX || '/public/v1';
function requireHandle(payload) {
    if (!payload.handle) {
        const error = new Error('handle is required');
        error.status = 400;
        throw error;
    }
}
async function forwardRequest(path, payload) {
    requireHandle(payload);
    const apiKey = payload.apiKey || process.env.INFLUENCERS_CLUB_API_KEY;
    if (!apiKey) {
        const error = new Error('Influencers.club API key is required.');
        error.status = 400;
        throw error;
    }
    try {
        const base = BASE_URL.replace(/\/+$/, '');
        const prefix = API_PREFIX.replace(/\/+$/, '');
        const response = await axios.post(`${base}${prefix}${path}`, {
            handle: payload.handle,
            platform: payload.platform,
            limit: payload.limit || 50
        }, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            }
        });
        return response.data;
    }
    catch (err) {
        const status = err?.response?.status;
        const message = err?.response?.data?.error?.message || err?.message || 'Influencers.club request failed';
        const error = new Error(message);
        error.status = status || 502;
        throw error;
    }
}
router.post('/profile', async (req, res) => {
    try {
        const payload = req.body || {};
        const data = await forwardRequest('/creators/profile', payload);
        res.json(data);
    }
    catch (err) {
        console.error('Influencers.club profile lookup failed', err);
        res.status(err?.status || 500).json({ error: err?.message || 'Influencers.club request failed' });
    }
});
router.post('/posts', async (req, res) => {
    try {
        const payload = req.body || {};
        const data = await forwardRequest('/creators/posts', payload);
        res.json(data);
    }
    catch (err) {
        console.error('Influencers.club posts fetch failed', err);
        res.status(err?.status || 500).json({ error: err?.message || 'Influencers.club request failed' });
    }
});
export default router;
