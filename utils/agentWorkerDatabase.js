const mongoose = require('mongoose');
const mongoOptions = require('../config/mongoOptions');

async function connectWorkerDatabase() {
  if (mongoose.connection.readyState === 1) return;
  if (!process.env.MONGODB_URI) {
    throw new Error('Agent worker cannot start because MONGODB_URI is not configured');
  }
  await mongoose.connect(process.env.MONGODB_URI, mongoOptions);
}

module.exports = { connectWorkerDatabase };
