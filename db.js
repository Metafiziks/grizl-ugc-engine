// db.js
require('dotenv').config();
const mongoose = require('mongoose');

mongoose.set('strictQuery', false);

async function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  const dbName = process.env.MONGODB_DB_NAME || 'grizl_ugc_demo';
  await mongoose.connect(uri, { dbName });
  console.log('[DB] Connected');
}

async function disconnect() {
  await mongoose.connection.close();
  console.log('[DB] Disconnected');
}

module.exports = { connect, disconnect, mongoose };
