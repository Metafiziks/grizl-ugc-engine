// models/User.js
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, index: true },
    profilePic: { type: String, default: '' },
    bio: { type: String, default: '' },
    avatarHash: { type: String, default: null },

    // --- X (Twitter) integration ---
    twitterUserId: { type: String, unique: true, sparse: true, index: true },
    twitterProfileData: { type: Object, default: {} },

    // --- Discord community layer ---
    // IDs of Discord roles the user holds; matched against Collection.discordRoleId
    // to look up a point-boost multiplier (see services/roleBoost.service.js).
    discordRoles: [{ type: String }],

    // --- Trust / anti-farming score (services/trustScore.service.js) ---
    trust: {
      pts: { type: Number, default: 0 },
      pLegit: { type: Number, default: 0 },
      farmScore: { type: Number, default: 0 },
      updatedAt: { type: Date, default: null },
    },

    // --- Referrals (services/referralService.js) ---
    referralCode: { type: String, unique: true, sparse: true, index: true },
    referrerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referralPoints: { type: Number, default: 0 },

    isAdmin: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
