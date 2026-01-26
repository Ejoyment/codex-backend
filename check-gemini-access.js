const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = 'AIzaSyDyHRFBooKMOAhqKORfMHTDn2nJ4tTmx8o';

async function checkAccess() {
    console.log('========================================');
    console.log('Gemini API - Access Check');
    console.log('========================================\n');

    const genAI = new GoogleGenerativeAI(API_KEY);

    console.log('📊 Checking your Gemini API access...\n');

    // Models to check (in order of preference)
    const models = [
        { name: 'gemini-1.5-flash-latest', tier: 'Free/Paid', desc: 'Latest stable Flash model' },
        { name: 'gemini-1.5-flash', tier: 'Free/Paid', desc: 'Stable Flash model' },
        { name: 'gemini-1.5-pro-latest', tier: 'Paid', desc: 'Latest Pro model' },
        { name: 'gemini-1.5-pro', tier: 'Paid', desc: 'Stable Pro model' },
        { name: 'gemini-pro', tier: 'Free/Paid', desc: 'Legacy Pro model' },
        { name: 'gemini-2.0-flash-exp', tier: 'Experimental', desc: 'Newest experimental' }
    ];

    let workingModel = null;

    for (const modelInfo of models) {
        try {
            console.log(`Testing: ${modelInfo.name}...`);
            const model = genAI.getGenerativeModel({ model: modelInfo.name });
            
            // Simple test with minimal tokens
            const result = await model.generateContent('Hi');
            const response = result.response.text();
            
            if (response) {
                console.log(`✅ ${modelInfo.name} - WORKING`);
                console.log(`   Tier: ${modelInfo.tier}`);
                console.log(`   Description: ${modelInfo.desc}`);
                console.log(`   Response: "${response.substring(0, 50)}..."\n`);
                
                if (!workingModel) {
                    workingModel = modelInfo.name;
                }
            }
        } catch (error) {
            if (error.message.includes('quota') || error.message.includes('429')) {
                console.log(`⚠️  ${modelInfo.name} - RATE LIMITED`);
                console.log(`   You've exceeded the free tier quota for this model\n`);
            } else if (error.message.includes('not found') || error.message.includes('404')) {
                console.log(`❌ ${modelInfo.name} - NOT AVAILABLE`);
                console.log(`   This model doesn't exist or isn't accessible\n`);
            } else if (error.message.includes('permission') || error.message.includes('403')) {
                console.log(`🔒 ${modelInfo.name} - NO ACCESS`);
                console.log(`   Requires paid tier or special access\n`);
            } else {
                console.log(`❌ ${modelInfo.name} - ERROR`);
                console.log(`   ${error.message.substring(0, 80)}\n`);
            }
        }
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('========================================');
    console.log('Summary & Recommendations');
    console.log('========================================\n');

    if (workingModel) {
        console.log(`✅ GOOD NEWS! You have access to: ${workingModel}\n`);
        console.log('Update your .env file:');
        console.log(`AI_MODEL=${workingModel}\n`);
    } else {
        console.log('⚠️  RATE LIMIT ISSUE DETECTED\n');
        console.log('Your API key has hit the free tier rate limits.\n');
        console.log('Free Tier Limits:');
        console.log('- 15 requests per minute');
        console.log('- 1,500 requests per day');
        console.log('- 1 million tokens per day\n');
        
        console.log('Solutions:\n');
        console.log('1. WAIT: Rate limits reset after the time period');
        console.log('   - Per minute limits reset in 60 seconds');
        console.log('   - Daily limits reset at midnight UTC\n');
        
        console.log('2. UPGRADE: Get a paid API key');
        console.log('   - Visit: https://ai.google.dev/pricing');
        console.log('   - Pay-as-you-go pricing available');
        console.log('   - Much higher rate limits\n');
        
        console.log('3. USE DIFFERENT MODEL: Try gemini-1.5-flash');
        console.log('   - Has separate rate limits');
        console.log('   - Good for production use\n');
    }

    console.log('========================================');
    console.log('Current API Key Info');
    console.log('========================================\n');
    console.log(`API Key: ${API_KEY.substring(0, 20)}...${API_KEY.substring(API_KEY.length - 5)}`);
    console.log('Tier: Free (based on rate limit errors)');
    console.log('Status: Rate limited - wait or upgrade\n');

    console.log('========================================');
    console.log('What to do now?');
    console.log('========================================\n');
    console.log('Option 1: Wait 1 hour and try again');
    console.log('Option 2: Get a new API key from https://makersuite.google.com/app/apikey');
    console.log('Option 3: Upgrade to paid tier for higher limits');
    console.log('Option 4: Use a different model (gemini-1.5-flash)\n');

    console.log('For AI Pair Programming to work, you need:');
    console.log('- A working Gemini API key');
    console.log('- Available quota (not rate limited)');
    console.log('- Model set in .env file\n');
}

checkAccess().then(() => {
    console.log('Check complete!\n');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
