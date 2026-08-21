const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');
const Subscription = require('../models/Subscription');

module.exports = function(passport) {
    // Serialize user
    passport.serializeUser((user, done) => {
        done(null, user.id);
    });

    // Deserialize user
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });

    // Google OAuth Strategy (only if credentials are provided)
    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            callbackURL: process.env.GOOGLE_CALLBACK_URL
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Validate that Google returned an email
                const email = profile.emails && profile.emails[0] && profile.emails[0].value;
                if (!email) {
                    return done(new Error('No email returned from Google. Please ensure your Google account has a primary email.'), null);
                }

                // Check if user already exists
                let user = await User.findOne({ googleId: profile.id });

                if (user) {
                    // Update last login
                    user.lastLogin = new Date();
                    await user.save();
                    return done(null, user);
                }

                // Check if email already exists with different provider
                user = await User.findOne({ email: email.toLowerCase() });
                
                if (user) {
                    // Link Google account to existing user
                    user.googleId = profile.id;
                    user.isVerified = true;
                    user.lastLogin = new Date();
                    if (!user.profilePicture) {
                        user.profilePicture = profile.photos && profile.photos[0] && profile.photos[0].value;
                    }
                    await user.save();
                    return done(null, user);
                }

                // Create new user
                user = await User.create({
                    googleId: profile.id,
                    email: email.toLowerCase(),
                    fullName: profile.displayName,
                    profilePicture: profile.photos && profile.photos[0] && profile.photos[0].value,
                    authProvider: 'google',
                    isVerified: true,
                    lastLogin: new Date()
                });

                // Create default subscription (don't fail auth if this errors)
                try {
                    await Subscription.create({
                        userId: user._id,
                        tier: 'freebie',
                        status: 'active'
                    });
                } catch (subError) {
                    console.error('Failed to create subscription for Google user:', subError.message);
                }

                done(null, user);
            } catch (error) {
                done(error, null);
            }
        }));
    } else {
        console.warn('⚠ Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env');
    }
};
