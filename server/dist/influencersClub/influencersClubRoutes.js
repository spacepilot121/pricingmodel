import axios from 'axios';
import express from 'express';
const router = express.Router();
const BASE_URL = process.env.INFLUENCERS_CLUB_BASE_URL || 'https://api-dashboard.influencers.club';
const API_PREFIX = process.env.INFLUENCERS_CLUB_API_PREFIX || '/public/v1';
const DISCOVERY_PATH = '/discovery/';
const CONTENT_DETAILS_PATH = '/creators/content/details/';
function normalizeEmails(values) {
    const emails = new Set();
    function visit(value) {
        if (!value)
            return;
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value === 'string') {
            const trimmed = value.trim();
            if (trimmed)
                emails.add(trimmed);
            return;
        }
        if (typeof value === 'object') {
            const record = value;
            visit(record.email);
        }
    }
    const applyKeys = (obj, keys) => {
        if (!obj)
            return;
        keys.forEach((key) => visit(obj[key]));
    };
    const rows = Array.isArray(values)
        ? values
        : values && typeof values === 'object'
            ? Object.values(values)
            : [];
    rows.forEach((row) => {
        if (!row || typeof row !== 'object')
            return;
        const item = row;
        applyKeys(item, ['email', 'emailAddress', 'email_address']);
        visit(item.emails);
        visit(item.email_addresses);
        visit(item.emailAddresses);
        visit(item.contactEmails);
        if (Array.isArray(item.contacts)) {
            item.contacts.forEach((contact) => visit(contact.email));
        }
        if (item.social && typeof item.social === 'object') {
            visit(item.social.emails);
        }
    });
    return Array.from(emails);
}
function extractBearerToken(authHeader) {
    if (!authHeader)
        return null;
    const match = authHeader.match(/^Bearer\s+(.+)/i);
    return match?.[1]?.trim() || null;
}
async function forwardRequest(path, payload, authHeader) {
    const apiKey = payload.apiKey || extractBearerToken(authHeader) || process.env.INFLUENCERS_CLUB_API_KEY;
    if (!apiKey) {
        const error = new Error('Influencers.club API key is required.');
        error.status = 400;
        throw error;
    }
    try {
        const base = BASE_URL.replace(/\/+$/, '');
        const prefix = API_PREFIX.replace(/\/+$/, '');
        const { apiKey: _omitApiKey, ...forwardPayload } = payload;
        const response = await axios.post(`${base}${prefix}${path}`, forwardPayload, {
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
function registerRoute(localPath, targetPath, logLabel) {
    router.post(localPath, async (req, res) => {
        try {
            const payload = req.body || {};
            const data = await forwardRequest(targetPath, payload, req.get('Authorization'));
            res.json(data);
        }
        catch (err) {
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
router.post('/email', async (req, res) => {
    const { channelUrl, platform = 'youtube', apiKey: apiKeyFromBody } = req.body || {};
    if (!channelUrl || typeof channelUrl !== 'string') {
        res.status(400).json({ error: 'channelUrl is required' });
        return;
    }
    const apiKey = apiKeyFromBody || extractBearerToken(req.get('Authorization')) || process.env.INFLUENCERS_CLUB_API_KEY;
    if (!apiKey) {
        res.status(400).json({ error: 'Influencers.club API key is required.' });
        return;
    }
    const payload = {
        platform,
        paging: { limit: 1, page: 1 },
        sort: { sort_by: 'relevancy', sort_order: 'desc' },
        filters: {
            channel_url: [channelUrl],
            exclude_role_based_emails: true,
            exclude_previous: false
        }
    };
    try {
        const base = BASE_URL.replace(/\/+$/, '');
        const prefix = API_PREFIX.replace(/\/+$/, '');
        const response = await axios.post(`${base}${prefix}${DISCOVERY_PATH}`, payload, {
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`
            }
        });
        const emails = normalizeEmails(response.data?.result ?? response.data);
        res.json({ email: emails[0] || null, emails });
    }
    catch (err) {
        const status = err?.response?.status || 502;
        const message = err?.response?.data?.error?.message || err?.message || 'Influencers.club request failed';
        console.error('Influencers.club email lookup failed', err);
        res.status(status).json({ error: message });
    }
});
export default router;
