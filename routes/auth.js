const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const Company = require('../models/Company');
const Invitation = require('../models/Invitation');
const Integration = require('../models/Integration');
const rateLimit = require('express-rate-limit');
const emailService = require('../utils/emailServiceResend');
const {
    authenticateToken,
    invalidateLivenessEverywhere,
    normalizeTokenVersion
} = require('../middleware/auth');
const { isLockedOut, recordFailure, clearLockout } = require('../models/AuthLockout');
const { createTrialSubscription, getOrCreateSubscription } = require('../middleware/trial');
const {
    saveProfilePicture,
    deleteProfilePicture,
    deleteProfilePicturesForUser,
} = require('../utils/profilePictureStorage');
const { sendInternalError } = require('../utils/httpErrors');
const { enqueueEmailJob } = require('../utils/emailJobWorker');

// Keep uploads in memory so the storage helper can choose R2 or the local
// uploads directory (tests/development) without changing the route.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: function (req, file, cb) {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'));
        }
    }
});

// Rate limiting
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    store: require('../utils/redis').getRateLimitStore('auth'),
    passOnStoreError: true,
    message: { success: false, message: 'Too many attempts, please try again later.' }
});

// Stricter rate limit for OAuth initiation (prevent redirect loops/abuse)
const oauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 OAuth initiations per window
    store: require('../utils/redis').getRateLimitStore('oauth'),
    passOnStoreError: true,
    message: { success: false, message: 'Too many OAuth attempts. Please try again later.' }
});

// Generate JWT token. tokenVersion lets logout-all / password changes / bans
// invalidate tokens that were issued before the bump.
const generateToken = (userId, tokenVersion = 0) => {
    return jwt.sign(
        { userId, tokenVersion: normalizeTokenVersion(tokenVersion) },
        process.env.JWT_SECRET,
        { expiresIn: '24h' }
    );
};

/**
 * @swagger
 * /api/auth/signup:
 *   post:
 *     summary: Create a new user account
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: SecurePassword123
 *     responses:
 *       201:
 *         description: Account created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 userId:
 *                   type: string
 *       400:
 *         description: Invalid input or email already exists
 */
// Sign Up
router.post('/signup', authLimiter, async (req, res) => {
    try {
        const { fullName, email, password } = req.body;

        // Validation
        if (!fullName || !email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide all required fields' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email already registered' 
            });
        }

        // Create user (password will be hashed by pre-save hook)
        const user = await User.create({
            fullName,
            email: email.toLowerCase(),
            password,
            authProvider: 'local'
        });

        // Create default subscription (14-day free trial on the pro tier)
        const subscription = createTrialSubscription(user._id);
        await subscription.save();
        user.subscription = subscription._id;
        await user.save();
        const trialEndsAt = subscription.trialEndsAt;

        // Persist an email job so delivery never holds the signup request open.
        try {
            await enqueueEmailJob(
                'trial_welcome',
                `trial-welcome:${user._id}`,
                { email: user.email, fullName: user.fullName, trialEndsAt }
            );
        } catch (queueError) {
            console.error('Trial welcome email queue error:', queueError.message);
        }

        res.status(201).json({
            success: true,
            message: 'Account created successfully. Please verify your email.',
            userId: user._id,
            email: user.email,
            trial: {
                tier: subscription.tier,
                trialEndsAt: subscription.trialEndsAt,
                daysLeft: 14
            }
        });

    } catch (error) {
        console.error('Signup error:', error);
        return sendInternalError(req, res, error, { message: 'Error creating account' });
    }
});

