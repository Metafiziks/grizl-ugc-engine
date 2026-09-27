// services/replyQuality.service.js
// GPT-based classifier for reply quality — distinguishes substantive engagement
// from low-effort/spammy replies so the interaction-scoring pipeline can weight
// them accordingly (see docs on the reply sweep in memeShareScoringService.js).
const OpenAI = require('openai');
let openai;
function getClient() {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openai;
}

async function analyzeTweetReply(tweetReply) {
  const completion = await getClient().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are an AI assistant that analyzes Twitter replies and classifies them into quality categories.

Classification Rules:
1. SPAMMY (quality: 1): Contains emojis OR is very short (3 words or fewer) OR is generic/low-effort
2. GENERIC (quality: 2): Normal, coherent reply that adds some value but isn't particularly creative or engaging
3. MEMETIC (quality: 3): Creative, witty, engaging, or adds significant value to the conversation. Shows creativity, humor, or deep engagement

Always respond strictly as a valid JSON object.`,
      },
      {
        role: 'user',
        content: `Analyze the following Twitter reply and return a JSON object with:
{
  "containsEmoji": boolean,
  "isShortReply": boolean,
  "isSpammy": boolean,
  "replyQuality": number (1=spammy, 2=generic, 3=memetic),
  "reasoning": string
}

Reply text: "${tweetReply}"`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(completion.choices[0].message.content);
}

module.exports = { analyzeTweetReply };
