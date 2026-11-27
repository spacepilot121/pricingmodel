import { fetchCreatorProfile, fetchRecentPosts, postDate } from '../api/influencersClubClient';
import {
  ApiKeys,
  CommercialMomentumResult,
  CommercialMomentumSignals,
  CommercialPost,
  Creator,
  CreatorProfileInsights
} from '../types';
import { computeCommercialMomentumScore, describeDrivers, mapRecommendation } from './commercialMomentumScoring';
import { classifyToneForSponsoredPosts, inferSponsoredBatch } from './gptSemanticHelpers';
import * as commercialCache from './localCache';

const DAY_MS = 24 * 60 * 60 * 1000;

function numeric(value:any):number|undefined {const n=Number(value);return value != null && value !== '' && Number.isFinite(n) && n >= 0 ? n : undefined;}
export function normalisePosts(posts: any[]): CommercialPost[] {
  return (posts || []).map((post, idx) => ({
    id: String(post.id || post.pk || post.url || `post-${idx}`),
    caption: String(post.caption || post.title || post.description || ''),
    metricsAvailable: [post.likes,post.likeCount,post.like_count,post.views,post.viewCount,post.view_count,post.play_count,post.statistics?.viewCount].some(value=>numeric(value)!==undefined),
    createdAt: Number.isFinite(postDate(post)) ? new Date(postDate(post)).toISOString() : undefined,
    likes: numeric(post.likes ?? post.likeCount ?? post.like_count ?? post.statistics?.likeCount) ?? 0,
    comments: numeric(post.comments ?? post.commentCount ?? post.comment_count ?? post.statistics?.commentCount) ?? 0,
    shares: numeric(post.shares ?? post.shareCount ?? post.share_count) ?? 0,
    views: numeric(post.views ?? post.viewCount ?? post.view_count ?? post.play_count ?? post.statistics?.viewCount) ?? 0,
    clicks: numeric(post.clicks ?? post.ctaClicks) ?? 0,
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
  if (/(?:^|\s)#(?:ad|sponsored|partner|gifted|collab)(?=$|[^a-z0-9_])/i.test(lower)) return true;
  if (SPONSORED_PHRASES.some((phrase) => lower.includes(phrase))) return true;
  if (lower.includes('partner') && lower.includes('@')) return true;
  if (/^ad(?:$|[\s:.,!])/i.test(lower)) return true;
  return null;
}

async function detectSponsoredPosts(posts: CommercialPost[], keys: ApiKeys) {
  const uncertain: CommercialPost[] = [];
  for (const post of posts) {
    const heuristic = heuristicallySponsored(post.caption);
    if (heuristic === true) post.isSponsored = true;
    else if (!post.caption?.trim()) post.sponsorshipUnknown = true;
    else uncertain.push(post);
  }
  if (uncertain.length) {
    try {
      const classifications = await inferSponsoredBatch(uncertain, keys);
      for (const post of uncertain) post.isSponsored = classifications.get(post.id);
    } catch {
      for (const post of uncertain) post.sponsorshipUnknown = true;
    }
  }
  return posts;
}

function daysBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const diff = new Date(b).getTime() - new Date(a).getTime();
  return Math.round(diff / DAY_MS);
}

function calculateSignals(posts: CommercialPost[], profile: any): CommercialMomentumSignals {
  const sorted = [...posts].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  const sponsored = sorted.filter((p) => p.isSponsored);
  const organic = sorted.filter((p) => p.isSponsored === false && !p.sponsorshipUnknown);

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
    const gap = daysBetween(sponsored[i + 1].createdAt, sponsored[i].createdAt);
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

export function selectProfileRecord(profile: any, platform?: string) {
  const record = profile?.result || profile?.accounts?.[0] || profile || {};
  const platformData = platform ? record[platform.toLowerCase()] : undefined;
  return platformData && typeof platformData === 'object' ? {...record,...platformData} : record;
}

export function normaliseProfileInsights(rawProfile: any, platform?: string): CreatorProfileInsights {
  const record: any = selectProfileRecord(rawProfile, platform);
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
  const location=record.country || record.location || record.country_code;
  const country=typeof location === 'string' ? location : location?.country || location?.name || null;
  const platformHandle = record.custom_url || record.handle || record.username || record.profile_url || null;
  const profilePicture =
    record.profile_picture_hd || record.profile_picture || record.avatar || record.image || record.profileImage || null;
  const description = record.description || record.bio || record.about || null;
  const link = record.link || record.url || record.channel_url || record.profileUrl || record[(platform || '').toLowerCase() + '_link'] || null;

  return {
    emails: emails.length ? emails : undefined,
    followerCount: numeric(followerCount),
    subscriberCount: numeric(subscriberCount),
    viewCount: numeric(viewCount),
    videoCount: numeric(videoCount),
    country: country ?? undefined,
    platformHandle: platformHandle ?? undefined,
    profilePicture: profilePicture ?? undefined,
    description: description ?? undefined,
    link: link ?? undefined
  };
}

export function creatorCacheKey(creator: Creator) {
  return [creator.platform, creator.channelId || creator.handle || creator.channelUrl || creator.name].join(':').toLowerCase();
}
export async function resolveClubIdentity(creator: Creator, keys: ApiKeys, force = false) {
  const handle = creator.channelId || creator.handle || creator.channelUrl;
  if (!handle || !['YouTube','Instagram','TikTok'].includes(creator.platform)) throw new Error('Add a creator profile URL to identify their platform and exact account.');
  const profile = await fetchCreatorProfile(handle, creator.platform, keys.influencersClubApiKey, {force});
  const record = selectProfileRecord(profile,creator.platform);
  const insights = normaliseProfileInsights(profile,creator.platform);
  const returnedHandle = record.username || record.handle || record.custom_url;
  if (creator.handle && returnedHandle && String(returnedHandle).replace(/^@/,'').toLowerCase() !== creator.handle.replace(/^@/,'').toLowerCase()) throw new Error('Influencers Club returned a different creator handle. Check the profile URL.');
  const name = record.full_name || record.name || record.title || [record.first_name,record.last_name].filter(Boolean).join(' ') || creator.name;
  return {profile, creator:{...creator, name, entityData:{primaryName:name,identifiers:[name,creator.name,creator.handle,creator.channelId].filter(Boolean) as string[]}}, insights};
}
export async function runCommercialMomentum(creator: Creator, keys: ApiKeys, options: {force?: boolean; profile?: any} = {}): Promise<CommercialMomentumResult> {
  const cacheKey = creatorCacheKey(creator);
  const cached = commercialCache.get(cacheKey);
  if (!options.force && cached?.data.analysisVersion === 2 && commercialCache.isFresh(cacheKey, 1)) return {...cached.data,creatorId:creator.id};
  if (!keys.influencersClubApiKey) throw new Error('Missing Influencers Club API key.');
  const handle = creator.channelId || creator.handle || creator.channelUrl;
  if (!handle || !['YouTube','Instagram','TikTok'].includes(creator.platform)) throw new Error('Add a creator profile URL to run Commercial Momentum.');
  const profile = options.profile || (await resolveClubIdentity(creator,keys,options.force)).profile;
  const page = await fetchRecentPosts(handle,creator.platform,keys.influencersClubApiKey,{force:options.force});
  const now=Date.now();
  const allPosts=normalisePosts(page.posts);
  const inWindow=allPosts.filter(p=>p.createdAt && new Date(p.createdAt).getTime() <= now && now-new Date(p.createdAt).getTime() <= 90*DAY_MS);
  const posts=await detectSponsoredPosts(inWindow,keys);
  const unknownDates=allPosts.some(p=>!p.createdAt);
  const unknownMetrics=posts.some(p=>!p.metricsAvailable);
  const unknownSponsorship=posts.some(p=>p.sponsorshipUnknown);
  const signals=calculateSignals(posts,selectProfileRecord(profile,creator.platform));
  let semanticSummary: CommercialMomentumResult['semanticSummary'];
  let toneFailed=false;
  try { semanticSummary=await classifyToneForSponsoredPosts(posts.filter(p=>p.isSponsored),keys); }
  catch { toneFailed=true; }
  signals.semanticSummary=semanticSummary;
  const coverage={...page.coverage,complete:page.coverage.complete && !unknownDates};
  const enoughData=coverage.complete && !unknownMetrics && !unknownSponsorship && !toneFailed && posts.filter(p=>p.isSponsored).length >= 2 && posts.filter(p=>p.isSponsored === false).length >= 2;
  const score=enoughData ? computeCommercialMomentumScore(signals) : null;
  const recommendation=score === null ? 'Insufficient data for a recommendation' : mapRecommendation(score);
  const warnings=[coverage.warning,unknownMetrics ? 'Some engagement metrics are unavailable.' : '',unknownDates ? 'Some posts have no usable date.' : '',unknownSponsorship ? 'Some sponsorship classifications are unavailable.' : '',toneFailed ? 'Caption tone assessment was unavailable.' : ''].filter(Boolean);
  const profileInsights=normaliseProfileInsights(profile,creator.platform);
  const keyDrivers=describeDrivers(signals);
  const lastSponsoredPostDate=posts.filter(p=>p.isSponsored).map(p=>p.createdAt).filter(Boolean).sort().reverse()[0] || null;
  const result: CommercialMomentumResult={creatorId:creator.id,creatorName:creator.name,creatorHandle:creator.handle,platform:creator.platform,score,recommendation,signals,lastSponsoredPostDate,lastChecked:new Date().toISOString(),keyDrivers,semanticSummary,summary:[recommendation,...warnings].join(' '),status:enoughData ? 'ok' : posts.length ? 'partial' : 'insufficient',analysisVersion:2,coverage,primaryEmail:profileInsights.emails?.[0],profileInsights};
  commercialCache.set(cacheKey,result);
  return result;
}
export function loadCachedCommercialResults() { return commercialCache.loadAll(); }
