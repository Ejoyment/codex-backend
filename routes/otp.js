const express = require('express');
const router = express.Router();
const OTP = require('../models/OTP');
const User = require('../models/User');
const { sendOTPEmail, sendWelcomeEmail } = require('../utils/emailServiceResend');
const rateLimit = require('express-rate-limit');

// Rate limiting for OTP requests
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3, // 3 requests per window
    message: { success: false, message: 'Too many OTP requests, please try again later.' }
});

// Generate 4-digit OTP
const generateOTP = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
};

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

        // Save OTP to database
        await OTP.create({
            email: email.toLowerCase(),
            otp: otpCode
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

        // Check attempts
        if (otpRecord.attempts >= 3) {
            await OTP.deleteOne({ _id: otpRecord._id });
            return res.status(400).json({ 
                success: false, 
                message: 'Too many failed attempts. Please request a new OTP.' 
            });
        }

        // Verify OTP
        if (otpRecord.otp !== otp) {
            otpRecord.attempts += 1;
            await otpRecord.save();
            
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid OTP',
                attemptsLeft: 3 - otpRecord.attempts
            });
        }

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

        // Generate JWT token for automatic login
        const jwt = require('jsonwebtoken');
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
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

        // Save OTP
        await OTP.create({
            email: email.toLowerCase(),
            otp: otpCode
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
