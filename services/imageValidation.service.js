// services/imageValidation.service.js
// Perceptual hashing + Hamming-distance dedupe for meme images/gifs/video frames.
const crypto = require('crypto');
const imghash = require('imghash');
const sharp = require('sharp');
const { Readable } = require('stream');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

// Detect if a buffer is a GIF (GIF87a / GIF89a)
function isGifFile(buf) {
  if (!buf || buf.length < 6) return false;
  const sig = buf.slice(0, 6).toString('ascii');
  return sig === 'GIF87a' || sig === 'GIF89a';
}

// Extract the first frame of a GIF as a PNG buffer (for stable hashing)
async function extractGifFirstFrame(buf) {
  return sharp(buf, { animated: true }).extractFrame(0).png().toBuffer();
}

// Perceptual hash on a buffer (16x16 dHash, hex-encoded)
async function generatePerceptualHash(imageBuffer) {
  try {
    const src = isGifFile(imageBuffer) ? await extractGifFirstFrame(imageBuffer) : imageBuffer;
    return await imghash.hash(src, 16, 'hex');
  } catch (err) {
    // Last-resort fallback so a single bad image never crashes a whole sweep.
    return crypto.createHash('md5').update(imageBuffer).digest('hex');
  }
}

// Bitwise Hamming distance between two same-length hex hashes.
function hammingDistance(hex1, hex2) {
  if (!hex1 || !hex2 || hex1.length !== hex2.length) return Infinity;
  let dist = 0;
  for (let i = 0; i < hex1.length; i++) {
    const x = parseInt(hex1[i], 16) ^ parseInt(hex2[i], 16);
    dist += (x & 1) + ((x >> 1) & 1) + ((x >> 2) & 1) + ((x >> 3) & 1);
  }
  return dist;
}

function normalizeCloudinaryUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname.includes('cloudinary.com') && !u.pathname.endsWith('.mp4')) {
      u.pathname += '.mp4';
    }
    return u.toString();
  } catch {
    return url;
  }
}

// Extract one mid-frame from a video URL (used for video posts on X).
async function extractMidFrame(videoUrl) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    ffmpeg(videoUrl)
      .inputOptions('-t 1')
      .noAudio()
      .outputOptions(['-vf', 'thumbnail,scale=256:-1'])
      .frames(1)
      .format('image2pipe')
      .on('error', (err) => reject(new Error(`FFMPEG failed to extract frame: ${err.message}`)))
      .on('end', () => resolve(Buffer.concat(chunks)))
      .pipe()
      .on('data', (d) => chunks.push(d));
  });
}

async function generatePerceptualHashFromVideo(videoUrl) {
  const frame = await extractMidFrame(normalizeCloudinaryUrl(videoUrl));
  return generatePerceptualHash(frame);
}

// Same as above, but for an in-memory upload buffer instead of a URL.
async function extractMidFrameFromBuffer(videoBuffer) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const bufferStream = new Readable();
    bufferStream.push(videoBuffer);
    bufferStream.push(null);

    ffmpeg(bufferStream)
      .inputOptions(['-f', 'mp4', '-t', '1'])
      .noAudio()
      .outputOptions(['-vf', 'select=eq(n\\,0),scale=640:-1', '-frames:v', '1'])
      .format('image2pipe')
      .outputFormat('mjpeg')
      .on('error', (err) => reject(new Error(`FFMPEG failed to extract frame from buffer: ${err.message}`)))
      .on('end', () => {
        const frameBuffer = Buffer.concat(chunks);
        if (frameBuffer.length === 0) reject(new Error('No frame data extracted'));
        else resolve(frameBuffer);
      })
      .pipe()
      .on('data', (chunk) => chunks.push(chunk));
  });
}

async function generatePerceptualHashFromVideoBuffer(videoBuffer) {
  const frame = await extractMidFrameFromBuffer(videoBuffer);
  return generatePerceptualHash(frame);
}

module.exports = {
  isGifFile,
  extractGifFirstFrame,
  generatePerceptualHash,
  hammingDistance,
  generatePerceptualHashFromVideo,
  generatePerceptualHashFromVideoBuffer,
  extractMidFrameFromBuffer,
};
