const express = require('express');
const router = express.Router();
const passport = require('passport');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const Subscription = require('../models/Subscription');
const rateLimit = require('express-rate-limit');

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = 'uploads/profiles';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
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
    message: { success: false, message: 'Too many attempts, please try again later.' }
});

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
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

        // Create default subscription (freebie tier)
        await Subscription.create({
            userId: user._id,
            tier: 'freebie',
            status: 'active'
        });

        res.status(201).json({
            success: true,
            message: 'Account created successfully. Please verify your email.',
            userId: user._id,
            email: user.email
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error creating account',
            error: error.message 
        });
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

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        // Generate token
        const token = generateToken(user._id);

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
                onboardingCompleted: user.onboardingCompleted
            }
        });

    } catch (error) {
        console.error('Signin error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error signing in',
            error: error.message 
        });
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
router.get('/google', 
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
    passport.authenticate('google', { failureRedirect: '/sign_in.html' }),
    (req, res) => {
        // Generate token
        const token = generateToken(req.user._id);
        
        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL}/auth-success.html?token=${token}&provider=google`);
    }
);

/**
 * @swagger
 * /api/auth/facebook:
 *   get:
 *     summary: Initiate Facebook OAuth login
 *     tags:
 *       - Authentication
 *     description: Redirects the user to Facebook for OAuth authentication
 *     responses:
 *       302:
 *         description: Redirect to Facebook OAuth
 */
// Facebook OAuth
router.get('/facebook',
    passport.authenticate('facebook', { scope: ['email'] })
);

/**
 * @swagger
 * /api/auth/facebook/callback:
 *   get:
 *     summary: Facebook OAuth callback
 *     tags:
 *       - Authentication
 *     description: Handles the callback from Facebook OAuth and redirects with JWT token
 *     responses:
 *       302:
 *         description: Redirect to frontend with token
 */
router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/sign_in.html' }),
    (req, res) => {
        // Generate token
        const token = generateToken(req.user._id);
        
        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL}/auth-success.html?token=${token}&provider=facebook`);
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
router.get('/me', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id).select('-password');

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Get user's subscription
        const Subscription = require('../models/Subscription');
        const subscription = await Subscription.findOne({ userId: decoded.id });

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
                    features: subscription.features
                } : {
                    tier: 'freebie',
                    status: 'active',
                    features: {}
                },
                createdAt: user.createdAt,
                lastLogin: user.lastLogin
            }
        });

    } catch (error) {
        res.status(401).json({ 
            success: false, 
            message: 'Invalid token' 
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
router.post('/upload-photo', upload.single('profilePhoto'), async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

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

        // Delete old profile picture if exists
        if (user.profilePicture && user.profilePicture.startsWith('/uploads/')) {
            const oldPath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }

        // Update user profile picture
        user.profilePicture = '/uploads/profiles/' + req.file.filename;
        await user.save();

        res.json({
            success: true,
            message: 'Profile photo updated successfully',
            profilePicture: user.profilePicture
        });

    } catch (error) {
        console.error('Upload photo error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error uploading photo',
            error: error.message 
        });
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
router.put('/update-profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

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
        res.status(500).json({ 
            success: false, 
            message: 'Error updating profile',
            error: error.message 
        });
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
router.post('/change-password', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

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

        // Verify current password
        const isMatch = await user.comparePassword(currentPassword);
        if (!isMatch) {
            return res.status(401).json({ 
                success: false, 
                message: 'Current password is incorrect' 
            });
        }

        // Update password (will be hashed by pre-save hook)
        user.password = newPassword;
        await user.save();

        res.json({
            success: true,
            message: 'Password changed successfully'
        });

    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error changing password',
            error: error.message 
        });
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
// Delete account
router.delete('/delete-account', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        // Delete user's profile photo if exists
        if (user.profilePicture && user.profilePicture.startsWith('/uploads/')) {
            const photoPath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(photoPath)) {
                fs.unlinkSync(photoPath);
            }
        }

        // Delete related data
        const Integration = require('../models/Integration');
        const Subscription = require('../models/Subscription');
        const OTP = require('../models/OTP');
        
        await Integration.deleteMany({ userId: user._id });
        await Subscription.deleteMany({ userId: user._id });
        await OTP.deleteMany({ userId: user._id });
        
        // Delete user
        await User.findByIdAndDelete(user._id);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting account',
            error: error.message 
        });
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
 *     responses:
 *       200:
 *         description: Onboarding completed successfully
 *       401:
 *         description: Unauthorized
 */
// Complete onboarding
router.post('/complete-onboarding', async (req, res) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'No token provided' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Support both 'id' and 'userId' for backwards compatibility
        const userId = decoded.userId || decoded.id;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }

        const { fullName, company, teamSize, role, goals } = req.body;

        // Update user profile
        user.fullName = fullName || user.fullName;
        user.company = company;
        user.teamSize = teamSize;
        user.role = role || [];
        user.goals = goals || [];
        user.onboardingCompleted = true;
        
        await user.save();

        res.json({
            success: true,
            message: 'Onboarding completed successfully',
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                company: user.company,
                teamSize: user.teamSize,
                onboardingCompleted: user.onboardingCompleted
            }
        });

    } catch (error) {
        console.error('Complete onboarding error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error completing onboarding',
            error: error.message 
        });
    }
});

module.exports = router;
