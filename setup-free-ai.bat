@echo off
echo ========================================
echo Free AI Providers - Quick Setup
echo ========================================
echo.
echo This will help you set up FREE AI providers
echo for AI Pair Programming.
echo.
echo ========================================
echo Recommended: Groq (Best Free Option)
echo ========================================
echo.
echo Why Groq?
echo - 100%% FREE (no credit card needed)
echo - Super fast (fastest inference available)
echo - High limits (30 requests/minute)
echo - Great for coding
echo.
echo How to get Groq API key:
echo 1. Visit: https://console.groq.com/
echo 2. Sign up (free, takes 1 minute)
echo 3. Go to API Keys section
echo 4. Create new API key
echo 5. Copy the key
echo.
pause
echo.
echo Opening Groq console in browser...
start https://console.groq.com/
echo.
echo ========================================
echo After you get your API key:
echo ========================================
echo.
echo 1. Open .env file
echo 2. Find: GROQ_API_KEY=
echo 3. Paste your key after the =
echo 4. Save the file
echo 5. Run: START_AI_PAIR.bat
echo.
echo ========================================
echo Alternative Free Options:
echo ========================================
echo.
echo Mistral AI: https://console.mistral.ai/
echo Hugging Face: https://huggingface.co/settings/tokens
echo.
echo See FREE_AI_PROVIDERS_GUIDE.md for details
echo.
echo ========================================
echo Testing Current Configuration
echo ========================================
echo.
node test-ai-providers.js
echo.
pause
