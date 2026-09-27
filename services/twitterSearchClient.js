// services/twitterSearchClient.js
// Thin wrapper over X (Twitter) API v2 recent-search + tweet-lookup endpoints.
// Uses the Node 18+ global `fetch` — no extra HTTP dependency required.
const BASE = 'https://api.twitter.com/2';

function authHeaders() {
  if (!process.env.TWITTER_BEARER_TOKEN) throw new Error('Missing TWITTER_BEARER_TOKEN');
  return { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`, 'Content-Type': 'application/json' };
}

async function recentSearch({ query, max_results = 100, next_token = null, expansions, 'tweet.fields': tweetFields, 'user.fields': userFields, 'media.fields': mediaFields, start_time }) {
  const params = new URLSearchParams({
    query,
    max_results: String(max_results),
    'tweet.fields': (tweetFields || ['public_metrics', 'created_at', 'author_id', 'conversation_id', 'referenced_tweets']).join(','),
    expansions: (expansions || ['author_id', 'attachments.media_keys', 'referenced_tweets.id']).join(','),
    'user.fields': (userFields || ['id', 'username', 'verified', 'public_metrics', 'created_at']).join(','),
    'media.fields': (mediaFields || ['url', 'preview_image_url', 'width', 'height', 'type']).join(','),
  });
  if (next_token) params.set('next_token', next_token);
  if (start_time) params.set('start_time', start_time);

  const url = `${BASE}/tweets/search/recent?${params.toString()}`;
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(`recentSearch ${r.status} ${await r.text()}`);
  return r.json();
}

async function tweetsLookup(ids, extraOptions = {}) {
  const params = new URLSearchParams({
    ids: ids.join(','),
    'tweet.fields': (extraOptions['tweet.fields'] || ['public_metrics', 'created_at', 'author_id', 'conversation_id']).join(','),
  });
  if (extraOptions.expansions) params.set('expansions', extraOptions.expansions.join(','));

  const url = `${BASE}/tweets?${params.toString()}`;
  const r = await fetch(url, { headers: authHeaders() });
  if (!r.ok) throw new Error(`tweetsLookup ${r.status} ${await r.text()}`);
  return r.json();
}

module.exports = { recentSearch, tweetsLookup };