/**
 * @swagger
 * /api/auth/signin:
 *   post:
 *     summary: Login with email and password
 *     tags:
 *       - Authentication
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
 *               password:
 *                 type: string
 *                 example: SecurePassword123
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 */
// Sign In
router.post('/signin', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        // Validation
        if (!email || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide email and password' 
            });
        }

        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }

        // Per-account lockout (persisted): reject before password comparison
        if (await isLockedOut(email.toLowerCase())) {
            return res.status(429).json({
                success: false,
                message: 'Account locked due to too many failed attempts. Try again in 30 minutes.',
                requiresVerification: false
            });
        }

        // Check if user signed up with social auth
        if (!user.password) {
            return res.status(400).json({ 
                success: false, 
                message: `This account uses ${user.authProvider} sign-in. Please use ${user.authProvider} to log in.` 
            });
        }

        // Verify password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            await recordFailure(email.toLowerCase());
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid email or password' 
            });
        }

        // Check if email is verified
        if (!user.isVerified) {
            return res.status(403).json({ 
                success: false, 
                message: 'Please verify your email before signing in',
                requiresVerification: true,
                email: user.email
            });
        }

        // Clear per-account lockout on successful signin
        await clearLockout(email.toLowerCase());

        // Update last login
        user.lastLogin = new Date();
        await user.save();
        const subscription = await getOrCreateSubscription(user._id);

        // Generate token
        const token = generateToken(user._id, user.tokenVersion);

        const { addAuditLog } = require('../utils/auditLogService');
        addAuditLog({
            companyId: user.company?.toString(),
            actorId: user._id,
            email: user.email,
            event: 'auth.signin',
            category: 'auth',
            target: user.email,
            details: { method: 'password' },
            req
        });

        res.json({
            success: true,
            message: 'Sign in successful',
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                profilePicture: user.profilePicture,
                authProvider: user.authProvider,
                role: user.role,
                onboardingCompleted: user.onboardingCompleted,
                subscription: {
                    tier: subscription.tier,
                    status: subscription.status,
                    trialEndsAt: subscription.trialEndsAt,
                    daysLeft: subscription.status === 'trial' ? subscription.getTrialDaysLeft() : 0,
                }
            }
        });

    } catch (error) {
        console.error('Signin error:', error);
        return sendInternalError(req, res, error, { message: 'Error signing in' });
    }
});

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Initiate Google OAuth login
 *     tags:
 *       - Authentication
 *     description: Redirects the user to Google for OAuth authentication
 *     responses:
 *       302:
 *         description: Redirect to Google OAuth
 */
// Google OAuth
router.get('/google', oauthLimiter,
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Google OAuth callback
 *     tags:
 *       - Authentication
 *     description: Handles the callback from Google OAuth and redirects with JWT token
 *     parameters:
 *       - name: code
 *         in: query
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirect to frontend with token
 */
router.get('/google/callback',
    passport.authenticate('google', {
        failureRedirect: `${String(process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '')}/sign_in?error=google`,
    }),
    (req, res) => {
        // Generate token
        const token = generateToken(req.user._id, req.user.tokenVersion);
        
        // Set httpOnly cookie for security (token not visible in JS/browser history)
        res.cookie('auth_token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours (matches JWT lifetime)
        });

        // Redirect with token in fragment (not query) — fragment is not sent to server in referrers
        // Also pass in query for backwards compatibility with existing frontends
        res.redirect(`${process.env.FRONTEND_URL}/auth-success#token=${token}&provider=google`);
    }
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Get current authenticated user profile
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 user:
 *                   $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized - no token or invalid token
 *       404:
 *         description: User not found
 */
// Get current user (protected route)
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Get user's subscription
        const subscription = await getOrCreateSubscription(userId);

        // Handle trial expiry: auto-downgrade to developer (free) if trial expired
        if (subscription && subscription.isTrialExpired && subscription.isTrialExpired()) {
            const previousTier = subscription.tier;
            subscription.status = 'expired';
            subscription.upgradeTo('developer');
            await subscription.save();

            // Send trial expired email notification
            try {
                await emailService.sendTrialExpiredEmail(user.email, user.fullName);
                console.log(`Trial expired email sent to user ${userId}`);
            } catch (emailError) {
                console.error('Trial expired email error:', emailError);
            }

            console.log(`User ${userId} trial expired, downgraded from ${previousTier} to developer`);
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                profilePicture: user.profilePicture,
                authProvider: user.authProvider,
                isVerified: user.isVerified,
                role: user.role,
                company: user.company,
                teamSize: user.teamSize,
                onboardingCompleted: user.onboardingCompleted,
                subscription: subscription ? {
                    tier: subscription.tier,
                    status: subscription.status,
                    features: (() => {
                        const f = subscription.features || {};
                        return {
                            maxProjects: f.maxProjects,
                            basicAiAssistance: f.basicAiAssistance,
                            communitySupport: f.communitySupport,
                            limitedApiAccess: f.limitedApiAccess,
                            supportResponseHours: f.supportResponseHours,
                            advancedAiAssistance: f.advancedAiAssistance,
                            fullApiAccess: f.fullApiAccess,
                            teamCollaboration: f.teamCollaboration,
                            unlimitedProjects: f.unlimitedProjects
                        };
                    })(),
                    trial: subscription.status === 'trial' ? {
                        trialStartedAt: subscription.trialStartedAt,
                        trialEndsAt: subscription.trialEndsAt,
                        daysLeft: subscription.trialEndsAt ? Math.max(0, Math.ceil((subscription.trialEndsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0,
                        isLastDay: subscription.isLastTrialDay ? subscription.isLastTrialDay() : false
                    } : null
                } : null,
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        console.error('Get /me error:', error);
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ 
                success: false, 
                message: 'Invalid token' 
            });
        }
        res.status(500).json({ 
            success: false, 
            message: 'Error fetching user' 
        });
    }
});

