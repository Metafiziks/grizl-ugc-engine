// scripts/runReplySweep.js
require('dotenv').config();
const { connect, disconnect } = require('../db');
const { runStaggeredReplySweep } = require('../services/memeShareScoringService');

(async () => {
  try {
    await connect();
    const res = await runStaggeredReplySweep();
    console.log('[ReplySweep] done:', res);
    await disconnect();
    process.exit(0);
  } catch (e) {
    console.error('[ReplySweep] error:', e?.message || e);
    try { await disconnect(); } catch {}
    process.exit(1);
  }
})();
