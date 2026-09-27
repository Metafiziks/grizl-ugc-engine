// services/trustScore.service.js
// Anti-farming heuristics: catches batches of accounts created together,
// reused bios/avatars, and bot-shaped usernames, and turns that into a
// penalty applied on top of the base PTS score from pts.service.js.
const { getPTSMultipliers: baseGetPTSMultipliers } = require('./pts.service');

function getPTSMultipliers(pts) {
  const m = baseGetPTSMultipliers(pts);
  return { self: m.self, sharer: m.share, interaction: m.interaction };
}

/** Basic legitimacy score from account metadata (age, activity, verification). */
function computePLegit(profile) {
  let score = 0;

  const ageDays = profile?.accountAgeDays || 0;
  if (ageDays >= 90) score += 0.25;
  else if (ageDays >= 30) score += 0.15;

  const tweets = profile?.tweetCount || 0;
  if (tweets >= 100) score += 0.2;
  else if (tweets >= 10) score += 0.1;

  if (profile?.profile_image_url && !profile.profile_image_url.includes('/default_profile_images/')) {
    score += 0.2;
  }

  if (profile?.verified) score += 0.2;

  const followers = profile?.followers_count || 0;
  const following = profile?.following_count || 1;
  if (followers / following > 2 && followers > 100) score += 0.15;

  return Math.min(1, score);
}

/** Lightweight "farm" score: bio/username/avatar reuse, creation bursts. */
function computeFarmScoreLite(user, allUsers) {
  let penalties = 0;

  const bio = (user.bio || '').toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const bioDupes = allUsers.filter(
    (u) => u._id.toString() !== user._id.toString() && bio.length > 10 && (u.bio || '').toLowerCase().includes(bio)
  );
  if (bioDupes.length > 2) penalties += 0.25;

  if (/\d{3,}$/.test(user.username)) penalties += 0.25;

  if (user.avatarHash) {
    const dupes = allUsers.filter((u) => u._id.toString() !== user._id.toString() && u.avatarHash === user.avatarHash);
    if (dupes.length > 0) penalties += 0.25;
  }

  const createdAt = user.twitterProfileData?.twitterAccountCreatedAt;
  if (createdAt) {
    const sameDay = allUsers.filter((u) => {
      const c = u.twitterProfileData?.twitterAccountCreatedAt;
      return c && Math.abs(new Date(c) - new Date(createdAt)) < 48 * 3600 * 1000;
    });
    if (sameDay.length > 5) penalties += 0.25;
  }

  return Math.min(1, penalties);
}

function computePTS(user, allUsers = []) {
  const p_legit = computePLegit(user.twitterProfileData || {});
  const farm_score = computeFarmScoreLite(user, allUsers);
  const pts_raw = 0.6 * p_legit + 0.25 * (1 - farm_score);
  return { pts: Math.round(100 * pts_raw), p_legit, farm_score };
}

module.exports = { computePTS, computePLegit, computeFarmScoreLite, getPTSMultipliers };
