const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const Waitlist = require('../models/Waitlist');
const {
    sendWaitlistWelcomeEmail,
    sendWaitlistReleaseEmail
} = require('../utils/emailService');

// Basic shape check; full RFC 5322 is not worth the false negatives here.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Joining is a deliberate human action: keep it cheap but not scriptable.
const subscribeLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: process.env.NODE_ENV === 'test' ? 1000 : 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many signups from this network, please try again later.' }
});

// Release blasts go out with a small fan-out so we never hammer Resend.
const SEND_CONCURRENCY = 5;

const normalizeEmail = (raw) => (typeof raw === 'string' ? raw.trim().toLowerCase() : '');

const isValidEmail = (email) => email.length > 0 && email.length <= 254 && EMAIL_REGEX.test(email);

const isAdminAuthorized = (req) => {
    const configured = process.env.WAITLIST_ADMIN_TOKEN;
    if (!configured) return false;

    const provided =
        req.headers['x-admin-token'] ||
        (req.headers.authorization ? req.headers.authorization.replace(/^Bearer\s+/i, '') : '');
    if (!provided) return false;

    const a = Buffer.from(String(provided));
    const b = Buffer.from(configured);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/**
 * @swagger
 * /api/waitlist:
 *   post:
 *     summary: Join the waitlist (sends a thank-you email immediately)
 *     tags: [Waitlist]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               source:
 *                 type: string
 *     responses:
 *       201:
 *         description: Signup stored and welcome email dispatched
 *       400:
 *         description: Invalid email
 *       429:
 *         description: Rate limited
 */
router.post('/', subscribeLimiter, async (req, res) => {
    try {
        const email = normalizeEmail(req.body?.email);

        if (!isValidEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide a valid email address.'
            });
        }

        const source = typeof req.body?.source === 'string' && req.body.source.trim()
            ? req.body.source.trim().slice(0, 64)
            : 'landing-page';

        let entry;
        let alreadySubscribed = false;

        try {
            entry = await Waitlist.create({ email, source });
        } catch (error) {
            if (error && error.code === 11000) {
                alreadySubscribed = true;
                entry = await Waitlist.findOne({ email });
            } else {
                throw error;
            }
        }

        let emailSent = false;

        if (!alreadySubscribed) {
            try {
                const result = await sendWaitlistWelcomeEmail(email);
                emailSent = !!(result && result.success);
                if (emailSent) {
                    await Waitlist.updateOne({ _id: entry._id }, { $set: { welcomeSentAt: new Date() } });
                }
            } catch (error) {
                // Signup is stored either way; a mail hiccup must not lose the lead.
                console.error('❌ Waitlist welcome email error:', error.message);
            }
        }

        const count = await Waitlist.countDocuments({});

        return res.status(alreadySubscribed ? 200 : 201).json({
            success: true,
            alreadySubscribed,
            emailSent,
            count
        });
    } catch (error) {
        console.error('❌ Waitlist signup error:', error.message);
        return res.status(500).json({ success: false, message: 'Could not save your signup, please try again.' });
    }
});

/**
 * @swagger
 * /api/waitlist/count:
 *   get:
 *     summary: Public number of people on the waitlist
 *     tags: [Waitlist]
 *     responses:
 *       200:
 *         description: Current waitlist size
 */
router.get('/count', async (req, res) => {
    try {
        const count = await Waitlist.countDocuments({});
        return res.status(200).json({ success: true, count });
    } catch (error) {
        console.error('❌ Waitlist count error:', error.message);
        return res.status(500).json({ success: false, message: 'Could not load the waitlist count.' });
    }
});

/**
 * @swagger
 * /api/waitlist/announce:
 *   post:
 *     summary: Send the release email to everyone still waiting (admin only)
 *     tags: [Waitlist]
 *     parameters:
 *       - in: header
 *         name: x-admin-token
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               force:
 *                 type: boolean
 *                 description: Re-send to members already mailed
 *     responses:
 *       200:
 *         description: Blast results
 *       401:
 *         description: Missing or invalid admin token
 *       503:
 *         description: WAITLIST_ADMIN_TOKEN not configured
 */
router.post('/announce', async (req, res) => {
    try {
        if (!process.env.WAITLIST_ADMIN_TOKEN) {
            return res.status(503).json({ success: false, message: 'Release sending is not configured.' });
        }

        if (!isAdminAuthorized(req)) {
            return res.status(401).json({ success: false, message: 'Unauthorized.' });
        }

        const force = req.body?.force === true;

        const query = { status: { $ne: 'unsubscribed' } };
        if (!force) query.releaseSentAt = null;

        const recipients = await Waitlist.find(query).select('email').lean();
        let sent = 0;
        let failed = 0;

        for (let i = 0; i < recipients.length; i += SEND_CONCURRENCY) {
            const batch = recipients.slice(i, i + SEND_CONCURRENCY);
            const results = await Promise.all(batch.map(async (recipient) => {
                try {
                    const result = await sendWaitlistReleaseEmail(recipient.email);
                    return { email: recipient.email, ok: !!(result && result.success) };
                } catch (error) {
                    console.error('❌ Release email error:', error.message);
                    return { email: recipient.email, ok: false };
                }
            }));

            for (const outcome of results) {
                if (outcome.ok) {
                    sent += 1;
                    await Waitlist.updateOne(
                        { email: outcome.email },
                        { $set: { releaseSentAt: new Date(), status: 'released' } }
                    );
                } else {
                    failed += 1;
                }
            }
        }

        return res.status(200).json({
            success: true,
            total: recipients.length,
            sent,
            failed
        });
    } catch (error) {
        console.error('❌ Waitlist announce error:', error.message);
        return res.status(500).json({ success: false, message: 'Release send failed.' });
    }
});

module.exports = router;
