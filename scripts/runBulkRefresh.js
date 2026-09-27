// scripts/runBulkRefresh.js
require('dotenv').config();
const { connect, disconnect } = require('../db');
const { runDailyBulkRefresh } = require('../services/memeShareScoringService');

(async () => {
  try {
    await connect();
    const res = await runDailyBulkRefresh();
    console.log('[BulkRefresh] done:', res);
    await disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[BulkRefresh] error:', e?.message || e);
    try { await disconnect(); } catch {}
    process.exit(1);
  }
})();
