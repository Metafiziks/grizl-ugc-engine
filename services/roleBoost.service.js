/**
 * Role Boost Service
 *
 * Calculates Discord role-based point-boost multipliers for users.
 *
 * Rules:
 * - Users can have multiple Discord roles.
 * - Only the HIGHEST boost applies (no stacking).
 * - Boost applies AFTER all other multipliers (PTS, tier bonus, etc).
 * - Boost applies to all point earnings (shares, interactions, creator rewards).
 */
const Collection = require('../models/Collections');

let collectionsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function refreshCollectionsCache() {
  try {
    const collections = await Collection.find({ isActive: true }).select('discordRoleId boostPercentage').lean();
    collectionsCache = new Map(collections.map((c) => [c.discordRoleId, c.boostPercentage]));
    cacheTimestamp = Date.now();
  } catch (error) {
    console.error('[RoleBoost] Failed to refresh cache:', error.message);
    collectionsCache = new Map();
  }
}

async function getHighestRoleBoost(userDiscordRoleIds) {
  if (!collectionsCache || Date.now() - cacheTimestamp > CACHE_TTL) {
    await refreshCollectionsCache();
  }
  if (!Array.isArray(userDiscordRoleIds) || userDiscordRoleIds.length === 0) return 0;

  let highestBoost = 0;
  for (const roleId of userDiscordRoleIds) {
    const boost = collectionsCache.get(roleId);
    if (boost !== undefined && boost > highestBoost) highestBoost = boost;
  }
  return highestBoost;
}

function applyRoleBoost(points, boostPercentage) {
  if (!boostPercentage) return points;
  return Math.round(points * (1 + boostPercentage / 100) * 100) / 100;
}

async function getUserRoleBoost(user) {
  if (!user) return 0;
  if (Array.isArray(user.discordRoles)) return getHighestRoleBoost(user.discordRoles);

  const User = require('../models/User');
  const fullUser = await User.findById(user._id || user).select('discordRoles').lean();
  if (!fullUser?.discordRoles) return 0;
  return getHighestRoleBoost(fullUser.discordRoles);
}

async function forceRefreshCache() {
  await refreshCollectionsCache();
}

module.exports = { getHighestRoleBoost, applyRoleBoost, getUserRoleBoost, forceRefreshCache };
