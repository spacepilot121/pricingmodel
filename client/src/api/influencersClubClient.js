import { getApiBase } from './backendConfig';
import { requestJson } from './requestJson';

const BASE = 'https://api-dashboard.influencers.club/public/v1';
const CACHE_KEY = 'influencersClub_cache_v2';
const TTL = 24 * 60 * 60 * 1000;
const pending = new Map();
const PATHS = {
  credits: '/accounts/credits/',
  profile: '/creators/enrich/handle/profile/',
  discovery: '/discovery/',
  posts: '/creators/content/posts/',
  content: '/creators/content/details/'
};
function cacheRead(key) {
  try {
    const entry = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[key];
    return entry && Date.now() - entry.timestamp < TTL ? entry.data : null;
  } catch { return null; }
}
function cacheWrite(key, data) {
  try {
    const entries = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    const fresh = Object.fromEntries(Object.entries(entries).filter(([, e]) => Date.now() - e.timestamp < TTL));
    fresh[key] = { timestamp: Date.now(), data };
    localStorage.setItem(CACHE_KEY, JSON.stringify(fresh));
  } catch { /* Cache failure must not lose an assessment. */ }
}
export async function influencersRequest(endpoint, payload, providedKey, options = {}) {
  if (!PATHS[endpoint]) throw new Error('Unsupported Influencers Club endpoint.');
  const apiKey = (providedKey || localStorage.getItem('influencersClub_apiKey') || '').trim();
  if (!apiKey) throw new Error('Influencers Club API key is missing.');
  const relay = getApiBase();
  const url = relay ? `${relay}/api/influencers-club/${endpoint}` : `${BASE}${PATHS[endpoint]}`;
  const key = JSON.stringify([url, payload]);
  const cached = endpoint !== 'credits' && !options.force && cacheRead(key);
  if (cached) return cached;
  const pendingKey = `${apiKey}:${key}`;
  if (pending.has(pendingKey)) return pending.get(pendingKey);
  const task = (async () => {
    try {
      const data = await requestJson(url, {
        method: !relay && endpoint === 'credits' ? 'GET' : 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        ...(!relay && endpoint === 'credits' ? {} : {body: JSON.stringify(payload)})
      });
      if (!data || typeof data !== 'object') throw new Error('Influencers Club returned an invalid response.');
      if (data.result?.status && data.result.status !== 'ok') throw new Error(`Influencers Club data is not ready (${data.result.status}). Please retry later.`);
      if (endpoint !== 'credits') cacheWrite(key, data);
      return data;
    } catch (error) {
      if (!error.status && (error instanceof TypeError || error.name === 'AbortError')) {
        throw new Error(relay
          ? 'Cannot reach your Influencers Club relay. Check its URL and allowed origin in Settings.'
          : 'The browser could not reach Influencers Club. If its API blocks browser access, add your own hosted relay URL in Settings. GitHub Pages cannot run the relay.');
      }
      throw error;
    } finally { pending.delete(pendingKey); }
  })();
  pending.set(pendingKey, task);
  return task;
}
export async function fetchCreatorProfile(handle, platform, apiKey, options = {}) {
  const data = await influencersRequest('profile', {
    handle: String(handle).trim(), platform: String(platform).toLowerCase(), email_required: 'preferred'
  }, apiKey, options);
  if (!data.result || Array.isArray(data.result)) throw new Error('Influencers Club returned no matching profile.');
  return data;
}
export async function fetchRecentPosts(handle, platform, apiKey, options = {}) {
  const cutoff = Date.now() - 90 * 86400000;
  const posts = [];
  const seen = new Set();
  const cursors = new Set();
  let token = '';
  let complete = false;
  let pages = 0;
  let warning = '';
  for (; pages < 5;) {
    let data;
    try {
      data = await influencersRequest('posts', {
        platform: String(platform).toLowerCase(), handle: String(handle).trim(),
        count: platform.toLowerCase() === 'youtube' ? 50 : platform.toLowerCase() === 'tiktok' ? 35 : 12,
        ...(token ? { pagination_token: token } : {})
      }, apiKey, options);
    } catch (error) {
      if (!posts.length) throw error;
      warning = `Post collection stopped: ${error.message}`;
      break;
    }
    pages++;
    const result = data.result;
    if (!result || !Array.isArray(result.items)) throw new Error('Unexpected Influencers Club posts format. No score was calculated.');
    for (const post of result.items) {
      const id = post.id || post.pk || post.url || post.link;
      if (!id || !seen.has(String(id))) { posts.push(post); if (id) seen.add(String(id)); }
    }
    if (result.more_available === false) { complete = true; break; }
    const dates = result.items.map(postDate).filter(Number.isFinite);
    if (dates.length === result.items.length && dates.length && Math.max(...dates) < cutoff) { complete = true; break; }
    if (!result.next_token || cursors.has(result.next_token)) break;
    cursors.add(result.next_token);
    token = result.next_token;
  }
  return { posts, coverage: { complete, pages, postCount: posts.length, warning: warning || (!complete ? 'The 90 day period is not fully covered. The scan stopped at the page limit or an unavailable cursor.' : '') } };
}
export function postDate(post) {
  const raw = post.createdAt ?? post.timestamp ?? post.date ?? post.taken_at ?? post.published_at ?? post.publishedAt;
  if (raw === undefined || raw === null || raw === '') return NaN;
  if (typeof raw === 'number' || /^\d+$/.test(String(raw))) {
    const n = Number(raw); return n < 1e12 ? n * 1000 : n;
  }
  return new Date(raw).getTime();
}
export function clearInfluencersClubCache() { localStorage.removeItem(CACHE_KEY); }

