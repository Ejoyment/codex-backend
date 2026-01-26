@echo off
echo.
echo ╔════════════════════════════════════════════════════════════╗
echo ║         Installing AI Pair Programming Dependencies       ║
echo ╚════════════════════════════════════════════════════════════╝
echo.
echo Installing required packages:
echo   - @google/generative-ai (Gemini AI)
echo   - @octokit/rest (GitHub API)
echo   - socket.io (Real-time communication)
echo   - diff (Code diff generation)
echo.
npm install
echo.
echo ════════════════════════════════════════════════════════════
echo.
echo ✓ Dependencies installed!
echo.
echo Next steps:
echo   1. Get Gemini API key from: https://makersuite.google.com/app/apikey
echo   2. Add to .env: GEMINI_API_KEY=your_key_here
echo   3. Ensure GitHub integration is connected
echo   4. Restart backend: start-backend.bat
echo.
pause
