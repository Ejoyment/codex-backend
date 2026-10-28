#!/usr/bin/env node
/**
 * Backfill conversation indexing
 */

const mongoose = require('mongoose');
require('dotenv').config();

const conversationIndexer = require('../utils/conversationIndexer');
const Company = require('../models/Company');

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');
        
        const companies = await Company.find().select('_id name').lean();
        console.log(`Found ${companies.length} companies`);
        
        for (const company of companies) {
            console.log(`Indexing conversations for ${company.name}...`);
            await conversationIndexer.backfillMessages(company._id, 90);
        }
        
        console.log('Done!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

run();
