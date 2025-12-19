import { fetchCreatorProfile, fetchRecentPosts } from '../api/influencersClubClient';
import {
  ApiKeys,
  CommercialMomentumResult,
  CommercialMomentumSignals,
  CommercialPost,
  Creator,
  CreatorProfileInsights
} from '../types';
import { computeCommercialMomentumScore, describeDrivers, mapRecommendation } from './commercialMomentumScoring';
import { classifyToneForSponsoredPosts, inferSponsoredWithGpt } from './gptSemanticHelpers';
import * as commercialCache from './localCache';

const DAY_MS = 24 * 60 * 60 * 1000;

function normalisePosts(posts: any[]): CommercialPost[] {
  return (posts || []).map((post, idx) => ({
    id: post.id || `post-${idx}`,
    caption: post.caption || post.title || '',
    createdAt: post.createdAt || post.timestamp || post.date,
    likes: post.likes ?? post.likeCount ?? 0,
    comments: post.comments ?? post.commentCount ?? 0,
    shares: post.shares ?? post.shareCount ?? 0,
    views: post.views ?? post.viewCount ?? 0,
    clicks: post.clicks ?? post.ctaClicks ?? 0,
    link: post.link || post.url
  }));
}

function calculateEngagement(post: CommercialPost) {
  return (
    (post.likes || 0) +
    (post.comments || 0) * 2 +
    (post.shares || 0) * 3 +
    (post.views || 0) * 0.02 +
    (post.clicks || 0)
  );
}

const HASH_TAG_PATTERNS = ['#ad', '#sponsored', '#partner', '#gifted', '#collab'];
const SPONSORED_PHRASES = [
  'sponsored by',
  'partnered with',
  'in partnership with',
  'paid partnership',
  'use my code',
  'discount code',
  'promo code',
  'pr partner'
];

function heuristicallySponsored(caption?: string): boolean | null {
  if (!caption) return null;
  const lower = caption.toLowerCase();
  if (HASH_TAG_PATTERNS.some((tag) => lower.includes(tag))) return true;
  if (SPONSORED_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  if (lower.includes('partner') && lower.includes('@')) return true;
  if (lower.includes('ad ') || lower.endsWith('ad')) return true;
  return null;
}

async function detectSponsoredPosts(posts: CommercialPost[], keys: ApiKeys) {
  for (const post of posts) {
    const heuristic = heuristicallySponsored(post.caption);
    if (heuristic !== null) {
      post.isSponsored = heuristic;
      continue;
    }
    try {
      post.isSponsored = await inferSponsoredWithGpt(post.caption || '', keys);
    } catch (err) {
      post.isSponsored = false;
    }
  }
  return posts;
}

function daysBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const diff = Math.abs(new Date(a).getTime() - new Date(b).getTime());
  return Math.round(diff / DAY_MS);
}

