// services/tierTables.js
// Converts raw X engagement (likes/replies/retweets) into a tier bonus for
// the original poster vs. someone who quote-shared the post.
const BASE_WEIGHTS = { like: 1, reply: 2, retweet: 3 };

const TIERS = [
  { min: 0, max: 29, self: 0, shared: 0 },
  { min: 30, max: 59, self: 2, shared: 3 },
  { min: 60, max: 99, self: 5, shared: 8 },
  { min: 100, max: 199, self: 8, shared: 14 },
  { min: 200, max: 349, self: 12, shared: 21 },
  { min: 350, max: 499, self: 16, shared: 28 },
  { min: 500, max: 749, self: 24, shared: 40 },
  { min: 750, max: Infinity, self: 40, shared: 60 },
];

function interactionPointsFromPublicMetrics(m) {
  if (!m) return 0;
  const likePts = Number(m.like_count || 0) * BASE_WEIGHTS.like;
  const replyPts = Number(m.reply_count || 0) * BASE_WEIGHTS.reply;
  const retweetPts = Number(m.retweet_count || 0) * BASE_WEIGHTS.retweet;
  return likePts + replyPts + retweetPts;
}

function tierFor(points) {
  return TIERS.find((t) => points >= t.min && points <= t.max);
}

// Interaction points decay the longer someone waits to engage after the
// original post, so day-1 engagement counts more than a stale reply.
function timeDecayMultiplier(postCreatedAt, interactionCreatedAt) {
  const postTs = new Date(postCreatedAt).getTime();
  const actionTs = new Date(interactionCreatedAt).getTime();
  if (!isFinite(postTs) || !isFinite(actionTs)) return 0;

  const hours = Math.max(0, (actionTs - postTs) / (1000 * 60 * 60));
  if (hours < 24) return 1.0;
  if (hours < 48) return 0.6;
  if (hours < 72) return 0.3;
  return 0.0;
}

module.exports = { BASE_WEIGHTS, TIERS, interactionPointsFromPublicMetrics, tierFor, timeDecayMultiplier };