/**
 * @swagger
 * /api/auth/upload-photo:
 *   post:
 *     summary: Upload user profile photo
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               profilePhoto:
 *                 type: string
 *                 format: binary
 *                 description: Image file (JPEG, PNG, GIF, WebP - max 5MB)
 *     responses:
 *       200:
 *         description: Profile photo updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 profilePicture:
 *                   type: string
 *       400:
 *         description: No file uploaded
 *       401:
 *         description: Unauthorized
 */
// Upload profile photo
router.post('/upload-photo', authenticateToken, upload.single('profilePhoto'), async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        if (!req.file) {
            return res.status(400).json({ 
                success: false, 
                message: 'No file uploaded' 
            });
        }

        const previousPicture = user.profilePicture;
        const stored = await saveProfilePicture(req.file, req.userId);
        user.profilePicture = stored.url;
        await user.save();
        if (previousPicture) {
            try {
                await deleteProfilePicture(previousPicture);
            } catch (cleanupError) {
                console.error('Profile photo cleanup failed:', cleanupError.message);
            }
        }

        res.json({
            success: true,
            message: 'Profile photo updated successfully',
            profilePicture: user.profilePicture
        });

    } catch (error) {
        console.error('Upload photo error:', error);
        return sendInternalError(req, res, error, { message: 'Error uploading photo' });
    }
});

/**
 * @swagger
 * /api/auth/update-profile:
 *   put:
 *     summary: Update user profile
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               emailNotifications:
 *                 type: boolean
 *               systemPush:
 *                 type: boolean
 *               twoFactorAuth:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Profile updated successfully
 *       401:
 *         description: Unauthorized
 */
// Update profile
router.put('/update-profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const { fullName, emailNotifications, systemPush, twoFactorAuth } = req.body;

        if (fullName) {
            user.fullName = fullName;
        }

        // Store preferences (you can add these fields to User model if needed)
        // For now, we'll just update the name
        await user.save();

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                profilePicture: user.profilePicture
            }
        });

    } catch (error) {
        console.error('Update profile error:', error);
        return sendInternalError(req, res, error, { message: 'Error updating profile' });
    }
});

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Change user password
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *                 example: OldPassword123
 *               newPassword:
 *                 type: string
 *                 example: NewPassword456
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Not available for social login accounts
 *       401:
 *         description: Current password incorrect
 */
