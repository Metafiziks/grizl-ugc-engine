// services/pts.service.js
// Single source of truth for account eligibility and the 0-100 "PTS" trust
// score that scales how many points every action is worth.
function normalizeProfile(p) {
  if (!p) return null;
  return {
    tweet_count: Number(p.tweet_count ?? p.tweetCount ?? p.public_metrics?.tweet_count ?? 0) || 0,
    created_at: p.created_at ?? p.twitterAccountCreatedAt ?? null,
    profile_image_url: String(p.profile_image_url ?? p.profileImageUrl ?? ''),
    verified: !!(p.verified ?? p.verified_type === 'blue'),
    followers_count: Number(p.followers_count ?? p.public_metrics?.followers_count ?? 0) || 0,
    following_count: Number(p.following_count ?? p.public_metrics?.following_count ?? 0) || 0,
  };
}

// ---------- Eligibility gate ----------
const MIN_TWEET_COUNT = 10; // >= 10 tweets
const MIN_ACCOUNT_AGE = 90; // >= 90 days old

function daysBetween(isoDate) {
  if (!isoDate) return 0;
  const t = new Date(isoDate).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86400000) : 0;
}

function hasRealProfileImage(url) {
  return !!url && !url.includes('/default_profile_images/');
}

/** Boolean eligibility gate used by both auth and scoring. */
function twitterAccountFilters(twitterProfileData) {
  if (!twitterProfileData) return false;
  const p = normalizeProfile(twitterProfileData);
  if (p.tweet_count < MIN_TWEET_COUNT) return false;
  if (daysBetween(p.created_at) < MIN_ACCOUNT_AGE) return false;
  if (!hasRealProfileImage(p.profile_image_url)) return false;
  return true;
}

/** Numeric PTS (0-100) + eligibility flag, used for scoring multipliers. */
async function computePTSAndEligibility(profileInput) {
  const p = normalizeProfile(profileInput);
  if (!p) return { pts: 0, eligible: false };

  const eligible =
    p.tweet_count >= MIN_TWEET_COUNT &&
    hasRealProfileImage(p.profile_image_url) &&
    daysBetween(p.created_at) >= MIN_ACCOUNT_AGE;

  if (!eligible) return { pts: 0, eligible: false };

  const tweetScore = Math.min(50, Math.floor(p.tweet_count / 15));
  const ageScore = Math.min(15, Math.floor(daysBetween(p.created_at) / 60));
  const imageScore = hasRealProfileImage(p.profile_image_url) ? 10 : 0;
  const verifiedBonus = p.verified ? 25 : 0;
  const ratio = p.followers_count / Math.max(1, p.following_count);
  const ratioBonus = ratio > 2 && p.followers_count > 100 ? 5 : 0;

  const pts = Math.min(100, tweetScore + ageScore + imageScore + verifiedBonus + ratioBonus);
  return { pts, eligible: true };
}

// Multipliers used by every scoring job — 0 pts = no points, 100 pts = full points.
function getPTSMultipliers(pts = 0) {
  const mult = Math.max(0, Math.min(pts, 100)) / 100;
  return { self: mult, share: mult, interaction: mult };
}

module.exports = { twitterAccountFilters, computePTSAndEligibility, getPTSMultipliers };
