const mongoose = require('mongoose');

const UserActionSchema = new mongoose.Schema(
  {
    platform: { type: String, enum: ['x'], default: 'x', index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },

    memeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Meme', index: true },

    actionType: {
      type: String,
      enum: ['upload', 'share', 'reply', 'pump', 'dump', 'referral_bonus'],
      required: true,
    },

    // Idempotency key so a sweep can safely re-run without double-awarding points.
    actionKey: { type: String, unique: true, sparse: true },

    // Points minted for this action.
    pointsApplied: { type: Number, default: 0 },
    deltaApplied: { type: Number, default: 0, index: true },

    replyQuality: { type: Number, default: 0 },
    metadata: { type: Object, default: undefined },

    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

UserActionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.UserAction || mongoose.model('UserAction', UserActionSchema);
