function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function recencyScore(daysSinceLastSponsoredPost) {
  if (daysSinceLastSponsoredPost === null) return 0;
  if (daysSinceLastSponsoredPost <= 7) return 1;
  if (daysSinceLastSponsoredPost <= 30) return 0.85;
  if (daysSinceLastSponsoredPost <= 60) return 0.65;
  if (daysSinceLastSponsoredPost <= 90) return 0.45;
  if (daysSinceLastSponsoredPost <= 180) return 0.25;
  return 0.1;
}

function cadenceScore(sponsoredPostsLast90Days, averageDaysBetweenSponsoredPosts) {
  if (sponsoredPostsLast90Days === 0) return 0;
  if (averageDaysBetweenSponsoredPosts === null) {
    return Math.min(1, sponsoredPostsLast90Days / 4);
  }
  if (averageDaysBetweenSponsoredPosts <= 10) return 1;
  if (averageDaysBetweenSponsoredPosts <= 20) return 0.85;
  if (averageDaysBetweenSponsoredPosts <= 30) return 0.7;
  if (averageDaysBetweenSponsoredPosts <= 45) return 0.55;
  if (averageDaysBetweenSponsoredPosts <= 60) return 0.4;
  return 0.2;
}

function engagementRatioScore(ratio) {
  if (!isFinite(ratio)) return 0;
  if (ratio >= 1.2) return 1;
  if (ratio >= 1) return 0.85;
  if (ratio >= 0.8) return 0.65;
  if (ratio >= 0.6) return 0.45;
  if (ratio >= 0.4) return 0.3;
  return 0.15;
}

function semanticToneScore(semanticSummary) {
  if (!semanticSummary) return 0.5;
  const counts = semanticSummary.toneCounts || {};
  const total = Object.values(counts).reduce((acc, val) => acc + (val || 0), 0);
  if (!total) return 0.5;
  const positive = (counts['authentic'] || 0) + (counts['neutral'] || 0) * 0.6;
  const negative = (counts['overly commercial'] || 0) + (counts['audience resistant'] || 0) * 1.2;
  const base = (positive - negative) / Math.max(total, 1);
  return clamp(0.5 + base, 0, 1);
}

function growthMomentumScore(followerGrowthRate, engagementTrend) {
  const growth = isFinite(followerGrowthRate || 0) ? followerGrowthRate || 0 : 0;
  const engagement = isFinite(engagementTrend || 0) ? engagementTrend || 0 : 0;
  const combined = 0.6 * growth + 0.4 * engagement;
  return clamp(0.5 + combined, 0, 1);
}

export function computeCommercialMomentumScore(signals) {
  const recency = recencyScore(signals.daysSinceLastSponsoredPost);
  const cadence = cadenceScore(signals.sponsoredPostsLast90Days, signals.averageDaysBetweenSponsoredPosts);
  const engagement = engagementRatioScore(signals.engagementRatio);
  const semantic = semanticToneScore(signals.semanticSummary);
  const growth = growthMomentumScore(signals.followerGrowthRate, signals.engagementTrend);

  const score =
    recency * 30 +
    cadence * 20 +
    engagement * 20 +
    semantic * 15 +
    growth * 15;

  return clamp(Math.round(score), 0, 100);
}

export function mapRecommendation(score) {
  if (score >= 80) return 'Strong opportunity';
  if (score >= 60) return 'Viable but competitive';
  if (score >= 40) return 'Low urgency or fatigue risk';
  return 'Not recommended currently';
}

export function describeDrivers(signals) {
  const drivers = [];
  if (signals.daysSinceLastSponsoredPost !== null) {
    drivers.push(`Last sponsored ${signals.daysSinceLastSponsoredPost}d ago`);
  }
  if (signals.sponsoredPostsLast90Days > 0) {
    drivers.push(`${signals.sponsoredPostsLast90Days} sponsored posts in 90d`);
  }
  if (signals.engagementRatio) {
    drivers.push(`Engagement ratio ${signals.engagementRatio.toFixed(2)}x`);
  }
  if (signals.followerGrowthRate !== undefined && signals.followerGrowthRate !== null) {
    drivers.push(`Follower growth ${(signals.followerGrowthRate * 100).toFixed(1)}%`);
  }
  if (signals.engagementTrend !== undefined && signals.engagementTrend !== null) {
    drivers.push(`Engagement trend ${(signals.engagementTrend * 100).toFixed(1)}%`);
  }
  return drivers;
}
