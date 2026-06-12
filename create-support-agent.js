const mongoose = require('mongoose');
require('dotenv').config();
const SupportAgent = require('./models/SupportAgent');

async function createDemoAgent() {
    try {
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
            password: process.env.DEMO_AGENT_PASSWORD || 'change-me-in-production',
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