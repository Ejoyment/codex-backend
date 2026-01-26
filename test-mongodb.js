require('dotenv').config();
const mongoose = require('mongoose');

console.log('Testing MongoDB Connection...\n');
console.log('Connection String:', process.env.MONGODB_URI?.replace(/:[^:@]+@/, ':****@')); // Hide password
console.log('\nConnecting...\n');

const options = {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    family: 4
};

mongoose.connect(process.env.MONGODB_URI, options)
    .then(() => {
        console.log('✅ SUCCESS! MongoDB connected successfully');
        console.log('✅ Database:', mongoose.connection.name);
        console.log('✅ Host:', mongoose.connection.host);
        console.log('\nYour MongoDB connection is working!\n');
        process.exit(0);
    })
    .catch(err => {
        console.error('❌ FAILED! MongoDB connection error\n');
        console.error('Error:', err.message);
        console.error('\n📋 Troubleshooting Steps:');
        console.error('1. Check if your IP is whitelisted in MongoDB Atlas');
        console.error('2. Verify your username and password are correct');
        console.error('3. Make sure your internet connection is working');
        console.error('4. Check if MongoDB Atlas cluster is paused');
        console.error('\n📚 See MONGODB_FIX.md for detailed solutions\n');
        process.exit(1);
    });

// Timeout after 35 seconds
setTimeout(() => {
    console.error('❌ Connection timeout after 35 seconds');
    console.error('\n📋 This usually means:');
    console.error('1. Your IP is not whitelisted in MongoDB Atlas');
    console.error('2. Firewall is blocking the connection');
    console.error('3. Internet connection issues');
    console.error('\n📚 See MONGODB_FIX.md for solutions\n');
    process.exit(1);
}, 35000);
