const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const OTP = require('../models/OTP');
const User = require('../models/User');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/emailServiceResend');
const rateLimit = require('express-rate-limit');
const { isLockedOut: isLockedOutStore, recordFailure, clearLockout: clearLockoutStore } = require('../models/AuthLockout');

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 requests per window
    message: { success: false, message: 'Too many OTP requests, please try again later.' }
});

// Account-level lockout (persisted via AuthLockout model): email -> { failures, lockedUntil }
async function isLockedOut(email) {
    return isLockedOutStore(email);
}

async function recordFailedAttempt(email) {
    await recordFailure(email);
}

async function clearLockout(email) {
    await clearLockoutStore(email);
}

// Generate 6-digit OTP (1,000,000 possibilities — resists brute-force)
const generateOTP = () => {
    return crypto.randomInt(100000, 1000000).toString();
};

// Store/compare only the sha256 hex of the OTP code
function hashOTP(code) {
    return crypto.createHash('sha256').update(String(code)).digest('hex');
}

// Constant-time comparison of hex digests (pads to equal length buffers)
function hashesEqual(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    const len = Math.max(bufA.length, bufB.length);
    const paddedA = Buffer.alloc(len);
    const paddedB = Buffer.alloc(len);
    bufA.copy(paddedA);
    bufB.copy(paddedB);
    const sameLength = bufA.length === bufB.length;
    return crypto.timingSafeEqual(paddedA, paddedB) && sameLength;
}

/**
 * @swagger
 * /api/otp/send:
 *   post:
 *     summary: Send OTP email for verification
 *     tags:
 *       - Email Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@example.com
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       404:
 *         description: User not found
 *       400:
 *         description: Email already verified or rate limit exceeded
 */
// Send OTP
router.post('/send', otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }

        if (typeof email !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check if user exists
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found. Please sign up first.' 
            });
        }

        // Check if already verified
        if (user.isVerified) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already verified' 
            });
        }

        // Delete any existing OTPs for this email
        await OTP.deleteMany({ email: email.toLowerCase() });

        // Generate new OTP
        const otpCode = generateOTP();

        // Save OTP to database (sha256 hash only — never the plaintext code)
        await OTP.create({
            email: email.toLowerCase(),
            otp: hashOTP(otpCode)
        });

        // Send OTP email
        await sendOTPEmail(email, otpCode, user.fullName);

        res.json({
            success: true,
            message: 'OTP sent successfully to your email',
            expiresIn: `${process.env.OTP_EXPIRY_MINUTES || 10} minutes`
        });

    } catch (error) {
        console.error('Send OTP error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error sending OTP',
            error: error.message 
        });
    }
});

/**
 * @swagger
 * /api/otp/verify:
 *   post:
 *     summary: Verify OTP and confirm email
 *     tags:
 *       - Email Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@example.com
 *               otp:
 *                 type: string
 *                 example: "1234"
 *     responses:
 *       200:
 *         description: Email verified successfully
 *       400:
 *         description: Invalid or expired OTP
 *       404:
 *         description: OTP not found
 */
// Verify OTP
router.post('/verify', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email and OTP are required' 
            });
        }

        if (typeof email !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Email and OTP are required'
            });
        }

        // Check account-level lockout
        if (await isLockedOut(email.toLowerCase())) {
            return res.status(429).json({ 
                success: false, 
                message: 'Account locked due to too many failed attempts. Try again in 30 minutes.' 
            });
        }

        // Find the most recent OTP for this email
        const otpRecord = await OTP.findOne({ 
            email: email.toLowerCase(),
            verified: false
        }).sort({ createdAt: -1 });

        if (!otpRecord) {
            return res.status(400).json({ 
                success: false, 
                message: 'OTP expired or not found. Please request a new one.' 
            });
        }

        // Explicit expiry guard (independent of the TTL index)
        if (Date.now() - new Date(otpRecord.createdAt).getTime() > 10 * 60 * 1000) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({
                success: false,
                message: 'OTP expired or not found. Please request a new one.'
            });
        }

        // Check attempts
        if (otpRecord.attempts >= 3) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({ 
                success: false, 
                message: 'Too many failed attempts. Please request a new OTP.' 
            });
        }

        // Verify OTP (constant-time comparison of sha256 hashes)
        if (!hashesEqual(otpRecord.otp, hashOTP(otp))) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            await recordFailedAttempt(email.toLowerCase());
            
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP',
                attemptsLeft: Math.max(0, 3 - otpRecord.attempts)
            });
        }

        // Clear lockout on successful verification
        await clearLockout(email.toLowerCase());

        // Mark OTP as verified
        otpRecord.verified = true;
        await otpRecord.save();

        // Update user verification status
        const user = await User.findOne({ email: email.toLowerCase() });
        if (user) {
            user.isVerified = true;
            await user.save();

            // Send welcome email
            await sendWelcomeEmail(user.email, user.fullName);
        }

        // Clean up - delete the OTP
        await OTP.deleteOne({ _id: otpRecord._id });

        // Generate JWT token for automatic login (24h, same as auth.js)
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            success: true,
            message: 'Email verified successfully!',
            token: token, // Return token for automatic login
            user: {
                email: user.email,
                fullName: user.fullName,
                isVerified: user.isVerified
            }
        });

    } catch (error) {
        console.error('Verify OTP error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error verifying OTP',
            error: error.message 
        });
    }
});

/**
 * @swagger
 * /api/otp/resend:
 *   post:
 *     summary: Resend OTP verification email
 *     tags:
 *       - Email Verification
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 example: john@example.com
 *     responses:
 *       200:
 *         description: New OTP sent successfully
 *       400:
 *         description: Email already verified or rate limit exceeded
 *       404:
 *         description: User not found
 */
// Resend OTP
router.post('/resend', otpLimiter, async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email is required' 
            });
        }

        if (typeof email !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }

        // Check if user exists
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Check if already verified
        if (user.isVerified) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already verified' 
            });
        }

        // Delete existing OTPs
        await OTP.deleteMany({ email: email.toLowerCase() });

        // Generate new OTP
        const otpCode = generateOTP();

        // Save OTP (sha256 hash only — never the plaintext code)
        await OTP.create({
            email: email.toLowerCase(),
            otp: hashOTP(otpCode)
        });

        // Send OTP email
        await sendOTPEmail(email, otpCode, user.fullName);

        res.json({
            success: true,
            message: 'New OTP sent successfully',
            expiresIn: `${process.env.OTP_EXPIRY_MINUTES || 10} minutes`
        });

    } catch (error) {
        console.error('Resend OTP error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error resending OTP',
            error: error.message 
        });
    }
});

module.exports = router;
