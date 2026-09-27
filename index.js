// index.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { connect } = require('./db');

const leaderboardRoutes = require('./routes/leaderboard.routes');
const memesRoutes = require('./routes/memes.routes');
const referralsRoutes = require('./routes/referrals.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/memes', memesRoutes);
app.use('/api/referrals', referralsRoutes);

const PORT = process.env.PORT || 3000;

connect()
  .then(() => {
    app.listen(PORT, () => console.log(`[Server] listening on :${PORT}`));
  })
  .catch((err) => {
    console.error('[Server] failed to connect to DB:', err.message);
    process.exit(1);
  });
