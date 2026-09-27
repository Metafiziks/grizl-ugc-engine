// cron/scheduler.js
//
// Wires the four sweeps into node-cron for a simple "always-on" deployment.
// In production this repo was originally built from, each sweep instead ran
// as its own scheduled Cloud Run Job (see scripts/run*.js) — this file is a
// single-process equivalent that's easier to run locally or on a small VM.
require('dotenv').config();
const cron = require('node-cron');
const { connect } = require('../db');
const {
  runDailyDiscovery,
  runDailyBulkRefresh,
  runDailyQuoteSweep,
  runStaggeredReplySweep,
} = require('../services/memeShareScoringService');

async function main() {
  await connect();
  console.log('[Scheduler] connected, registering jobs');

  // Discovery + quote sweep: every 30 minutes.
  cron.schedule('*/30 * * * *', async () => {
    try {
      console.log('[Scheduler] running discovery + quote sweep');
      await runDailyDiscovery();
      await runDailyQuoteSweep();
    } catch (e) {
      console.error('[Scheduler] discovery/quote sweep failed:', e?.message || e);
    }
  });

  // Reply sweep: every hour, staggered across a batch of users per run.
  cron.schedule('0 * * * *', async () => {
    try {
      console.log('[Scheduler] running reply sweep');
      await runStaggeredReplySweep();
    } catch (e) {
      console.error('[Scheduler] reply sweep failed:', e?.message || e);
    }
  });

  // Bulk refresh (tier-bonus top-ups): once a day.
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log('[Scheduler] running bulk refresh');
      await runDailyBulkRefresh();
    } catch (e) {
      console.error('[Scheduler] bulk refresh failed:', e?.message || e);
    }
  });

  console.log('[Scheduler] running. Ctrl+C to stop.');
}

main().catch((e) => {
  console.error('[Scheduler] fatal:', e?.message || e);
  process.exit(1);
});
