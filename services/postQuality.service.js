// services/postQuality.service.js
const OpenAI = require('openai');
let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

async function scorePostTextQuality(text) {
  if (process.env.FEATURE_POST_TEXT_QUALITY !== 'true') return { quality: 2, reason: 'disabled' };

  const prompt = `Score tweet text quality for a meme-share post on a 1-3 scale.
1=Spammy; 2=Generic; 3=Memetic/on-brand. Respond JSON: {"quality":1|2|3,"reason":"..."}. Text: ${text?.slice(0, 500) || ''}`;

  const resp = await getClient().chat.completions.create({
    model: process.env.OPENAI_SMALL_MODEL || 'gpt-4o-mini',
    temperature: 0.2,
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
  });

  try {
    const data = JSON.parse(resp.choices[0].message.content);
    const q = Number(data.quality);
    if ([1, 2, 3].includes(q)) return { quality: q, reason: String(data.reason || '') };
  } catch {
    // fall through to default below
  }
  return { quality: 2, reason: 'fallback' };
}

function postQualityBonus(mode, q) {
  // Self-post bonus: +0/+1/+2. Shared/creator-reward bonus: +0/+2/+4.
  if (mode === 'self_post') return q === 3 ? 2 : q === 2 ? 1 : 0;
  return q === 3 ? 4 : q === 2 ? 2 : 0;
}

module.exports = { scorePostTextQuality, postQualityBonus };