// Change password
router.post('/change-password', authLimiter, authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Check if user uses local authentication
        if (user.authProvider !== 'local') {
            return res.status(400).json({ 
                success: false, 
                message: 'Password change is not available for social login accounts' 
            });
        }

        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                success: false, 
                message: 'Please provide current and new password' 
            });
        }

        if (typeof newPassword !== 'string' || newPassword.length < 8) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters long'
            });
        }

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Current password is incorrect' 
            });
        }

        // Update password (will be hashed by pre-save hook) and revoke every
        // session issued under the previous password, including this one.
        user.password = newPassword;
        user.tokenVersion = normalizeTokenVersion(user.tokenVersion) + 1;
        await user.save();
        await invalidateLivenessEverywhere(user._id);

        res.json({
            success: true,
            message: 'Password changed successfully. Please sign in again.'
        });

    } catch (error) {
        console.error('Change password error:', error);
        return sendInternalError(req, res, error, { message: 'Error changing password' });
    }
});

/**
 * @swagger
 * /api/auth/logout-all:
 *   post:
 *     summary: Sign out of every session
 *     description: Increments the account tokenVersion, invalidating every JWT issued before this call (including the caller's current token).
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All sessions revoked
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
// Logout all sessions. Ordinary stateless sign-out is client-side only; this
// endpoint is the explicit "sign out everywhere" action.
router.post('/logout-all', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        user.tokenVersion = normalizeTokenVersion(user.tokenVersion) + 1;
        await user.save();
        await invalidateLivenessEverywhere(user._id);

        res.json({
            success: true,
            message: 'All sessions have been signed out'
        });

    } catch (error) {
        console.error('Logout all error:', error);
        return sendInternalError(req, res, error, { message: 'Error signing out all sessions' });
    }
});

/**
 * @swagger
 * /api/auth/delete-account:
 *   delete:
 *     summary: Delete user account permanently
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
// Delete account — removes the user and everything owned by the account.
// Integration data (Integration connections + IntegrationData synced content such as
// GitHub repos) is explicitly preserved.
router.delete('/delete-account', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!req.body || req.body.confirm !== 'DELETE') {
            return res.status(400).json({
                success: false,
                message: "Confirmation required: send { confirm: 'DELETE' } to permanently delete this account"
            });
        }

        const userId = user._id;
        const deleted = {};
        const count = (name, n) => {
            if (typeof n === 'number' && n > 0) deleted[name] = n;
        };
        const track = (name, result) => {
            if (!result) return;
            if (typeof result === 'number') return count(name, result);
            count(name, result.deletedCount ?? result.modifiedCount ?? 0);
        };
        const withRetry = async (fn) => {
            let lastError;
            for (let attempt = 0; attempt < 3; attempt += 1) {
                try {
                    return await fn();
                } catch (err) {
                    lastError = err;
                    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 25 * 2 ** attempt));
                }
            }
            throw lastError;
        };
        const safely = async (label, fn) => {
            try {
                return await withRetry(fn);
            } catch (err) {
                console.error(`Delete account — ${label} failed:`, err.message);
                return null;
            }
        };

        // Profile photos: current object plus any orphaned objects for this
        // user (R2 prefixes by user id; local legacy URLs are handled too).
        try {
            if (user.profilePicture) await deleteProfilePicture(user.profilePicture);
            await deleteProfilePicturesForUser(userId);
        } catch (err) {
            console.error('Delete account — photo removal failed:', err.message);
        }

        // Every account-owned collection (models with a userId field).
        // Integration and IntegrationData are intentionally NOT in this list.
        const ownedModels = {
            AIPairSession: require('../models/AIPairSession'),
            AgentExecution: require('../models/AgentExecution'),
            BillingSchedule: require('../models/BillingSchedule'),
            ChatMessage: require('../models/ChatMessage'),
            CodeChange: require('../models/CodeChange'),
            CollaborationSession: require('../models/CollaborationSession'),
            Deployment: require('../models/Deployment'),
            DesignToken: require('../models/DesignToken'),
            LocalProject: require('../models/LocalProject'),
            LocalTask: require('../models/LocalTask'),
            Notification: require('../models/Notification'),
            Subscription: require('../models/Subscription'),
            SupportTicket: require('../models/SupportTicket'),
            TerminalLog: require('../models/TerminalLog'),
            TicketAnalysis: require('../models/TicketAnalysis')
        };
        const ownedResults = await Promise.allSettled(
            Object.entries(ownedModels).map(async ([name, model]) => {
                const r = await withRetry(() => model.deleteMany({ userId }));
                return [name, r.deletedCount];
            })
        );
        ownedResults.forEach((r) => {
            if (r.status === 'fulfilled') track(r.value[0], r.value[1]);
            else console.error('Delete account — owned collection failed:', r.reason?.message);
        });

        // Records linked by email or other user fields
        const linkedOps = [
            ['OTP', () => require('../models/OTP').deleteMany({ email: user.email })],
            ['AuthLockout', () => require('../models/AuthLockout').deleteMany({ key: user.email.toLowerCase() })],
            ['AuditLog', () => require('../models/AuditLog').deleteMany({ $or: [{ actor: userId }, { email: user.email }] })],
            ['CodeFile', () => require('../models/CodeFile').deleteMany({ createdBy: userId })],
            ['Standup', () => require('../models/Standup').deleteMany({ user: userId })],
            ['TeamActivity', () => require('../models/TeamActivity').deleteMany({ user: userId })],
            ['Message', () => require('../models/Message').deleteMany({ sender: userId })],
            ['DebugHandoff', () => require('../models/DebugHandoff').deleteMany({ createdBy: userId })],
            ['PersistentDebugRoom', () => require('../models/PersistentDebugRoom').deleteMany({ $or: [{ host: userId }, { createdBy: userId }, { 'participants.userId': userId }] })],
            ['EphemeralSandbox', () => require('../models/EphemeralSandbox').deleteMany({ createdBy: userId })],
            ['DesignSyncSession', () => require('../models/DesignSyncSession').deleteMany({ createdBy: userId })]
        ];
        await Promise.allSettled(
            linkedOps.map(async ([name, fn]) => {
                const r = await safely(name, fn);
                if (r) track(name, r.deletedCount);
            })
        );

        // File uploads: DB records plus files on disk
        await safely('FileUpload', async () => {
            const uploads = await require('../models/FileUpload').find({ uploadedBy: userId }).select('url');
            for (const upload of uploads) {
                if (upload.url && upload.url.startsWith('/uploads/')) {
                    try {
                        const filePath = path.join(__dirname, '..', upload.url.split('?')[0]);
                        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    } catch (err) {
                        console.error('Delete account — upload removal failed:', err.message);
                    }
                }
            }
            track('FileUpload', await require('../models/FileUpload').deleteMany({ uploadedBy: userId }));
        });

        // Shared team data: remove the user's references, keep the team resources
        await safely('TeamTask.unassign', async () => {
            track('TeamTask.unassigned', await require('../models/TeamTask').updateMany({ assignedTo: userId }, { $unset: { assignedTo: '' } }));
        });
        // Pull both member shapes (bare ObjectIds pre-backfill, { user }
        // subdocs after): a plain $pull only matches bare ids, never subdocs.
        const pullMemberBothShapes = {
            $set: { members: { $filter: {
                input: '$members',
                cond: { $and: [
                    { $ne: ['$$this', userId] },
                    { $ne: ['$$this.user', userId] },
                ] },
            } } },
        };
        await safely('Channel.members', () => require('../models/Channel').updateMany(
            { $or: [{ members: userId }, { 'members.user': userId }] },
            [pullMemberBothShapes]
        ));
        await safely('TeamProject.members', () => require('../models/TeamProject').updateMany(
            { $or: [{ members: userId }, { 'members.user': userId }] },
            [pullMemberBothShapes]
        ));
        await safely('TeamProject.owner', async () => {
            const ownedProjects = await require('../models/TeamProject').find({ owner: userId });
            const { memberUserId } = require('../utils/members');
            for (const project of ownedProjects) {
                if (project.members && project.members.length > 0) {
                    project.owner = memberUserId(project.members[0]);
                    await project.save();
                }
            }
        });
        await safely('Company.members', () => require('../models/Company').updateMany({ 'members.user': userId }, { $pull: { members: { user: userId } } }));
        await safely('Company.owner', async () => {
            const ownedCompanies = await require('../models/Company').find({ owner: userId });
            for (const company of ownedCompanies) {
                if (company.members.length > 0) {
                    company.owner = company.members[0].user;
                    company.members[0].role = 'owner';
                } else {
                    company.isActive = false;
                }
                await company.save();
            }
        });

        // Integration data is preserved on purpose:
        // Integration (OAuth connections) and IntegrationData (synced GitHub repos, etc.)
        const keptIntegrations = await safely('Integration.count', async () => {
            const Integration = require('../models/Integration');
            const IntegrationData = require('../models/IntegrationData');
            const n = await Integration.countDocuments({ userId });
            const d = await IntegrationData.countDocuments({ userId });
            return n + d;
        });

        // Finally remove the user record itself
        await User.findByIdAndDelete(userId);

        res.json({
            success: true,
            message: 'Account deleted successfully',
            deleted,
            kept: { integrationRecords: keptIntegrations || 0, note: 'Integration connections and synced data (GitHub repos, etc.) were kept' }
        });

    } catch (error) {
        console.error('Delete account error:', error);
        return sendInternalError(req, res, error, { message: 'Error deleting account' });
    }
});

/**
 * @swagger
 * /api/auth/complete-onboarding:
 *   post:
 *     summary: Complete user onboarding
 *     tags:
 *       - Authentication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               company:
 *                 type: string
 *                 example: Acme Corp
 *               teamSize:
 *                 type: string
 *                 example: "11-50"
 *               role:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["developer", "team-lead"]
 *               goals:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["improve-productivity", "ai-assistance"]
 *               useMode:
 *                 type: string
 *                 enum: [solo, team]
 *               invites:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     email:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [editor, viewer]
 *               useCase:
 *                 type: string
 *                 example: web
 *               focus:
 *                 type: string
 *                 example: developer
 *               focusExtras:
 *                 type: array
 *                 items:
 *                   type: string
 *               startMode:
 *                 type: string
 *                 enum: [template, scratch]
 *               template:
 *                 type: string
 *                 example: nextjs
 *               skipped:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Onboarding completed successfully
 *       401:
 *         description: Unauthorized
 */
