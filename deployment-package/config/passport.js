const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
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

    // Google OAuth Strategy
    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            let user = await User.findOne({ googleId: profile.id });

            if (user) {
                // Update last login
                user.lastLogin = new Date();
                await user.save();
                return done(null, user);
            }

            // Check if email already exists with different provider
            user = await User.findOne({ email: profile.emails[0].value });
            
            if (user) {
                // Link Google account to existing user
                user.googleId = profile.id;
                user.isVerified = true;
                user.lastLogin = new Date();
                if (!user.profilePicture) {
                    user.profilePicture = profile.photos[0]?.value;
                }
                await user.save();
                return done(null, user);
            }

            // Create new user
            user = await User.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                fullName: profile.displayName,
                profilePicture: profile.photos[0]?.value,
                authProvider: 'google',
                isVerified: true,
                lastLogin: new Date()
            });

            // Create default subscription
            await Subscription.create({
                userId: user._id,
                tier: 'freebie',
                status: 'active'
            });

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }));

    // Facebook OAuth Strategy
    passport.use(new FacebookStrategy({
        clientID: process.env.FACEBOOK_APP_ID,
        clientSecret: process.env.FACEBOOK_APP_SECRET,
        callbackURL: process.env.FACEBOOK_CALLBACK_URL,
        profileFields: ['id', 'displayName', 'emails', 'photos']
    },
    async (accessToken, refreshToken, profile, done) => {
        try {
            // Check if user already exists
            let user = await User.findOne({ facebookId: profile.id });

            if (user) {
                // Update last login
                user.lastLogin = new Date();
                await user.save();
                return done(null, user);
            }

            // Check if email already exists with different provider
            if (profile.emails && profile.emails[0]) {
                user = await User.findOne({ email: profile.emails[0].value });
                
                if (user) {
                    // Link Facebook account to existing user
                    user.facebookId = profile.id;
                    user.isVerified = true;
                    user.lastLogin = new Date();
                    if (!user.profilePicture) {
                        user.profilePicture = profile.photos[0]?.value;
                    }
                    await user.save();
                    return done(null, user);
                }
            }

            // Create new user
            user = await User.create({
                facebookId: profile.id,
                email: profile.emails?.[0]?.value || `${profile.id}@facebook.com`,
                fullName: profile.displayName,
                profilePicture: profile.photos?.[0]?.value,
                authProvider: 'facebook',
                isVerified: true,
                lastLogin: new Date()
            });

            // Create default subscription
            await Subscription.create({
                userId: user._id,
                tier: 'freebie',
                status: 'active'
            });

            done(null, user);
        } catch (error) {
            done(error, null);
        }
    }));
};
