// controllers/leaderboard.controller.js
const mongoose = require('mongoose');
const User = require('../models/User');
const UserAction = require('../models/UserAction');
const MemeshareScore = require('../models/MemeshareScore');

function n(v, d = 0) {
  const num = Number(v);
  return Number.isFinite(num) ? num : d;
}

// Sum of creatorBaseAward across every "shared_post_creator_reward" row for
// memes this user created — i.e. points earned from *other* people sharing
// memes this user originally posted.
async function sumCreatorBaseAwards(userId) {
  const agg = await MemeshareScore.aggregate([
    { $match: { memeCreatorId: new mongoose.Types.ObjectId(userId), mode: 'shared_post_creator_reward' } },
    { $group: { _id: null, points: { $sum: '$creatorBaseAward' } } },
  ]);
  return n(agg?.[0]?.points, 0);
}

async function getLeaderboard(_req, res) {
  try {
    const users = await User.find({ isActive: true, isAdmin: { $ne: true } })
      .select('_id username profilePic twitterUserId discordRoles referralPoints')
      .lean();

    const leaderboard = [];

    for (const u of users) {
      const creatorScore = await sumCreatorBaseAwards(u._id);

      const matchUser = { userId: u._id };
      const [posterAgg, actorAgg] = await Promise.all([
        UserAction.aggregate([
          { $match: { ...matchUser, actionType: 'share' } },
          { $group: { _id: '$userId', points: { $sum: { $add: [{ $ifNull: ['$pointsApplied', 0] }, { $ifNull: ['$deltaApplied', 0] }] } } } },
        ]),
        UserAction.aggregate([
          { $match: { ...matchUser, actionType: { $in: ['reply', 'pump', 'dump'] } } },
          { $group: { _id: '$userId', points: { $sum: { $add: [{ $ifNull: ['$deltaApplied', 0] }, { $ifNull: ['$pointsApplied', 0] }] } } } },
        ]),
      ]);

      const posterScore = n(posterAgg?.[0]?.points, 0);
      const actorScore = n(actorAgg?.[0]?.points, 0);
      const referralScore = n(u.referralPoints, 0);
      const total = creatorScore + posterScore + actorScore + referralScore;

      leaderboard.push({
        userId: u._id,
        username: u.username,
        profilePic: u.profilePic,
        totalScore: total,
        breakdown: { creatorScore, posterScore, actorScore, referralScore },
      });
    }

    leaderboard.sort((a, b) => b.totalScore - a.totalScore);
    leaderboard.forEach((e, i) => (e.rank = i + 1));

    res.json({ leaderboard });
  } catch (error) {
    console.error('[Leaderboard] error:', error?.message || error);
    res.status(500).json({ error: 'Failed to generate leaderboard' });
  }
}

module.exports = { getLeaderboard };
