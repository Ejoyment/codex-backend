const mongoose = require('mongoose');

const MAX_FAILURES = 5;
const LOCKOUT_MS = 30 * 60 * 1000; // 30 minutes

const authLockoutSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    failures: {
        type: Number,
        default: 0
    },
    lockedUntil: {
        type: Date,
        default: null
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

function normalizeKey(key) {
    return String(key).toLowerCase();
}

// Returns true when the key is currently locked out.
// Cleans up expired lockouts so they do not linger.
async function isLockedOut(key) {
    const record = await AuthLockout.findOne({ key: normalizeKey(key) });
    if (!record || !record.lockedUntil) {
        return false;
    }
    if (Date.now() > new Date(record.lockedUntil).getTime()) {
        await AuthLockout.deleteOne({ _id: record._id });
        return false;
    }
    return true;
}

// Increments the failure count, arms lockedUntil when the max is reached.
// Returns { locked } for the caller's convenience.
async function recordFailure(key) {
    const normalized = normalizeKey(key);
    let record = await AuthLockout.findOne({ key: normalized });
    if (!record) {
        record = new AuthLockout({ key: normalized });
    }
    // A previous lockout has expired: start a fresh count.
    if (record.lockedUntil && Date.now() > new Date(record.lockedUntil).getTime()) {
        record.failures = 0;
        record.lockedUntil = null;
    }
    record.failures += 1;
    if (record.failures >= MAX_FAILURES) {
        record.lockedUntil = new Date(Date.now() + LOCKOUT_MS);
    }
    record.updatedAt = new Date();
    await record.save();
    const locked = !!record.lockedUntil && Date.now() < new Date(record.lockedUntil).getTime();
    return { locked };
}

async function clearLockout(key) {
    await AuthLockout.deleteOne({ key: normalizeKey(key) });
}

const AuthLockout = mongoose.model('AuthLockout', authLockoutSchema);

module.exports = AuthLockout;
module.exports.AuthLockout = AuthLockout;
module.exports.MAX_FAILURES = MAX_FAILURES;
module.exports.LOCKOUT_MS = LOCKOUT_MS;
module.exports.isLockedOut = isLockedOut;
module.exports.recordFailure = recordFailure;
module.exports.clearLockout = clearLockout;
