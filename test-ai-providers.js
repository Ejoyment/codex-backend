require('dotenv').config();
const aiService = require('./utils/aiService');

async function testProviders() {
    console.log('========================================');
    console.log('Testing All AI Providers');
    console.log('========================================\n');

    const providers = aiService.getProviderInfo();
    
    console.log('📊 Configured Providers:\n');
    providers.forEach(p => {
        const status = p.available ? '✅ Available' : '❌ Not configured';
        console.log(`${p.displayName.padEnd(25)} | ${status} | Model: ${p.model || 'N/A'}`);
    });

    const available = providers.filter(p => p.available);
    
    if (available.length === 0) {
        console.log('\n⚠️  No AI providers configured!');
        console.log('\nTo get started:');
        console.log('1. Get a FREE Groq API key: https://console.groq.com/');
        console.log('2. Add to .env: GROQ_API_KEY=your_key_here');
        console.log('3. Restart and test again\n');
        console.log('See FREE_AI_PROVIDERS_GUIDE.md for all options.');
        return;
    }

    console.log(`\n✅ ${available.length} provider(s) available\n`);
    console.log('========================================');
    console.log('Testing Providers');
    console.log('========================================\n');

    for (const provider of available) {
        console.log(`Testing: ${provider.displayName}...`);
        console.log(`Model: ${provider.model}`);
        
        try {
            const startTime = Date.now();
            
            // Simple test message
            const result = await aiService.chat([
                { role: 'user', content: 'Write a simple hello world function in JavaScript' }
            ]);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            if (result.success) {
                console.log(`✅ SUCCESS (${duration}ms)`);
                console.log(`Provider used: ${result.provider}`);
                console.log(`Response preview: ${result.content.substring(0, 100)}...`);
                console.log(`Code blocks found: ${result.codeBlocks.length}\n`);
            } else {
                console.log(`❌ FAILED: ${result.error}\n`);
            }
        } catch (error) {
            console.log(`❌ ERROR: ${error.message}\n`);
        }
        
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log('========================================');
    console.log('Recommendations');
    console.log('========================================\n');

    if (available.length === 1) {
        console.log(`You have 1 provider configured: ${available[0].displayName}`);
        console.log('\n💡 Tip: Configure multiple providers for automatic fallback!');
        console.log('See FREE_AI_PROVIDERS_GUIDE.md for more options.\n');
    } else {
        console.log(`✅ Great! You have ${available.length} providers configured.`);
        console.log('The system will automatically fallback if one fails.\n');
    }

    console.log('Recommended FREE providers:');
    console.log('1. Groq (fastest, highest limits) - https://console.groq.com/');
    console.log('2. Mistral AI (good quality) - https://console.mistral.ai/');
    console.log('3. Hugging Face (most models) - https://huggingface.co/\n');

    console.log('========================================');
    console.log('Your Configuration');
    console.log('========================================\n');
    console.log(`AI_PROVIDER: ${process.env.AI_PROVIDER || 'auto'}`);
    console.log(`Available providers: ${available.map(p => p.name).join(', ')}`);
    console.log(`Fallback enabled: ${available.length > 1 ? 'Yes' : 'No'}\n`);

    console.log('✅ AI Pair Programming is ready to use!');
    console.log('Start backend: START_AI_PAIR.bat\n');
}

testProviders().then(() => {
    console.log('Test complete!\n');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error.message);
    process.exit(1);
});
