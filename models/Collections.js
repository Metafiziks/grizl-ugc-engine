// models/Collections.js
// Maps a Discord role to a point-boost percentage. Populated by whatever syncs
// your Discord server's roles (bot, manual admin panel, etc.) — this repo
// doesn't ship a Discord bot, just the scoring side of the integration.
const mongoose = require('mongoose');

const collectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    discordRoleId: { type: String, required: true, unique: true, trim: true },
    boostPercentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

collectionSchema.index({ discordRoleId: 1, isActive: 1 });

module.exports = mongoose.models.Collection || mongoose.model('Collection', collectionSchema);
