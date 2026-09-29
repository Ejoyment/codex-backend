const mongoose = require('mongoose');
require('dotenv').config();
const SupportAgent = require('./models/SupportAgent');

const PLACEHOLDER_PASSWORDS = new Set([
    'change-me-in-production',
    'generate-a-strong-random-password',
    'password',
    'admin',
]);

async function createDemoAgent() {
    try {
        const password = process.env.DEMO_AGENT_PASSWORD;

        // Refuse to provision a support-agent account with a predictable
        // password. This account reaches the admin support dashboard, so a
        // known default here is a full administrative compromise for anyone
        // who reads the public template.
        if (!password || password.length < 16 || PLACEHOLDER_PASSWORDS.has(password)) {
            console.error('❌ REFUSING TO CREATE AGENT: DEMO_AGENT_PASSWORD is missing,');
            console.error('   shorter than 16 chars, or still a placeholder value.');
            console.error('   Set a strong random DEMO_AGENT_PASSWORD in .env and retry.');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Check if agent already exists
        const existingAgent = await SupportAgent.findOne({ email: process.env.DEMO_AGENT_EMAIL || 'agent@buildershq.com' });
        if (existingAgent) {
            console.log('Demo agent already exists!');
            console.log('Email:', process.env.DEMO_AGENT_EMAIL || 'agent@buildershq.com');
            console.log('Password: [set via DEMO_AGENT_PASSWORD env var]');
            process.exit(0);
        }

        // Create demo agent
        const agent = new SupportAgent({
            name: process.env.DEMO_AGENT_NAME || 'Demo Support Agent',
            email: process.env.DEMO_AGENT_EMAIL || 'agent@buildershq.com',
            password,
            role: 'agent',
            status: 'offline'
        });

        await agent.save();

        console.log('✅ Demo support agent created successfully!');
        console.log('\nLogin Credentials:');
        console.log('Email:', process.env.DEMO_AGENT_EMAIL || 'agent@buildershq.com');
        console.log('Password: [set via DEMO_AGENT_PASSWORD env var]');
        console.log('\nAccess the admin dashboard at: /support-admin.html');

        process.exit(0);
    } catch (error) {
        console.error('Error creating demo agent:', error);
        process.exit(1);
    }
}

createDemoAgent();