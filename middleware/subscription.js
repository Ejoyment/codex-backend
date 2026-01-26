const Subscription = require('../models/Subscription');
const jwt = require('jsonwebtoken');

// Middleware to check if user has access to a feature
const requireFeature = (featureName) => {
    return async (req, res, next) => {
        try {
            // Get token from header
            const token = req.headers.authorization?.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            // Verify token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            
            // Get user's subscription
            const subscription = await Subscription.findOne({ userId: decoded.id });
            
            if (!subscription) {
                return res.status(403).json({
                    success: false,
                    message: 'No active subscription found',
                    requiresUpgrade: true,
                    feature: featureName
                });
            }

            // Check if subscription is active
            if (subscription.status !== 'active' && subscription.status !== 'trial') {
                return res.status(403).json({
                    success: false,
                    message: 'Subscription is not active',
                    status: subscription.status
                });
            }

            // Check if user has access to the feature
            if (!subscription.hasFeature(featureName)) {
                return res.status(403).json({
                    success: false,
                    message: `This feature requires ${getRequiredTier(featureName)} tier`,
                    currentTier: subscription.tier,
                    requiredTier: getRequiredTier(featureName),
                    requiresUpgrade: true,
                    feature: featureName
                });
            }

            // Attach subscription to request
            req.subscription = subscription;
            req.userId = decoded.id;
            
            next();
        } catch (error) {
            console.error('Feature access error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking feature access'
            });
        }
    };
};

// Helper function to determine required tier for a feature
function getRequiredTier(featureName) {
    const featureTiers = {
        localRepositories: 'freebie',
        discordSync: 'freebie',
        advancedAnalytics: 'professional',
        aiCodeReview: 'professional',
        videoStandups: 'professional',
        collaborativeEditing: 'professional',
        soc2Compliance: 'enterprise',
        dedicatedSupport: 'enterprise'
    };
    
    return featureTiers[featureName] || 'professional';
}

// Middleware to check subscription tier
const requireTier = (minTier) => {
    const tierLevels = {
        freebie: 1,
        professional: 2,
        enterprise: 3
    };

    return async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            
            if (!token) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const subscription = await Subscription.findOne({ userId: decoded.id });
            
            if (!subscription) {
                return res.status(403).json({
                    success: false,
                    message: 'No active subscription',
                    requiresUpgrade: true
                });
            }

            const userTierLevel = tierLevels[subscription.tier] || 0;
            const requiredTierLevel = tierLevels[minTier] || 0;

            if (userTierLevel < requiredTierLevel) {
                return res.status(403).json({
                    success: false,
                    message: `This feature requires ${minTier} tier or higher`,
                    currentTier: subscription.tier,
                    requiredTier: minTier,
                    requiresUpgrade: true
                });
            }

            req.subscription = subscription;
            req.userId = decoded.id;
            
            next();
        } catch (error) {
            console.error('Tier check error:', error);
            res.status(500).json({
                success: false,
                message: 'Error checking subscription tier'
            });
        }
    };
};

module.exports = {
    requireFeature,
    requireTier
};