function calculateSignals(posts: CommercialPost[], profile: any): CommercialMomentumSignals {
  const sorted = [...posts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const sponsored = sorted.filter((p) => p.isSponsored);
  const organic = sorted.filter((p) => !p.isSponsored);

  const now = Date.now();
  const nowIso = new Date().toISOString();
  const lastSponsored = sponsored[0]?.createdAt ? new Date(sponsored[0].createdAt).getTime() : null;
  const daysSinceLastSponsoredPost = lastSponsored ? Math.round((now - lastSponsored) / DAY_MS) : null;
  const lastSponsoredPostDate = sponsored[0]?.createdAt || null;

  const sponsoredPostsLast30Days = sponsored.filter(
    (p) => daysBetween(p.createdAt, nowIso) !== null && daysBetween(p.createdAt, nowIso)! <= 30
  ).length;
  const sponsoredPostsLast60Days = sponsored.filter(
    (p) => daysBetween(p.createdAt, nowIso) !== null && daysBetween(p.createdAt, nowIso)! <= 60
  ).length;
  const sponsoredPostsLast90Days = sponsored.filter(
    (p) => daysBetween(p.createdAt, nowIso) !== null && daysBetween(p.createdAt, nowIso)! <= 90
  ).length;

  const gapDays: number[] = [];
  for (let i = 0; i < sponsored.length - 1; i++) {
    const gap = daysBetween(sponsored[i].createdAt, sponsored[i + 1].createdAt);
    if (gap !== null) gapDays.push(gap);
  }
  const averageDaysBetweenSponsoredPosts = gapDays.length
    ? gapDays.reduce((a, b) => a + b, 0) / gapDays.length
    : null;

  const sponsoredEngagement = sponsored.map(calculateEngagement);
  const organicEngagement = organic.map(calculateEngagement);
  const avgSponsoredEngagement = sponsoredEngagement.length
    ? sponsoredEngagement.reduce((a, b) => a + b, 0) / sponsoredEngagement.length
    : 0;
  const avgOrganicEngagement = organicEngagement.length
    ? organicEngagement.reduce((a, b) => a + b, 0) / organicEngagement.length
    : 0;
  const engagementRatio = avgOrganicEngagement ? avgSponsoredEngagement / avgOrganicEngagement : 0;

  let followerGrowthRate: number | null = null;
  if (profile?.followers && profile?.followersPrev30) {
    followerGrowthRate = (profile.followers - profile.followersPrev30) / profile.followersPrev30;
  } else if (typeof profile?.growthRate === 'number') {
    followerGrowthRate = profile.growthRate;
  }

  let engagementTrend: number | null = null;
  if (organic.length >= 4) {
    const midpoint = Math.floor(organic.length / 2);
    const recent = organic.slice(0, midpoint).map(calculateEngagement);
    const older = organic.slice(midpoint).map(calculateEngagement);
    const recentAvg = recent.reduce((a, b) => a + b, 0) / Math.max(recent.length, 1);
    const olderAvg = older.reduce((a, b) => a + b, 0) / Math.max(older.length, 1);
    if (olderAvg) engagementTrend = (recentAvg - olderAvg) / olderAvg;
  }

  return {
    daysSinceLastSponsoredPost,
    sponsoredPostsLast30Days,
    sponsoredPostsLast60Days,
    sponsoredPostsLast90Days,
    averageDaysBetweenSponsoredPosts,
    avgSponsoredEngagement,
    avgOrganicEngagement,
    engagementRatio,
    followerGrowthRate,
    engagementTrend,
    semanticSummary: undefined
  };
}

function selectProfileRecord(profile: any) {
  if (!profile) return {};
  if (profile.result && typeof profile.result === 'object') {
    const first = Object.values(profile.result).find(Boolean);
    if (first && typeof first === 'object') return first;
  }
  return profile || {};
}

function normaliseProfileInsights(rawProfile: any): CreatorProfileInsights {
  const record: any = selectProfileRecord(rawProfile);
  const rawEmails: string[] = [
    record.email,
    record.emailAddress,
    ...(Array.isArray(record.emails) ? record.emails : []),
    ...(Array.isArray(record.email_addresses) ? record.email_addresses : []),
    ...(Array.isArray(record.emailAddresses) ? record.emailAddresses : []),
    ...(Array.isArray(record.contactEmails) ? record.contactEmails : []),
    ...(Array.isArray(record.contacts) ? record.contacts.map((c: any) => c?.email).filter(Boolean) : []),
    ...(Array.isArray(record.social?.emails) ? record.social.emails : [])
  ]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  const emails = Array.from(new Set(rawEmails));

  const followerCount =
    record.followers ?? record.followers_count ?? record.followersCount ?? record.follower_count ?? null;
  const subscriberCount =
    record.subscriber_count ?? record.subscribers ?? record.subscriberCount ?? followerCount ?? null;
  const viewCount = record.view_count ?? record.views ?? record.viewCount ?? null;
  const videoCount =
    record.video_count ?? record.videoCount ?? record.posts_count ?? record.post_count ?? record.postCount ?? null;
  const country = record.country || record.location || record.country_code || null;
  const platformHandle = record.custom_url || record.handle || record.username || record.profile_url || null;
  const profilePicture =
    record.profile_picture_hd || record.profile_picture || record.avatar || record.image || record.profileImage || null;
  const description = record.description || record.bio || record.about || null;
  const link = record.link || record.url || record.channel_url || record.profileUrl || null;

  return {
    emails: emails.length ? emails : undefined,
    followerCount: followerCount ?? undefined,
    subscriberCount: subscriberCount ?? undefined,
    viewCount: viewCount ?? undefined,
    videoCount: videoCount ?? undefined,
    country: country ?? undefined,
    platformHandle: platformHandle ?? undefined,
    profilePicture: profilePicture ?? undefined,
    description: description ?? undefined,
    link: link ?? undefined
  };
}

export async function runCommercialMomentum(creator: Creator, keys: ApiKeys): Promise<CommercialMomentumResult> {
  const cached = commercialCache.get(creator.name);
  if (cached && commercialCache.isFresh(creator.name, 7)) {
    return { ...cached.data, creatorId: creator.id };
  }

  if (!keys.influencersClubApiKey) {
    throw new Error('Missing Influencers.club API key.');
  }

  const profile = await fetchCreatorProfile(creator.handle || creator.name, creator.platform);
  const postsRaw = await fetchRecentPosts(creator.handle || creator.name, creator.platform);
  const posts = await detectSponsoredPosts(normalisePosts(postsRaw || []), keys);

  const signals = calculateSignals(posts, profile || {});
  const semanticSummary = await classifyToneForSponsoredPosts(posts.filter((p) => p.isSponsored), keys);
  signals.semanticSummary = semanticSummary;
  const profileInsights = normaliseProfileInsights(profile);

  const score = computeCommercialMomentumScore(signals);
  const recommendation = mapRecommendation(score);
  const keyDrivers = describeDrivers(signals);

  const result: CommercialMomentumResult = {
    creatorId: creator.id,
    creatorName: creator.name,
    creatorHandle: creator.handle,
    platform: creator.platform,
    score,
    recommendation,
    signals,
    lastSponsoredPostDate: posts.filter((p) => p.isSponsored)[0]?.createdAt || null,
    lastChecked: new Date().toISOString(),
    keyDrivers,
    semanticSummary,
    summary: `${recommendation}. ${keyDrivers.slice(0, 2).join('; ')}`,
    status: 'ok',
    primaryEmail: profileInsights.emails?.[0],
    profileInsights
  };

  commercialCache.set(creator.name, result);
  return result;
}

export function loadCachedCommercialResults() {
  return commercialCache.loadAll();
}
