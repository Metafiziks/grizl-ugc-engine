// scripts/runTrustRecalc.js
// Recomputes the rolling trust/anti-farming score for every user. Run this
// before the discovery/reply sweeps so multipliers reflect the latest signal.
require('dotenv').config();
const { connect, disconnect } = require('../db');
const User = require('../models/User');
const { computePTSAndEligibility } = require('../services/pts.service');
const { computePLegit, computeFarmScoreLite } = require('../services/trustScore.service');

(async () => {
  try {
    await connect();
    const users = await User.find({}).lean();

    for (const u of users) {
      const profile = u.twitterProfileData || {};
      const { pts: basePts } = await computePTSAndEligibility(profile);

      const p_legit = computePLegit({
        ...profile,
        accountAgeDays: profile.created_at ? Math.floor((Date.now() - new Date(profile.created_at)) / 86400000) : 0,
        tweetCount: profile.tweet_count || profile.tweetCount || 0,
      });

      const farm_score = computeFarmScoreLite(u, users);
      // Farming signals discount up to 20% off the base PTS score.
      const finalPts = Math.max(0, Math.min(100, Math.round(basePts * (1 - 0.2 * farm_score))));

      await User.updateOne(
        { _id: u._id },
        { $set: { 'trust.pts': finalPts, 'trust.pLegit': p_legit, 'trust.farmScore': farm_score, 'trust.updatedAt': new Date() } }
      );
    }

    console.log(`[TrustRecalc] updated ${users.length} users`);
    await disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[TrustRecalc] error:', e?.message || e);
    try { await disconnect(); } catch {}
    process.exit(1);
  }
})();
