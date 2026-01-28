const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    fullName: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true
    },
    password: {
        type: String,
        required: function() {
            return !this.googleId && !this.facebookId;
        }
    },
    isVerified: {
        type: Boolean,
        default: false
    },
    googleId: {
        type: String,
        sparse: true
    },
    facebookId: {
        type: String,
        sparse: true
    },
    profilePicture: {
        type: String
    },
    bio: {
        type: String,
        maxlength: 500
    },
    title: {
        type: String
    },
    phone: {
        type: String
    },
    location: {
        type: String
    },
    website: {
        type: String
    },
    socialLinks: {
        github: String,
        linkedin: String,
        twitter: String,
        portfolio: String
    },
    skills: [{
        type: String
    }],
    timezone: {
        type: String,
        default: 'UTC'
    },
    language: {
        type: String,
        default: 'en'
    },
    status: {
        type: String,
        enum: ['online', 'away', 'busy', 'offline'],
        default: 'offline'
    },
    customStatus: {
        type: String,
        maxlength: 100
    },
    role: {
        type: [String],
        default: []
    },
    company: {
        type: String
    },
    teamSize: {
        type: String
    },
    goals: {
        type: [String],
        default: []
    },
    onboardingCompleted: {
        type: Boolean,
        default: false
    },
    subscription: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription'
    },
    authProvider: {
        type: String,
        enum: ['local', 'google', 'facebook'],
        default: 'local'
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastLogin: {
        type: Date
    }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
    if (!this.isModified('password')) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
