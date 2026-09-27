// controllers/memes.controller.js
const Meme = require('../models/Meme');
const MemeshareScore = require('../models/MemeshareScore');
const { generatePerceptualHash } = require('../services/imageValidation.service');

async function listMemes(req, res) {
  const { status } = req.query;
  const query = {};
  if (status) query.validationStatus = status;

  const memes = await Meme.find(query).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ memes, total: memes.length });
}

async function getMemeShareStats(req, res) {
  const { id } = req.params;
  const rows = await MemeshareScore.find({ memeId: id }).sort({ createdAt: -1 }).limit(50).lean();

  const totalShares = rows.filter((r) => r.mode === 'self_post').length;
  const totalCreatorAward = rows.reduce((sum, r) => sum + (r.creatorBaseAward || 0), 0);

  res.json({ memeId: id, totalShares, totalCreatorAward, recent: rows });
}

// Registers a new meme by URL and computes its perceptual hash so future
// discovery sweeps can match reposts of it. A real upload pipeline would also
// handle direct file uploads, moderation, and CDN storage — out of scope here.
async function registerMeme(req, res) {
  try {
    const { imageUrl, caption, userId } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'imageUrl is required' });

    const response = await fetch(imageUrl);
    if (!response.ok) return res.status(400).json({ error: `Could not download imageUrl (${response.status})` });
    const buf = Buffer.from(await response.arrayBuffer());

    const imageHash = await generatePerceptualHash(buf);
    const meme = await Meme.create({ userId, imageUrl, caption, imageHash, validationStatus: 'validated' });

    res.status(201).json({ meme });
  } catch (error) {
    console.error('[registerMeme] error:', error?.message || error);
    res.status(500).json({ error: 'Failed to register meme' });
  }
}

module.exports = { listMemes, getMemeShareStats, registerMeme };
