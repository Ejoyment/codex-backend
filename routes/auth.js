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

// Google OAuth
router.get('/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/sign_in.html' }),
    (req, res) => {
        // Generate token
        const token = generateToken(req.user._id);
        
        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL}/auth-success.html?token=${token}&provider=google`);
    }
);

// Facebook OAuth
router.get('/facebook',
    passport.authenticate('facebook', { scope: ['email'] })
);

router.get('/facebook/callback',
    passport.authenticate('facebook', { failureRedirect: '/sign_in.html' }),
    (req, res) => {
        // Generate token
        const token = generateToken(req.user._id);
        
        // Redirect to frontend with token
        res.redirect(`${process.env.FRONTEND_URL}/auth-success.html?token=${token}&provider=facebook`);
    }
);

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
        const user = await User.findById(decoded.id);

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
