const router = require('express').Router();
const { getMyReferralStats } = require('../controllers/referrals.controller');

router.get('/:userId/stats', getMyReferralStats);

module.exports = router;
