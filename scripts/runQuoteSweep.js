// scripts/runQuoteSweep.js
require('dotenv').config();
const { connect, disconnect } = require('../db');
const { runDailyQuoteSweep } = require('../services/memeShareScoringService');

(async () => {
  try {
    await connect();
    const res = await runDailyQuoteSweep();
    console.log('[QuoteSweep] done:', res);
    await disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[QuoteSweep] error:', e?.message || e);
    try { await disconnect(); } catch {}
    process.exit(1);
  }
})();
