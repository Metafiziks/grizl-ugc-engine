// controllers/referrals.controller.js
const { getReferralStatsForUser } = require('../services/referralService');

async function getMyReferralStats(req, res) {
  try {
    const stats = await getReferralStatsForUser(req.params.userId);
    res.json(stats);
  } catch (error) {
    if (error.message === 'UserNotFound') return res.status(404).json({ error: 'User not found' });
    console.error('[Referrals] error:', error?.message || error);
    res.status(500).json({ error: 'Failed to load referral stats' });
  }
}

module.exports = { getMyReferralStats };
