const mongoose = require('mongoose');
require('dotenv').config();
const SupportAgent = require('./models/SupportAgent');

async function verifyAgent() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('✅ Connected to MongoDB\n');

        const agent = await SupportAgent.findOne({ email: 'agent@buildershq.com' });
        
        if (agent) {
            console.log('✅ Demo support agent EXISTS in database!\n');
            console.log('Agent Details:');
            console.log('  Name:', agent.name);
            console.log('  Email:', agent.email);
            console.log('  Role:', agent.role);
            console.log('  Status:', agent.status);
            console.log('  Created:', agent.createdAt);
            console.log('\n✅ You can now login at: /support-admin.html');
            console.log('  Email: agent@buildershq.com');
            console.log('  Password: agent123');
        } else {
            console.log('❌ Demo support agent NOT FOUND in database!\n');
            console.log('Run this command to create it:');
            console.log('  node create-support-agent.js');
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

verifyAgent();
