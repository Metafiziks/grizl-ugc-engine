// utils/rateLimiter.js
class TwitterRateLimiter {
  constructor(limit = 15, windowMs = 15 * 60 * 1000) {
    this.timestamps = [];
    this.limit = limit;
    this.windowMs = windowMs;
  }

  async schedule(fn) {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.limit) {
      const wait = this.windowMs - (now - this.timestamps[0]) + 1000;
      console.log(`[RateLimiter] Waiting ${Math.ceil(wait / 1000)}s...`);
      await new Promise((res) => setTimeout(res, wait));
    }
    this.timestamps.push(Date.now());
    return fn();
  }
}

module.exports = TwitterRateLimiter;
