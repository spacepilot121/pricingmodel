import axios from 'axios';
import express from 'express';

const router = express.Router();

const BASE_URL = 'https://api.influencers.club/v1';

type ProxyPayload = {
  handle?: string;
  platform?: string;
  limit?: number;
  apiKey?: string;
};

function requireHandle(payload: ProxyPayload) {
  if (!payload.handle) {
    const error = new Error('handle is required');
    (error as any).status = 400;
    throw error;
  }
}

async function forwardRequest(path: string, payload: ProxyPayload) {
  requireHandle(payload);

  const apiKey = payload.apiKey || process.env.INFLUENCERS_CLUB_API_KEY;
  if (!apiKey) {
    const error = new Error('Influencers.club API key is required.');
    (error as any).status = 400;
    throw error;
  }

  try {
    const response = await axios.post(
      `${BASE_URL}${path}`,
      {
        handle: payload.handle,
        platform: payload.platform,
        limit: payload.limit || 50
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey
        }
      }
    );
    return response.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const message = err?.response?.data?.error?.message || err?.message || 'Influencers.club request failed';
    const error = new Error(message);
    (error as any).status = status || 502;
    throw error;
  }
}

router.post('/profile', async (req, res) => {
  try {
    const payload: ProxyPayload = req.body || {};
    const data = await forwardRequest('/creators/profile', payload);
    res.json(data);
  } catch (err: any) {
    console.error('Influencers.club profile lookup failed', err);
    res.status(err?.status || 500).json({ error: err?.message || 'Influencers.club request failed' });
  }
});

router.post('/posts', async (req, res) => {
  try {
    const payload: ProxyPayload = req.body || {};
    const data = await forwardRequest('/creators/posts', payload);
    res.json(data);
  } catch (err: any) {
    console.error('Influencers.club posts fetch failed', err);
    res.status(err?.status || 500).json({ error: err?.message || 'Influencers.club request failed' });
  }
});

export default router;
