const Subscription = require('../models/Subscription');
const jwt = require('jsonwebtoken');
const emailService = require('../utils/emailServiceResend');
const User = require('../models/User');

/**
 * Trial Enforcement Middleware
 * 
 * Checks:
 * 1. Is the user currently on a free trial?
 * 2. How many days left?
 * 3. Is this the last day? → send email notification
 * 4. Is the trial expired? → auto-downgrade to freebie + notify via email
 * 5. Are the correct features enabled for the user's tier?
 */
const checkTrialStatus = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId || decoded.id;
        
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return res.status(403).json({
                success: false,
                message: 'No subscription found',
                requiresUpgrade: true
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        // If on trial, check status
        if (subscription.status === 'trial') {
            const daysLeft = subscription.getTrialDaysLeft();
            const isLastDay = subscription.isLastTrialDay();
            const isExpired = subscription.isTrialExpired();

            // Trial expired -> auto downgrade to freebie
            if (isExpired) {
                const previousTier = subscription.tier;
                subscription.status = 'expired';
                subscription.upgradeTo('freebie');
                await subscription.save();
                
                // Send trial expired email
                try {
                    await emailService.sendTrialExpiredEmail(user.email, user.fullName);
                } catch (emailError) {
                    console.error('Trial expired email error:', emailError);
                }
                
                console.log(`User ${userId} trial expired, downgraded from ${previousTier} to freebie`);
                
                return res.status(403).json({
                    success: false,
                    message: 'Your free trial has ended. Please upgrade to continue.',
                    code: 'TRIAL_EXPIRED',
                    requiresUpgrade: true,
                    subscription: {
                        tier: subscription.tier,
                        status: subscription.status
                    }
                });
            }

            // Last day - send reminder email (once per day)
            if (isLastDay && !subscription.metadata?.trialEndReminderSent) {
                try {
                    await emailService.sendTrialReminderEmail(user.email, user.fullName, daysLeft);
                    subscription.metadata = { ...subscription.metadata, trialEndReminderSent: true };
                    await subscription.save();
                } catch (emailError) {
                    console.error('Trial reminder email error:', emailError);
                }
            }

            // Attach trial info to request
            req.trial = {
                isOnTrial: true,
                daysLeft,
                isLastDay,
                trialEndsAt: subscription.trialEndsAt,
                tier: subscription.tier
            };
        } else {
            req.trial = {
                isOnTrial: false,
                daysLeft: 0,
                isLastDay: false,
                trialEndsAt: null,
                tier: subscription.tier
            };
        }

        // Attach subscription to request
        req.subscription = subscription;
        req.userId = userId;
        req.user = { ...(decoded || {}), id: userId, userId };

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }
        console.error('Trial check error:', error);
        res.status(500).json({
            success: false,
            message: 'Error checking trial status'
        });
    }
};

// Middleware to enforce project limits based on tier
const enforceProjectLimit = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId || decoded.id;
        
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return res.status(403).json({ success: false, message: 'No subscription found' });
        }

        const maxProjects = subscription.features.maxProjects; // 0 = unlimited
        if (maxProjects === 0 || subscription.features.unlimitedProjects) {
            return next();
        }

        // Count user's local projects
        const LocalProject = require('../models/LocalProject');
        const projectCount = await LocalProject.countDocuments({ userId, isArchived: false });

        if (projectCount >= maxProjects) {
            return res.status(403).json({
                success: false,
                message: `You have reached your project limit of ${maxProjects} projects. Please upgrade to continue.`,
                code: 'PROJECT_LIMIT_REACHED',
                requiresUpgrade: true,
                currentCount: projectCount,
                maxProjects
            });
        }

        next();
    } catch (error) {
        console.error('Project limit check error:', error);
        res.status(500).json({ success: false, message: 'Error checking project limit' });
    }
};

// Middleware to enforce AI access based on tier
const enforceAIAccess = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.userId || decoded.id;
        
        const subscription = await Subscription.findOne({ userId });
        if (!subscription) {
            return res.status(403).json({ success: false, message: 'No subscription found' });
        }

        // Check if user has basic or advanced AI assistance
        const hasAIAccess = subscription.features.basicAiAssistance || subscription.features.advancedAiAssistance;

        if (!hasAIAccess) {
            return res.status(403).json({
                success: false,
                message: 'AI assistance is not available on your current plan',
                code: 'AI_ACCESS_DENIED',
                requiresUpgrade: true
            });
        }

        next();
    } catch (error) {
        console.error('AI access check error:', error);
        res.status(500).json({ success: false, message: 'Error checking AI access' });
    }
};

module.exports = {
    checkTrialStatus,
    enforceProjectLimit,
    enforceAIAccess
};