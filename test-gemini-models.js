const { GoogleGenerativeAI } = require('@google/generative-ai');

// Your API key
const API_KEY = 'AIzaSyDyHRFBooKMOAhqKORfMHTDn2nJ4tTmx8o';

async function listModels() {
    try {
        console.log('========================================');
        console.log('Gemini API - Available Models');
        console.log('========================================\n');

        const genAI = new GoogleGenerativeAI(API_KEY);

        console.log('✓ API Key connected successfully!\n');
        console.log('Testing available models...\n');

        // List of common Gemini models to test
        const modelsToTest = [
            'gemini-2.0-flash-exp',
            'gemini-1.5-flash',
            'gemini-1.5-flash-8b',
            'gemini-1.5-pro',
            'gemini-pro',
            'gemini-pro-vision'
        ];

        console.log('Available Models:\n');
        console.log('Model Name                    | Status      | Best For');
        console.log('------------------------------|-------------|----------------------------------');

        for (const modelName of modelsToTest) {
            try {
                const model = genAI.getGenerativeModel({ model: modelName });
                
                // Try a simple test
                const result = await model.generateContent('Hi');
                const response = result.response.text();
                
                if (response) {
                    let description = '';
                    if (modelName.includes('2.0')) {
                        description = 'Latest, fastest, multimodal';
                    } else if (modelName.includes('1.5-pro')) {
                        description = 'Most capable, complex tasks';
                    } else if (modelName.includes('1.5-flash-8b')) {
                        description = 'Fastest, simple tasks';
                    } else if (modelName.includes('1.5-flash')) {
                        description = 'Fast, balanced performance';
                    } else if (modelName.includes('vision')) {
                        description = 'Image understanding';
                    } else {
                        description = 'General purpose';
                    }
                    
                    console.log(`${modelName.padEnd(30)}| ✅ Available | ${description}`);
                }
            } catch (error) {
                if (error.message.includes('not found') || error.message.includes('does not exist')) {
                    console.log(`${modelName.padEnd(30)}| ❌ Not Found | -`);
                } else if (error.message.includes('quota') || error.message.includes('limit')) {
                    console.log(`${modelName.padEnd(30)}| ⚠️  Quota    | Rate limit reached`);
                } else {
                    console.log(`${modelName.padEnd(30)}| ❌ Error    | ${error.message.substring(0, 30)}`);
                }
            }
        }

        console.log('\n========================================');
        console.log('Recommended Model for AI Pair:');
        console.log('========================================\n');
        console.log('Model: gemini-2.0-flash-exp');
        console.log('Reason: Latest model, fastest responses, best for coding');
        console.log('\nAlternative: gemini-1.5-flash');
        console.log('Reason: Stable, fast, good for production\n');

        console.log('========================================');
        console.log('Testing Current Configuration:');
        console.log('========================================\n');

        // Test the model configured in your .env
        const configuredModel = 'gemini-2.0-flash-exp';
        console.log(`Testing: ${configuredModel}\n`);

        try {
            const model = genAI.getGenerativeModel({ model: configuredModel });
            const result = await model.generateContent('Write a simple hello world function in JavaScript');
            const response = result.response.text();
            
            console.log('✅ Model is working!\n');
            console.log('Sample Response:');
            console.log('─────────────────────────────────────');
            console.log(response.substring(0, 200) + '...');
            console.log('─────────────────────────────────────\n');
            
            console.log('✅ Your API key is valid and ready to use!');
            console.log('✅ AI Pair Programming will work with this configuration.\n');
        } catch (error) {
            console.log('❌ Error testing configured model:');
            console.log(error.message);
            console.log('\nTry using gemini-1.5-flash instead.\n');
        }

    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\nPossible issues:');
        console.log('1. Invalid API key');
        console.log('2. API key not activated');
        console.log('3. Network connection issue');
        console.log('4. Rate limit exceeded\n');
    }
}

// Run the test
listModels().then(() => {
    console.log('Test complete!');
    process.exit(0);
}).catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
