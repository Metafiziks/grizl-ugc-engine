// scripts/seed.js
//
// Populates a demo database so you can run the leaderboard/meme/referral
// endpoints without live X/OpenAI credentials or real campaign history.
// Uses the actual 100 base GRFTY meme templates (data/grfty-memes.json) as
// meme content, seeds a handful of demo users, and backfills some
// MemeshareScore/UserAction rows so the leaderboard has something to show.
require('dotenv').config();
const crypto = require('crypto');
const { connect, disconnect } = require('../db');
const User = require('../models/User');
const Meme = require('../models/Meme');
const MemeshareScore = require('../models/MemeshareScore');
const UserAction = require('../models/UserAction');
const grftyMemes = require('../data/grfty-memes.json');

const DEMO_USERNAMES = ['grizzly_gm', 'timeline_terrorist', 'diamond_hands_dee', 'oasis_operator', 'grfty_maximalist'];

// Seeding shouldn't require network access to hash real images, so we derive
// a stand-in perceptual hash from the meme's own id — good enough to
// demonstrate the dedupe index without depending on Cloudinary being up.
function fakeHash(seed) {
  return crypto.createHash('md5').update(seed).digest('hex').padEnd(64, '0').slice(0, 64);
}

async function seed() {
  await connect();

  await Promise.all([User.deleteMany({}), Meme.deleteMany({}), MemeshareScore.deleteMany({}), UserAction.deleteMany({})]);

  const users = await User.insertMany(
    DEMO_USERNAMES.map((username, i) => ({
      username,
      twitterUserId: `demo-${i}`,
      twitterProfileData: {
        tweet_count: 500 + i * 50,
        created_at: new Date(Date.now() - (400 + i * 100) * 86400000).toISOString(),
        profile_image_url: 'https://example.com/avatar.png',
        followers_count: 200 + i * 30,
        following_count: 100,
      },
      trust: { pts: 60 + i * 8 },
      isActive: true,
    }))
  );

  const memeDocs = await Meme.insertMany(
    grftyMemes.slice(0, 20).map((m, i) => ({
      userId: users[i % users.length]._id,
      imageUrl: m.imageUrl,
      thumbnailUrl: m.imageUrl,
      caption: m.name,
      mediaType: 'image',
      isApproved: true,
      validationStatus: 'validated',
      imageHash: fakeHash(m.id),
      rarityTier: m.tier,
    }))
  );

  // A few self_post + shared_post_creator_reward rows so the leaderboard has
  // real numbers to aggregate on first run.
  const shareRows = [];
  const actionRows = [];
  memeDocs.forEach((meme, i) => {
    const poster = users[(i + 1) % users.length];
    shareRows.push({
      platform: 'x',
      twitterPostId: `demo-tweet-self-${i}`,
      memeCreatorId: meme.userId,
      shareActorId: poster._id,
      memeId: meme._id,
      mode: 'self_post',
      postText: `Sharing my favorite GRFTY meme #GRIZL #GRFTY`,
      imageMatch: { matched: true, distance: 2, threshold: 28, matchedMemeId: meme._id },
      textQuality: { quality: 3, reason: 'on-brand and memetic', appliedAt: new Date() },
    });
    actionRows.push({
      userId: poster._id,
      memeId: meme._id,
      actionType: 'share',
      actionKey: `${poster._id}:demo-tweet-self-${i}:share`,
      pointsApplied: 12 + i,
    });

    if (String(poster._id) !== String(meme.userId)) {
      shareRows.push({
        platform: 'x',
        twitterPostId: `demo-tweet-quote-${i}`,
        originalTwitterPostId: `demo-tweet-self-${i}`,
        memeCreatorId: meme.userId,
        shareActorId: poster._id,
        memeId: meme._id,
        mode: 'shared_post_creator_reward',
        creatorBaseAward: 5 + Math.round(i / 2),
      });
    }
  });

  await MemeshareScore.insertMany(shareRows);
  await UserAction.insertMany(actionRows);

  console.log(`[Seed] ${users.length} users, ${memeDocs.length} memes, ${shareRows.length} share rows, ${actionRows.length} actions`);
  await disconnect();
  process.exit(0);
}

seed().catch((e) => {
  console.error('[Seed] failed:', e?.message || e);
  process.exit(1);
});
