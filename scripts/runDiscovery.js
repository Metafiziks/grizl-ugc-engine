// scripts/runDiscovery.js
require('dotenv').config();
const { connect, disconnect } = require('../db');
const { runDailyDiscovery } = require('../services/memeShareScoringService');

(async () => {
  try {
    await connect();
    const out = await runDailyDiscovery();
    console.log('[Discovery] done:', out);
    await disconnect();
    process.exit(0);
  } catch (err) {
    console.error('[run-discovery] fatal:', err?.message || err);
    try { await disconnect(); } catch {}
    process.exit(1);
  }
})();
