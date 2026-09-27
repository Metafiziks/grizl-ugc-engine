const mongoose = require('mongoose');

const TextQualitySchema = new mongoose.Schema(
  {
    quality: { type: Number, default: 0 },
    reason: { type: String, default: '' },
    appliedAt: { type: Date, default: null },
  },
  { _id: false }
);

const MemeshareScoreSchema = new mongoose.Schema(
  {
    // Primary post identifiers
    twitterPostId: { type: String, index: true },
    conversationId: { type: String, index: true },
    originalTwitterPostId: { type: String, default: null },

    // Meme linkage
    memeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meme', index: true, default: null },
    memeCreatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },
    shareActorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true, default: null },

    platform: { type: String, enum: ['x'], default: 'x', index: true },
    postText: { type: String, default: '' },
    tweetText: { type: String, default: '' },

    // 'self_post'                = poster shared an original meme post
    // 'shared_post_creator_reward' = someone else quote-shared it, creator gets a cut
    mode: {
      type: String,
      enum: ['self_post', 'shared_post_creator_reward'],
      required: true,
      index: true,
    },

    // Discovery metadata (perceptual-hash match result)
    imageMatch: {
      matched: { type: Boolean, default: false },
      distance: { type: Number, default: null },
      threshold: { type: Number, default: null },
      matchedMemeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meme', default: null },
    },

    // Creator reward + tier bonuses
    ptsSharerMultiplier: { type: Number, default: 1 },
    creatorBaseAward: { type: Number, default: 0 },
    bonusAwardedSoFar: { type: Number, default: 0 },
    highestTierAwarded: { type: Number, default: null },

    // GPT-based post quality scoring
    textQuality: { type: TextQualitySchema, default: undefined },
  },
  { timestamps: true }
);

MemeshareScoreSchema.index(
  { twitterPostId: 1, mode: 1 },
  { unique: true, partialFilterExpression: { mode: 'self_post' } }
);
MemeshareScoreSchema.index({ originalTwitterPostId: 1 });
MemeshareScoreSchema.index({ createdAt: -1 });

module.exports = mongoose.models.MemeshareScore || mongoose.model('MemeshareScore', MemeshareScoreSchema);
