// config/featureFlags.js
module.exports = {
  FEATURE_POST_TEXT_QUALITY: process.env.FEATURE_POST_TEXT_QUALITY === 'true',

  DISCOVERY_PAGES_PER_DAY: Number(process.env.DISCOVERY_PAGES_PER_DAY || '3'),
  DISCOVERY_MAX_RESULTS: Number(process.env.DISCOVERY_MAX_RESULTS || '100'),
  REPLY_SWEEP_BATCH_USERS: Number(process.env.REPLY_SWEEP_BATCH_USERS || '200'),
  REPLY_SWEEP_PAGES_PER_BATCH: Number(process.env.REPLY_SWEEP_PAGES_PER_BATCH || '2'),

  // Daily per-user caps on sentiment-tagged replies, to blunt vote-brigading.
  DAILY_PUMPS: Number(process.env.DAILY_PUMPS || '10'),
  DAILY_DUMPS: Number(process.env.DAILY_DUMPS || '5'),

  // Per-post ceilings so one viral post can't be farmed indefinitely.
  SELF_POST_MAX: Number(process.env.SELF_POST_MAX || '50'),
  SHARED_POST_MAX: Number(process.env.SHARED_POST_MAX || '75'),

  DISCOVERY_QUERY:
    process.env.DISCOVERY_QUERY ||
    '(GRFTY OR #GRFTY) (GRIZL OR #GRIZL) (has:images OR has:media) -is:retweet -is:quote -is:reply',

  SHARE_HASHTAGS: process.env.SHARE_HASHTAGS || '(#GRIZL OR #GRFTY OR GRIZL OR GRFTY)',
  REPLY_HASHTAGS: process.env.REPLY_HASHTAGS || '(#GRIZL OR #GRFTY OR #pump OR #dump)',
};
