# GRIZL UGC Engine

An always-on social campaign and UGC scoring system, built around X (Twitter) and Discord. This is the sanitized, standalone core of the engine that ran GRIZL's meme campaign — the production repo also has an NFT battle game, wallet/credits system, and admin dashboard bolted onto it, none of which is here.

## The problem

GRIZL's campaign depended on users creating and sharing memes, replying to posts, referring other users, and participating in coordinated social activity. At even modest scale, manually checking whether every post was valid, whether someone had reused the same content, whether a reply actually contributed anything, or whether someone was gaming the scoring system became impossible.

## What it does

A Node.js/Express + MongoDB backend runs scheduled sweeps against the X API and processes new activity continuously:

- **Discovers** posts tagged with the campaign hashtags, and quote-tweets of posts already in the system.
- **Validates** that shared images actually match a known meme, using perceptual hashing (`imghash` + Hamming distance) instead of exact-match hashing — so re-encoded, re-cropped, or re-uploaded copies still get caught as duplicates. Videos are handled too, by pulling a mid-frame and hashing that.
- **Scores** post and reply text quality with GPT (`gpt-4o-mini`), so a one-word "nice" reply doesn't earn the same points as a genuinely on-brand, creative one.
- **Enforces eligibility and anti-farming rules**: a minimum account age and tweet count gate participation at all, and a lightweight farm-detector flags bio reuse, avatar reuse, numeric-suffix usernames, and clusters of accounts created within 48 hours of each other — all of which discount a user's trust score.
- **Awards points** for posting, being quote-shared, replying, and #pump/#dump sentiment tagging — each capped per day and scaled by the poster's trust score, with an optional Discord-role point boost layered on top.
- **Runs referral logic**: a referrer earns points when someone they invited hits posting milestones, capped per referrer so it can't be farmed with sock puppets.
- **Rolls up a leaderboard** combining creator rewards, poster rewards, interaction points, and referral points.

None of this requires a human sitting there approving activity. Once deployed, the loop is: **discover → validate → evaluate → score → update**, running continuously as new activity appears on X. The team's job shifts from manual verification to campaign strategy and reviewing exceptions.

## Architecture

```
scripts/runDiscovery.js  ─┐
scripts/runQuoteSweep.js  │
scripts/runReplySweep.js  ├──▶ services/memeShareScoringService.js  (the core engine)
scripts/runBulkRefresh.js │            │
scripts/runTrustRecalc.js─┘            ├─▶ imageValidation.service.js   (perceptual hash + dedupe)
                                        ├─▶ postQuality.service.js       (GPT post-quality scoring)
                                        ├─▶ replyQuality.service.js      (GPT reply-quality scoring)
                                        ├─▶ pts.service.js               (eligibility + multipliers)
                                        ├─▶ trustScore.service.js        (anti-farming heuristics)
                                        ├─▶ tierTables.js                (engagement → tier bonus)
                                        ├─▶ roleBoost.service.js         (Discord-role point boost)
                                        └─▶ twitterSearchClient.js       (X API v2 client)

referralService.js  ──▶ referral milestone awards + stats

index.js  ──▶  GET  /api/leaderboard
               GET  /api/memes
               POST /api/memes           (register a meme + compute its hash)
               GET  /api/referrals/:userId/stats
```

Each sweep is a standalone script (`scripts/run*.js`) meant to run on its own schedule — in production this ran as four separate Cloud Run Jobs. `cron/scheduler.js` is included as a single-process equivalent for running it locally or on a small VM with `node-cron`.

### Why perceptual hashing, not exact hashing

Reposted memes are almost never byte-identical — X re-encodes images, and users re-save/re-crop before posting. An MD5/SHA hash would treat every re-upload as a brand-new, unvalidated image. A 16x16 dHash (via `imghash`) plus a bitwise Hamming-distance comparison against known validated memes tolerates that noise while still rejecting genuinely different images — the threshold (`IMAGE_HASH_THRESHOLD`, default 28 bits) is the knob that trades strictness for tolerance.

### Why trust scores instead of a flat point value

A raw "10 points per share" rule is trivially farmable with throwaway accounts. Every award in this system is scaled by a 0-100 trust score (`services/pts.service.js`, `services/trustScore.service.js`) built from account age, tweet count, profile completeness, and a farm-detection penalty — so a fresh sock-puppet account earns close to nothing, and a long-standing, active, well-differentiated account earns full value.

## Running it locally

```bash
npm install
cp .env.example .env
# fill in MONGODB_URI at minimum; TWITTER_BEARER_TOKEN/OPENAI_API_KEY are
# only needed for the live sweeps, not for the seeded demo below.
npm run seed     # loads 20 real GRFTY meme templates + demo users/scores
npm start        # http://localhost:3000
```

Then:

```bash
curl http://localhost:3000/api/leaderboard
curl http://localhost:3000/api/memes
```

To run the actual campaign sweeps against live X/OpenAI credentials:

```bash
npm run discovery      # scan X for new posts, perceptual-hash match, award points
npm run quote-sweep    # find quote-tweets of already-discovered posts
npm run reply-sweep    # score replies, apply pump/dump tagging
npm run bulk-refresh   # top up tier bonuses as posts gain more engagement
node scripts/runTrustRecalc.js   # recompute every user's trust score
```

Or run all of them on a schedule in one process with `npm run cron`.

## What's not here

This is the scoring engine, not the whole platform. Left out on purpose: Twitter OAuth / session auth, the Discord bot itself (this repo only consumes a `discordRoleId → boostPercentage` mapping — see `models/Collections.js`), Cloudinary upload/moderation/OCR pipeline, and the unrelated NFT battle game that lived in the same production monorepo. `POST /api/memes` here is a minimal stand-in for what was a much larger upload/moderation controller in production.

## Meme library

The `docs/` folder is a static GitHub Pages gallery of the 100 base GRFTY meme templates this campaign scored against — see it live at the Pages URL for this repo, or open `docs/index.html` directly.
