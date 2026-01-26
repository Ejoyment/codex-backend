const mongoose = require('mongoose');
require('dotenv').config();

const Integration = require('./models/Integration');

async function checkIntegrations() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/codex-inc', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        
        console.log('✓ Connected to MongoDB\n');
        
        // Get all integrations
        const integrations = await Integration.find({});
        
        console.log('========================================');
        console.log('ALL INTEGRATIONS IN DATABASE');
        console.log('========================================\n');
        
        if (integrations.length === 0) {
            console.log('❌ No integrations found in database\n');
        } else {
            integrations.forEach((integration, index) => {
                console.log(`[${index + 1}] ${integration.platform ? integration.platform.toUpperCase() : 'UNKNOWN'}`);
                console.log(`    User ID: ${integration.userId}`);
                console.log(`    Username: ${integration.username || 'N/A'}`);
                console.log(`    Connected: ${integration.connected}`);
                console.log(`    Connected At: ${integration.connectedAt}`);
                console.log(`    Access Token: ${integration.accessToken ? 'Present' : 'Missing'}`);
                console.log(`    Platform field: ${integration.platform}`);
                console.log('');
            });
        }
        
        console.log('========================================');
        console.log(`Total: ${integrations.length} integration(s)`);
        console.log('========================================\n');
        
        // Check for GitHub specifically
        const github = integrations.find(i => i.platform === 'github');
        if (github) {
            console.log('✓ GitHub integration found:');
            console.log(`  Connected: ${github.connected}`);
            console.log(`  User ID: ${github.userId}`);
            console.log(`  Username: ${github.username}`);
        } else {
            console.log('❌ No GitHub integration found');
        }
        
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkIntegrations();
