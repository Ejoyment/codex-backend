/**
 * Single source of truth for the boot-time MongoDB connection.
 *
 * server.js starts the initial connection at module load so it overlaps route
 * and model compilation. startServer() must not create indexes until that
 * connection is actually open: calling mongoose.connect() a second time while
 * the first is still connecting returns immediately (openUri() short-circuits
 * on readyState === connecting), so an awaited promise can resolve while the
 * driver is still dialing. With bufferCommands disabled, createIndex() then
 * throws "Cannot call ...createIndex() before initial connection is complete".
 *
 * ensureConnected() awaits the in-flight promise, retries once if that first
 * attempt failed, and refuses to return unless the connection is open.
 */
const mongoose = require('mongoose');
const mongooseOptions = require('../config/mongoOptions');

let initialConnection = null;

/**
 * Kick off (or return) the module-level initial connection. Safe to call more
 * than once: concurrent callers share the same promise.
 */
function startInitialConnection() {
    if (!initialConnection) {
        initialConnection = mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
    }
    return initialConnection;
}

/**
 * Resolve only when mongoose.connection.readyState === 1.
 *
 * If the initial connection is still in flight, wait for it. If it already
 * failed, retry once. Any failure of the retry propagates to the caller so
 * startServer() can fail fast instead of serving traffic without a database.
 */
async function ensureConnected() {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    if (initialConnection) {
        try {
            await initialConnection;
        } catch (error) {
            // The initial attempt's error is already logged by server.js.
            // Fall through to the retry below if the connection is still down.
        }
    }

    if (mongoose.connection.readyState !== 1) {
        initialConnection = mongoose.connect(process.env.MONGODB_URI, mongooseOptions);
        await initialConnection;
    }

    if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB connection is not ready — refusing to create indexes or serve traffic.');
    }

    return mongoose.connection;
}

module.exports = { startInitialConnection, ensureConnected };
