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
//
// Atomicity: the count moves via a single upsert ($inc), so concurrent
// failures can neither double-create (E11000 crash, lockout never arms) nor
// lose increments (read-modify-write race delaying the lockout). A residual
// duplicate-key on concurrent upsert-inserts retries once.
async function recordFailure(key) {
    const normalized = normalizeKey(key);
    let record;
    try {
        record = await AuthLockout.findOneAndUpdate(
            { key: normalized },
            {
                $inc: { failures: 1 },
                $set: { updatedAt: new Date() },
                $setOnInsert: { lockedUntil: null },
            },
            { upsert: true, new: true }
        );
    } catch (error) {
        if (error.code !== 11000) throw error;
        record = await AuthLockout.findOneAndUpdate(
            { key: normalized },
            { $inc: { failures: 1 }, $set: { updatedAt: new Date() } },
            { upsert: true, new: true }
        );
    }
    // A previous lockout has expired: start a fresh count.
    if (record.lockedUntil && Date.now() > new Date(record.lockedUntil).getTime()) {
        record.failures = 1;
        record.lockedUntil = null;
    }
    if (record.failures >= MAX_FAILURES && !record.lockedUntil) {
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