// Complete onboarding
router.post('/complete-onboarding', authenticateToken, async (req, res) => {
    try {
        const userId = req.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const {
            fullName,
            email,
            company,
            teamSize,
            role,
            goals,
            useMode,
            invites,
            useCase,
            focus,
            focusExtras,
            startMode,
            template,
            skipped
        } = req.body || {};

        const publicUser = (doc) => ({
            id: doc._id,
            _id: doc._id,
            fullName: doc.fullName,
            email: doc.email,
            role: doc.role,
            company: doc.company,
            teamSize: doc.teamSize,
            goals: doc.goals,
            onboarding: doc.onboarding,
            onboardingCompleted: doc.onboardingCompleted
        });

        // "Cancel" on the first step resolves setup without inventing answers:
        // the user lands in the app and can finish from Settings later.
        if (skipped === true) {
            user.onboardingCompleted = true;
            await user.save();
            return res.json({
                success: true,
                message: 'Onboarding skipped',
                user: publicUser(user)
            });
        }

        const cleanString = (value, max = 120) =>
            typeof value === 'string' ? value.trim().slice(0, max) : undefined;
        const cleanList = (value, max = 12) =>
            Array.isArray(value)
                ? [...new Set(
                    value
                        .filter((item) => typeof item === 'string' && item.trim())
                        .map((item) => item.trim().slice(0, 80))
                )].slice(0, max)
                : [];

        const name = cleanString(fullName);
        if (fullName !== undefined && (!name || name.length < 2)) {
            return res.status(400).json({ success: false, message: 'Please provide your name' });
        }
        const nextEmail = cleanString(email, 254);
        if (email !== undefined && (!nextEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail))) {
            return res.status(400).json({ success: false, message: 'Please provide a valid email' });
        }

        const inviteList = Array.isArray(invites)
            ? invites
                .filter((invite) => invite && typeof invite.email === 'string')
                .map((invite) => ({
                    email: invite.email.trim().toLowerCase(),
                    role: invite.role === 'viewer' ? 'viewer' : 'editor'
                }))
                .filter((invite) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email))
                .filter((invite, index, list) => list.findIndex((item) => item.email === invite.email) === index)
                .slice(0, 8)
            : [];

        const resolvedMode = useMode === 'team' ? 'team' : useMode === 'solo' ? 'solo' : undefined;
        const focusValue = cleanString(focus, 40);
        const roleList = cleanList(role);
        const goalList = cleanList(goals);

        // Update user profile (legacy fields stay in sync so older screens and
        // settings read the same answers as the new nested block).
        if (name) user.fullName = name;
        // Email is prefilled and read-only in the flow: changing the account
        // address needs its own verification step, so it is never taken here.
        if (company !== undefined) user.company = cleanString(company) || undefined;
        user.role = roleList.length ? roleList : focusValue ? [focusValue] : user.role;
        if (Array.isArray(goals)) user.goals = goalList;

        const resolvedTeamSize = cleanString(teamSize, 40);
        if (resolvedTeamSize) user.teamSize = resolvedTeamSize;
        else if (resolvedMode === 'solo') user.teamSize = 'Just me';
        else if (resolvedMode === 'team') user.teamSize = String(inviteList.length + 1);

        let githubConnected = Boolean(user.onboarding?.githubConnected);
        try {
            const githubIntegration = await Integration.findOne({
                userId,
                provider: 'github',
                isActive: true
            });
            githubConnected = Boolean(githubIntegration);
        } catch (integrationError) {
            console.error('Onboarding GitHub status error:', integrationError.message);
        }

        user.onboarding = {
            useMode: resolvedMode || user.onboarding?.useMode,
            useCase: cleanString(useCase, 60) || user.onboarding?.useCase,
            focus: focusValue || user.onboarding?.focus,
            focusExtras: cleanList(focusExtras),
            startMode: startMode === 'scratch' ? 'scratch' : 'template',
            template: cleanString(template, 40) || undefined,
            githubConnected,
            invites: inviteList,
            completedAt: new Date()
        };
        user.onboardingCompleted = true;

        await user.save();

        // Teammates invited during setup only become real invitations once the
        // user owns a workspace — invites stay on the profile until then.
        if (inviteList.length) {
            try {
                const ownedCompany = await Company.findOne({ owner: userId });
                if (ownedCompany) {
                    for (const invite of inviteList) {
                        const existingUser = await User.findOne({ email: invite.email });
                        const isMember = existingUser
                            && ownedCompany.members.some((member) => String(member.user) === String(existingUser._id));
                        if (isMember) continue;

                        const pending = await Invitation.findOne({
                            email: invite.email,
                            company: ownedCompany._id,
                            status: 'pending'
                        });
                        if (pending) continue;

                        const invitation = await Invitation.create({
                            email: invite.email,
                            company: ownedCompany._id,
                            invitedBy: userId,
                            role: invite.role === 'viewer' ? 'viewer' : 'member',
                            message: `${user.fullName || 'A teammate'} invited you to their BuildrsHQ workspace.`
                        });

                        try {
                            await enqueueEmailJob(
                                'invitation',
                                `invitation:${invitation._id}:${invitation.metadata.sentCount}`,
                                { invitationId: invitation._id }
                            );
                        } catch (queueError) {
                            console.error('Failed to queue invitation email:', queueError.message);
                        }
                    }
                }
            } catch (inviteError) {
                // A failed invite must not block onboarding — the answers are saved.
                console.error('Onboarding invite error:', inviteError.message);
            }
        }

        res.json({
            success: true,
            message: 'Onboarding completed successfully',
            user: publicUser(user)
        });

    } catch (error) {
        console.error('Complete onboarding error:', error);
        return sendInternalError(req, res, error, { message: 'Error completing onboarding' });
    }
});

module.exports = router;
