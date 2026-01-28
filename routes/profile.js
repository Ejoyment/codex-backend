const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const User = require('../models/User');
const { authenticateToken } = require('../middleware/auth');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = 'uploads/profiles';
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);
        
        if (extname && mimetype) {
            return cb(null, true);
        }
        cb(new Error('Only image files are allowed'));
    }
});

// Upload profile picture
router.post('/picture', authenticateToken, upload.single('profilePicture'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        
        const user = await User.findById(req.userId);
        
        // Delete old profile picture if exists
        if (user.profilePicture && user.profilePicture.startsWith('/uploads/')) {
            const oldPath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }
        
        user.profilePicture = '/uploads/profiles/' + req.file.filename;
        await user.save();
        
        res.json({
            success: true,
            profilePicture: user.profilePicture,
            message: 'Profile picture updated successfully'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update profile
router.put('/', authenticateToken, async (req, res) => {
    try {
        const { fullName, bio, title, phone, location, website, socialLinks, skills, timezone, language, status } = req.body;
        
        const user = await User.findById(req.userId);
        
        if (fullName) user.fullName = fullName;
        if (bio !== undefined) user.bio = bio;
        if (title !== undefined) user.title = title;
        if (phone !== undefined) user.phone = phone;
        if (location !== undefined) user.location = location;
        if (website !== undefined) user.website = website;
        if (socialLinks) user.socialLinks = socialLinks;
        if (skills) user.skills = skills;
        if (timezone) user.timezone = timezone;
        if (language) user.language = language;
        if (status) user.status = status;
        
        await user.save();
        
        res.json({
            success: true,
            user: {
                id: user._id,
                fullName: user.fullName,
                email: user.email,
                profilePicture: user.profilePicture,
                bio: user.bio,
                title: user.title,
                phone: user.phone,
                location: user.location,
                website: user.website,
                socialLinks: user.socialLinks,
                skills: user.skills,
                timezone: user.timezone,
                language: user.language,
                status: user.status
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Get profile
router.get('/:userId?', authenticateToken, async (req, res) => {
    try {
        const userId = req.params.userId || req.userId;
        
        const user = await User.findById(userId)
            .select('-password -otp -otpExpires')
            .populate('subscription');
        
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        res.json({
            success: true,
            user
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Update status
router.put('/status', authenticateToken, async (req, res) => {
    try {
        const { status, customStatus } = req.body;
        
        const user = await User.findById(req.userId);
        
        if (status) user.status = status;
        if (customStatus !== undefined) user.customStatus = customStatus;
        
        await user.save();
        
        res.json({
            success: true,
            status: user.status,
            customStatus: user.customStatus
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Delete profile picture
router.delete('/picture', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        
        if (user.profilePicture && user.profilePicture.startsWith('/uploads/')) {
            const oldPath = path.join(__dirname, '..', user.profilePicture);
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath);
            }
        }
        
        user.profilePicture = null;
        await user.save();
        
        res.json({
            success: true,
            message: 'Profile picture deleted'
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
