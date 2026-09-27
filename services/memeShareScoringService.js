/* eslint-disable no-console */
// services/memeShareScoringService.js
//
// The core of the engine. Four entry points, each run on its own schedule
// (see scripts/run*.js and cron/scheduler.js):
//
//   runDailyDiscovery()      — scans X for new posts using the campaign
//                               hashtags, perceptual-hash-matches their media
//                               against validated memes, and mints points for
//                               both the poster and the meme's original creator.
//   runDailyQuoteSweep()     — finds quote-tweets of already-discovered posts
//                               and awards the original creator again.
//   runStaggeredReplySweep() — walks active users' recent replies, applies
//                               #pump/#dump sentiment tagging (rate-limited),
//                               and awards time-decayed interaction points.
//   runDailyBulkRefresh()    — re-fetches engagement metrics on older posts
//                               and tops up the poster's tier bonus if the
//                               post kept gaining traction after the fact.
const dayjs = require('dayjs');
const https = require('https');
const http = require('http');

const { scorePostTextQuality, postQualityBonus } = require('./postQuality.service');
const { getUserRoleBoost, applyRoleBoost } = require('./roleBoost.service');
const fetchTweetsByIdBatch = require('./fetchTweetsByIdBatch');
const TwitterRateLimiter = require('../utils/rateLimiter');
const rateLimiter = new TwitterRateLimiter();

const User = require('../models/User');
const Meme = require('../models/Meme');
const MemeshareScore = require('../models/MemeshareScore');
const UserAction = require('../models/UserAction');

const {
  generatePerceptualHash,
  generatePerceptualHashFromVideo,
  hammingDistance,
} = require('./imageValidation.service');

const { getPTSMultipliers } = require('./pts.service');
const { interactionPointsFromPublicMetrics, tierFor, timeDecayMultiplier } = require('./tierTables');
const { recentSearch, tweetsLookup } = require('./twitterSearchClient');

const DEBUG_DISCOVERY = String(process.env.DEBUG_DISCOVERY || '').toLowerCase() === '1';
function dlog(...args) { if (DEBUG_DISCOVERY) console.log('[Discovery]', ...args); }

async function fetchTweetById(id, extraOptions = {}) {
  const res = await tweetsLookup([id], {
    'tweet.fields': ['public_metrics', 'created_at', 'author_id', 'referenced_tweets', 'entities', 'conversation_id'],
    expansions: ['author_id', 'referenced_tweets.id'],
    ...extraOptions,
  }).catch((e) => {
    console.error('[fetchTweetById] Twitter API threw:', e?.message || e);
    return null;
  });
  return Array.isArray(res?.data) ? res.data[0] : null;
}

// ======= constants =======
const DISCOVERY_LOOKBACK_HOURS = Number(process.env.DISCOVERY_LOOKBACK_HOURS || 24);
const BASE_ACTOR_SHARE_POINTS = 10;
const BASE_CREATOR_SHARE_POINTS = 5;

const REPLY_SWEEP_BATCH_USERS = Number(process.env.REPLY_SWEEP_BATCH_USERS || 200);
const REPLY_SWEEP_PAGES_PER_BATCH = Number(process.env.REPLY_SWEEP_PAGES_PER_BATCH || 2);
const BULK_REFRESH_LOOKBACK_HOURS = Number(process.env.BULK_REFRESH_LOOKBACK_HOURS || 14 * 24);
const BULK_REFRESH_PAGE_LIMIT = Number(process.env.BULK_REFRESH_PAGE_LIMIT || 400);

const SHARE_HASHTAGS = process.env.SHARE_HASHTAGS || '(#GRIZL OR #GRFTY OR GRIZL OR GRFTY)';

// Unified perceptual-hash threshold in bits. 8 is strict; 10-12 is looser.
const IMAGE_HASH_THRESHOLD = Number(process.env.IMAGE_HASH_THRESHOLD || 28);

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
async function hasShareInLast24h(userId, at = new Date()) {
  const since = new Date(new Date(at).getTime() - ONE_DAY_MS);
  return !!(await UserAction.exists({ userId, actionType: 'share', createdAt: { $gte: since } }));
}

function safeNum(n, fb = 0) {
  const v = Number(n);
  return Number.isFinite(v) ? v : fb;
}
function toTwo(n) {
  return Math.round(n * 100) / 100;
}

function normalizeTwitterPhotoUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.endsWith('twimg.com') && u.searchParams.has('name')) u.searchParams.set('name', 'large');
    return u.toString();
  } catch {
    return url;
  }
}

function downloadBuffer(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    lib
      .get(url, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

// ========== Quote-RT Discovery (Share) ==========
// Finds quote-tweets of posts we've already scored as `self_post`, and awards
// the original meme's creator a "shared_post_creator_reward" for each unique
// quote-sharer (skipping self-quotes).
async function runDailyQuoteSweep() {
  const originals = await MemeshareScore.find({
    mode: 'self_post',
    createdAt: { $gte: dayjs().subtract(48, 'hour').toDate() },
  }).select(['twitterPostId', 'memeCreatorId', 'createdAt', 'memeId']);

  let created = 0;
  for (const o of originals) {
    const q = `is:quote url:"twitter.com/*/status/${o.twitterPostId}"`;
    const res = await recentSearch({ query: q, max_results: 100 }).catch((e) => {
      console.error('[QuoteSweep] recentSearch error:', e?.message || e);
      return null;
    });
    if (!res) continue;

    const tweets = res.data || [];
    const users = new Map((res.includes?.users || []).map((u) => [u.id, u]));
    const seen = new Set();

    for (const qt of tweets) {
      const sharerId = qt.author_id;
      if (seen.has(sharerId)) continue;
      seen.add(sharerId);

      const actor = await User.findOne({ twitterUserId: qt.author_id }).select('_id trust').lean();
      if (!actor?._id) {
        dlog('Skipping tweet — no actor found in DB:', { tweetId: qt.id, authorId: qt.author_id });
        continue;
      }
      const actorPts = actor?.trust?.pts;
      const m = actorPts == null ? { self: 1, share: 1, interaction: 1 } : getPTSMultipliers(actorPts);

      const selfQuote = String(o.memeCreatorId) === String(actor._id);
      if (!selfQuote) {
        const exists = await MemeshareScore.findOne({ mode: 'shared_post_creator_reward', twitterPostId: qt.id }).lean();
        if (!exists) {
          const creatorBaseAward = toTwo(BASE_CREATOR_SHARE_POINTS * m.share);
          await MemeshareScore.create({
            platform: 'x',
            twitterPostId: qt.id,
            conversationId: qt.conversation_id || qt.id,
            originalTwitterPostId: o.twitterPostId,
            memeCreatorId: o.memeCreatorId,
            shareActorId: sharerId,
            memeId: o.memeId,
            mode: 'shared_post_creator_reward',
            createdAt: new Date(qt.created_at),
            ptsSharerMultiplier: m.share,
            creatorBaseAward,
          });
          created++;
        }
      }

      const actionKey = `${actor._id}:${qt.id}:share`;
      const existsUA = await UserAction.findOne({ actionKey }).lean();
      const alreadyToday = await hasShareInLast24h(actor._id, new Date(qt.created_at));

      if (!existsUA && !alreadyToday) {
        const basePoints = toTwo(BASE_ACTOR_SHARE_POINTS * m.self);
        const roleBoost = await getUserRoleBoost(actor);
        const finalPoints = applyRoleBoost(basePoints, roleBoost);

        await UserAction.create({
          userId: actor._id,
          memeId: o.memeId,
          actionType: 'share',
          actionKey,
          createdAt: new Date(qt.created_at),
          pointsApplied: finalPoints,
          platform: 'x',
        });
      }
    }
  }
  console.log('[QuoteSweep] created creator-reward rows:', created);
  return { created };
}

// ========== Reply Sweep ==========
// Walks a batch of active users' recent replies containing the campaign
// hashtags, tags #pump/#dump sentiment (capped per day), and awards
// time-decayed interaction points for replies on other users' posts.
async function runStaggeredReplySweep() {
  const users = await User.find({ isActive: true, twitterUserId: { $ne: null } })
    .limit(REPLY_SWEEP_BATCH_USERS)
    .lean();

  for (const u of users) {
    const mults = getPTSMultipliers(safeNum(u.trust?.pts, 0));
    const handle = u.twitterProfileData?.username || u.username;
    if (!handle) continue;

    const res = await recentSearch({
      query: `${SHARE_HASHTAGS} from:${handle} is:reply`,
      max_results: REPLY_SWEEP_PAGES_PER_BATCH * 50,
      expansions: ['referenced_tweets.id'],
      'tweet.fields': ['created_at', 'referenced_tweets', 'public_metrics', 'text'],
    }).catch((e) => {
      console.error('[ReplySweep] recentSearch error:', e?.message || e);
      return null;
    });

    const tweets = res?.data || [];
    for (const t of tweets) {
      const txt = (t.text || '').toLowerCase();
      const isPump = txt.includes('#pump');
      const isDump = txt.includes('#dump');

      const parentId = (t.referenced_tweets || []).find((rt) => rt.type === 'replied_to')?.id;
      if (!parentId) continue;

      const targetRow =
        (await MemeshareScore.findOne({ twitterPostId: parentId }).select('_id memeId memeCreatorId mode createdAt').lean()) ||
        (await MemeshareScore.findOne({ originalTwitterPostId: parentId }).select('_id memeId memeCreatorId mode createdAt').lean());

      const memeId = targetRow?.memeId;
      if (!memeId) continue;

      if (isPump || isDump) {
        const action = isPump ? 'pump' : 'dump';
        const key = `${u._id}:${t.id}:${action}`;

        const since = dayjs().subtract(24, 'hour').toDate();
        const recentCount = await UserAction.countDocuments({ userId: u._id, actionType: action, createdAt: { $gte: since } });
        if (recentCount >= 5) continue; // max 5 pump/dump tags per day

        const activeSince = dayjs().subtract(7, 'day').toDate();
        const recentSelfPost = await MemeshareScore.exists({
          memeCreatorId: u._id,
          mode: 'self_post',
          twitterPostId: { $ne: null },
          createdAt: { $gte: activeSince },
        });
        if (!recentSelfPost) continue; // must have posted recently to tag sentiment

        const exists = await UserAction.findOne({ actionKey: key }).lean();
        if (!exists) {
          let basePoints = toTwo((isPump ? 3 : -3) * mults.self);
          if (basePoints !== 0) {
            const roleBoost = await getUserRoleBoost(u);
            const finalPoints = applyRoleBoost(basePoints, roleBoost);
            await UserAction.create({
              userId: u._id,
              memeId,
              actionType: action,
              actionKey: key,
              createdAt: new Date(t.created_at),
              deltaApplied: finalPoints,
              platform: 'x',
            });
          }
        }
      }

      if (String(targetRow?.memeCreatorId) !== String(u._id)) {
        const base = interactionPointsFromPublicMetrics(t.public_metrics || {});
        const decay = timeDecayMultiplier(targetRow.createdAt, t.created_at);
        const basePoints = toTwo(base * decay * mults.interaction);

        if (basePoints > 0) {
          const roleBoost = await getUserRoleBoost(u);
          const finalPoints = applyRoleBoost(basePoints, roleBoost);
          const key = `${u._id}:${t.id}:replyPts`;
          const exists = await UserAction.findOne({ actionKey: key }).lean();
          if (!exists) {
            await UserAction.create({
              userId: u._id,
              memeId,
              actionType: 'reply',
              actionKey: key,
              createdAt: new Date(t.created_at),
              deltaApplied: finalPoints,
              platform: 'x',
            });
          }
        }
      }
    }
  }
  return { done: true };
}

// ========== Discovery: validate posts via perceptual-hash matching ==========
function getTweetMediaUrls(t, includes) {
  const keys = t.attachments?.media_keys || [];
  const byKey = new Map((includes?.media || []).map((m) => [m.media_key, m]));
  const urls = [];

  for (const k of keys) {
    const m = byKey.get(k);
    if (!m) continue;
    if (m.type === 'photo' && m.url) urls.push({ type: 'image', url: normalizeTwitterPhotoUrl(m.url) });
    else if (m.type === 'animated_gif' && m.preview_image_url) urls.push({ type: 'gif', url: m.preview_image_url });
    else if (m.type === 'video') {
      const videoUrl = m.preview_image_url || m.url || m.variants?.find((v) => v.content_type === 'video/mp4')?.url;
      if (videoUrl) urls.push({ type: 'video', url: videoUrl });
    }
  }
  return urls;
}

async function runDailyDiscovery() {
  const lookbackIso = dayjs().subtract(DISCOVERY_LOOKBACK_HOURS, 'hour').toISOString();
  const query =
    (process.env.DISCOVERY_QUERY && process.env.DISCOVERY_QUERY.trim()) ||
    '(GRFTY OR #GRFTY) (GRIZL OR #GRIZL) (has:images OR has:media) -is:retweet -is:quote -is:reply';

  console.log('[ImageMatchDiscovery] scanning recent image tweets since', lookbackIso, 'query =', query);

  const validatedMemes = await Meme.find({ validationStatus: 'validated', imageHash: { $exists: true, $ne: null } })
    .select('_id imageHash userId')
    .lean();

  let scanned = 0;
  let created = 0;
  let next;
  const PAGE_CAP = 5; // safety cap: ~500 tweets per run
  let page = 0;

  do {
    page++;
    const res = await recentSearch({
      query,
      start_time: lookbackIso,
      max_results: 100,
      next_token: next,
      expansions: ['author_id', 'attachments.media_keys'],
      'tweet.fields': ['created_at', 'author_id', 'conversation_id', 'attachments', 'entities', 'id', 'text'],
      'user.fields': ['id', 'username', 'name'],
      'media.fields': ['media_key', 'type', 'url', 'preview_image_url'],
    }).catch((e) => {
      console.error('[ImageMatchDiscovery] recentSearch error:', e?.message || e);
      return null;
    });

    const tweets = res?.data || [];
    if (!tweets.length) break;

    const includes = res.includes || {};
    for (const t of tweets) {
      scanned++;

      const actor = await User.findOne({ twitterUserId: t.author_id }).select('_id trust').lean();
      if (!actor?._id) continue;

      const alreadyScored = await MemeshareScore.findOne({ mode: 'self_post', twitterPostId: t.id }).lean();
      if (alreadyScored) continue;

      const urls = getTweetMediaUrls(t, includes);
      if (urls.length === 0) continue;

      const { quality, reason } = await scorePostTextQuality(t.text || '');
      const qualityBonusSelf = postQualityBonus('self_post', quality);
      const qualityBonusShare = postQualityBonus('shared_post', quality);

      for (const { type, url } of urls) {
        try {
          const tweetHash =
            type === 'video' ? await generatePerceptualHashFromVideo(url) : await generatePerceptualHash(await downloadBuffer(url));

          let best = { dist: Infinity, meme: null };
          for (const m of validatedMemes) {
            const d = hammingDistance(tweetHash, m.imageHash);
            if (d < best.dist) best = { dist: d, meme: m };
          }

          if (!(best.meme && best.dist <= IMAGE_HASH_THRESHOLD)) {
            dlog('No matching meme for tweet:', { tweetId: t.id, bestDist: best.dist, threshold: IMAGE_HASH_THRESHOLD });
            continue;
          }

          await MemeshareScore.create({
            platform: 'x',
            twitterPostId: t.id,
            conversationId: t.conversation_id || t.id,
            memeCreatorId: best.meme.userId,
            shareActorId: actor._id,
            memeId: best.meme._id,
            mode: 'self_post',
            createdAt: new Date(t.created_at),
            postText: t.text || '',
            tweetText: t.text || '',
            imageMatch: { matched: true, distance: best.dist, threshold: IMAGE_HASH_THRESHOLD, matchedMemeId: best.meme._id },
            textQuality: { quality, reason, appliedAt: new Date() },
          });

          const mults = actor.trust?.pts == null ? { self: 1, share: 1, interaction: 1 } : getPTSMultipliers(Number(actor.trust.pts));

          // Award the poster (capped to one share award per 24h).
          const actorActionKey = `${actor._id}:${t.id}:share`;
          const existsUA = await UserAction.findOne({ actionKey: actorActionKey }).lean();
          const alreadyAwardedToday = await hasShareInLast24h(actor._id, new Date(t.created_at));
          if (!existsUA && !alreadyAwardedToday) {
            const basePoints = toTwo(10 * mults.self + qualityBonusSelf);
            if (basePoints !== 0) {
              const roleBoost = await getUserRoleBoost(actor);
              const finalPoints = applyRoleBoost(basePoints, roleBoost);
              await UserAction.create({
                userId: actor._id,
                memeId: best.meme._id,
                actionType: 'share',
                actionKey: actorActionKey,
                createdAt: new Date(t.created_at),
                pointsApplied: finalPoints,
                platform: 'x',
              });
            }
          }

          // Creator reward (skipped for self-posts of your own meme).
          const isSelfPost = String(best.meme.userId) === String(actor._id);
          const creatorExists = await MemeshareScore.findOne({ mode: 'shared_post_creator_reward', twitterPostId: t.id }).lean();
          if (!creatorExists) {
            const creatorBaseAward = isSelfPost ? 0 : toTwo(5 * mults.share + qualityBonusShare);
            await MemeshareScore.create({
              platform: 'x',
              twitterPostId: t.id,
              conversationId: t.conversation_id || t.id,
              memeCreatorId: best.meme.userId,
              shareActorId: actor._id,
              memeId: best.meme._id,
              mode: 'shared_post_creator_reward',
              createdAt: new Date(t.created_at),
              postText: t.text || '',
              tweetText: t.text || '',
              ptsSharerMultiplier: mults.share,
              creatorBaseAward,
              textQuality: { quality, reason, appliedAt: new Date() },
            });

            const creatorUAKey = `${best.meme.userId}:${t.id}:creatorReward`;
            const creatorUAExists = await UserAction.findOne({ actionKey: creatorUAKey }).lean();
            if (!creatorUAExists && creatorBaseAward > 0) {
              const creatorRoleBoost = await getUserRoleBoost({ _id: best.meme.userId });
              const finalCreatorAward = applyRoleBoost(creatorBaseAward, creatorRoleBoost);
              await UserAction.create({
                userId: best.meme.userId,
                memeId: best.meme._id,
                actionType: 'share',
                actionKey: creatorUAKey,
                createdAt: new Date(t.created_at),
                deltaApplied: finalCreatorAward,
                platform: 'x',
              });
            }
          }

          created++;
          break; // stop after the first media match on this tweet
        } catch (e) {
          console.error('[ImageMatchDiscovery] media error for', url, e?.message || e);
        }
      }
    }

    next = res?.meta?.next_token;
  } while (next && page < PAGE_CAP);

  console.log('[ImageMatchDiscovery] done:', { scanned, created, lookbackHours: DISCOVERY_LOOKBACK_HOURS, pages: page });
  return { discovered: created, scanned };
}

// ========== Bulk Refresh (tier-bonus top-ups) ==========
// Re-fetches engagement metrics on recent posts and tops up the poster's
// award if the post kept gaining traction after it was first scored.
async function runDailyBulkRefresh() {
  const since = dayjs().subtract(BULK_REFRESH_LOOKBACK_HOURS, 'hour').toDate();

  const cursor = MemeshareScore.find({ createdAt: { $gte: since }, mode: { $in: ['self_post', 'shared_post_creator_reward'] } })
    .select(['_id', 'mode', 'twitterPostId', 'memeCreatorId', 'shareActorId', 'createdAt'])
    .cursor();

  const tweetIdMap = new Map();
  let scanned = 0;
  let updated = 0;

  for await (const row of cursor) {
    scanned++;
    if (scanned > BULK_REFRESH_PAGE_LIMIT) break;
    tweetIdMap.set(row.twitterPostId, row);
  }

  const tweetIds = Array.from(tweetIdMap.keys());
  const batchedTweets = await fetchTweetsByIdBatch(tweetIds);

  for (const tweetId of tweetIds) {
    const tw = batchedTweets[tweetId];
    const row = tweetIdMap.get(tweetId);
    if (!tw?.public_metrics) continue;

    const pts = interactionPointsFromPublicMetrics(tw.public_metrics);
    const tier = tierFor(pts);
    if (!tier) continue;

    const isShared = row.mode === 'shared_post_creator_reward';
    const shouldBe = safeNum(isShared ? tier.shared : tier.self, 0);
    const userId = isShared ? row.shareActorId : row.memeCreatorId;

    const actionKey = `${userId}:${row.twitterPostId}:share`;
    const userAction = await UserAction.findOne({ actionKey, actionType: 'share' }).lean();
    const alreadyPoster = safeNum(userAction?.deltaApplied, 0);

    if (shouldBe > alreadyPoster && userId) {
      const tierBonus = toTwo(shouldBe - alreadyPoster);
      const user = await User.findById(userId).select('discordRoles').lean();
      const roleBoost = await getUserRoleBoost(user);
      const finalTierBonus = applyRoleBoost(tierBonus, roleBoost);

      const result = await UserAction.updateOne(
        { actionKey, actionType: 'share' },
        { $set: { updatedAt: new Date() }, $inc: { deltaApplied: finalTierBonus } }
      );
      if (result.modifiedCount > 0) updated++;
    }
  }

  console.log('[BulkRefresh] done:', { scanned, updated });
  return { scanned, updated };
}

module.exports = {
  runDailyDiscovery,
  runDailyBulkRefresh,
  runDailyQuoteSweep,
  runStaggeredReplySweep,
};
