const mongoose = require('mongoose');

const memeSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  imageUrl: { type: String, required: true },
  caption: { type: String },
  mediaType: { type: String, enum: ['image', 'gif', 'video'], default: 'image' },
  thumbnailUrl: { type: String, default: null },

  isApproved: { type: Boolean, default: false },

  // Perceptual hash used to catch reposts/reuploads of the same base meme.
  // Nulls are allowed and excluded from the uniqueness constraint below.
  imageHash: { type: String, default: undefined },

  validationStatus: {
    type: String,
    enum: ['pending', 'validated', 'rejected'],
    default: 'pending',
  },

  rarityTier: {
    type: String,
    enum: ['KINDA_GRFTY', 'VERY_GRFTY', 'XTRA_GRFTY', 'SUPER_GRFTY', 'MEGA_GRFTY'],
    default: null,
  },

  createdAt: { type: Date, default: Date.now },
});

// Infer mediaType for older docs if missing
memeSchema.pre('save', function (next) {
  if (!this.mediaType && typeof this.imageUrl === 'string') {
    const u = this.imageUrl.toLowerCase();
    if (u.includes('.mp4')) this.mediaType = 'video';
    else if (u.includes('.gif')) this.mediaType = 'gif';
    else this.mediaType = 'image';
  }
  next();
});

memeSchema.index(
  { imageHash: 1 },
  { unique: true, partialFilterExpression: { imageHash: { $exists: true } } }
);

module.exports = mongoose.models.Meme || mongoose.model('Meme', memeSchema);
