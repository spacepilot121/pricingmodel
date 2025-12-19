import axios from 'axios';
import express from 'express';

const router = express.Router();

const BASE_URL = process.env.INFLUENCERS_CLUB_BASE_URL || 'https://api-dashboard.influencers.club';
const API_PREFIX = process.env.INFLUENCERS_CLUB_API_PREFIX || '/public/v1';
const DISCOVERY_PATH = '/discovery/';
const CONTENT_DETAILS_PATH = '/creators/content/details/';

type ProxyPayload = Record<string, any> & { apiKey?: string };

function extractBearerToken(authHeader?: string | null) {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)/i);
  return match?.[1]?.trim() || null;
}

async function forwardRequest(path: string, payload: ProxyPayload, authHeader?: string | null) {
  const apiKey = payload.apiKey || extractBearerToken(authHeader) || process.env.INFLUENCERS_CLUB_API_KEY;
  if (!apiKey) {
    const error = new Error('Influencers.club API key is required.');
    (error as any).status = 400;
    throw error;
  }

  try {
    const base = BASE_URL.replace(/\/+$/, '');
    const prefix = API_PREFIX.replace(/\/+$/, '');
    const { apiKey: _omitApiKey, ...forwardPayload } = payload;
    const response = await axios.post(
      `${base}${prefix}${path}`,
      forwardPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
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

function registerRoute(localPath: string, targetPath: string, logLabel: string) {
  router.post(localPath, async (req, res) => {
    try {
      const payload: ProxyPayload = req.body || {};
      const data = await forwardRequest(targetPath, payload, req.get('Authorization'));
      res.json(data);
    } catch (err: any) {
      console.error(`Influencers.club ${logLabel} fetch failed`, err);
      res.status(err?.status || 500).json({ error: err?.message || 'Influencers.club request failed' });
    }
  });
}

registerRoute('/discovery', DISCOVERY_PATH, 'discovery');
registerRoute('/content', CONTENT_DETAILS_PATH, 'content details');

// Backwards compatibility with older client paths
registerRoute('/profile', DISCOVERY_PATH, 'profile');
registerRoute('/posts', CONTENT_DETAILS_PATH, 'posts');

export default router;
