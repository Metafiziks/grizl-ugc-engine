/* eslint-disable no-console */
// services/referralService.js
const User = require('../models/User');
const Meme = require('../models/Meme');
const UserAction = require('../models/UserAction');
const { computePTSAndEligibility, getPTSMultipliers } = require('./pts.service');

async function isEligibleTwitterProfile(tpd = {}) {
  const { eligible } = await computePTSAndEligibility(tpd);
  return eligible;
}

// Milestones & base awards
const FIRST_MEME_BASE = 5; // after B posts their 1st meme
const THIRD_MEME_BASE = 10; // after B posts their 3rd meme
const REFERRAL_CAP = 100; // max referred users counted per referrer

/**
 * Called after a user uploads a meme. If they were referred, checks whether
 * this upload crosses a milestone (1st or 3rd meme) and, if so, awards their
 * referrer — gated by the referred user's own eligibility and a per-referrer cap.
 */
async function maybeAwardOnUpload(uploaderId) {
  const B = await User.findById(uploaderId).lean(); // B = referred user
  if (!B || !B.referrerId) return;

  const A = await User.findById(B.referrerId); // A = referrer
  if (!A) return;

  const referredCount = await User.countDocuments({ referrerId: A._id });
  if (referredCount >= REFERRAL_CAP) {
    console.log(`[Referral] ${A.username} cap reached (${referredCount}) — skipping award`);
    return;
  }

  const eligible = await isEligibleTwitterProfile(B.twitterProfileData || {});
  if (!eligible) {
    console.log(`[Referral] referred user ${B.username} not eligible — no award to ${A.username}`);
    return;
  }

  const memeCount = await Meme.countDocuments({ userId: B._id });
  let milestone = null;
  let base = 0;
  if (memeCount === 1) { milestone = 'first_meme'; base = FIRST_MEME_BASE; }
  else if (memeCount === 3) { milestone = 'third_meme'; base = THIRD_MEME_BASE; }
  else return;

  const key = `referral:${A._id.toString()}:${B._id.toString()}:${milestone}`;
  const exists = await UserAction.findOne({ actionType: 'referral_bonus', actionKey: key }).lean();
  if (exists) return;

  const pts = Number(B?.trust?.pts ?? 0);
  const mults = getPTSMultipliers(pts);
  const award = Math.round(base * (mults?.share || 1));
  if (award <= 0) return;

  await UserAction.create({
    userId: A._id,
    actionType: 'referral_bonus',
    actionKey: key,
    deltaApplied: award,
    metadata: {
      milestone,
      referredUserId: B._id,
      referredUsername: B.username,
      referredPts: pts,
      multiplierUsed: mults?.share || 1,
      base,
    },
  });

  A.referralPoints = (A.referralPoints || 0) + award;
  await A.save();

  console.log(`[Referral] Awarded ${award} to ${A.username} for ${milestone} of ${B.username}`);
}

/** Public stats for a user's referral page: who they referred + points earned. */
async function getReferralStatsForUser(userId) {
  const user = await User.findById(userId).select('_id username referralPoints').lean();
  if (!user) throw new Error('UserNotFound');

  const referred = await User.find({ referrerId: user._id }).select('_id username trust twitterProfileData createdAt').lean();

  const rows = [];
  for (const r of referred) {
    const posted = await Meme.countDocuments({ userId: r._id });
    const earned = await UserAction.aggregate([
      { $match: { userId: user._id, actionType: 'referral_bonus', 'metadata.referredUserId': r._id } },
      { $group: { _id: null, points: { $sum: '$deltaApplied' } } },
    ]);

    rows.push({
      referredUserId: r._id,
      referredUsername: r.username,
      hasFirstMeme: posted >= 1,
      hasThirdMeme: posted >= 3,
      earnedPoints: earned?.[0]?.points || 0,
    });
  }

  const totalFromActionsAgg = await UserAction.aggregate([
    { $match: { userId: user._id, actionType: 'referral_bonus' } },
    { $group: { _id: null, points: { $sum: '$deltaApplied' } } },
  ]);

  return {
    user: { _id: user._id, username: user.username },
    totals: {
      referredCount: referred.length,
      cap: REFERRAL_CAP,
      earned: totalFromActionsAgg?.[0]?.points || 0,
      earnedMirror: user.referralPoints || 0,
    },
    referred: rows,
  };
}

module.exports = { maybeAwardOnUpload, getReferralStatsForUser };
