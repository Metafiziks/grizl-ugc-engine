// services/fetchTweetsByIdBatch.js
const TwitterRateLimiter = require('../utils/rateLimiter');
const twitterClient = require('./twitterSearchClient');

const rateLimiter = new TwitterRateLimiter();

async function fetchTweetsByIdBatch(tweetIds) {
  const results = {};
  const BATCH_SIZE = 100;

  for (let i = 0; i < tweetIds.length; i += BATCH_SIZE) {
    const batch = tweetIds.slice(i, i + BATCH_SIZE);
    try {
      const response = await rateLimiter.schedule(() => twitterClient.tweetsLookup(batch));
      if (response?.data) {
        for (const tweet of response.data) results[tweet.id] = tweet;
      }
      console.log(`[BatchFetch] Retrieved ${response?.data?.length || 0} tweets in batch ${i / BATCH_SIZE + 1}`);
    } catch (err) {
      console.error(`[BatchFetch] Failed on batch ${i / BATCH_SIZE + 1}:`, err?.message || err);
    }
  }

  return results;
}

module.exports = fetchTweetsByIdBatch;
