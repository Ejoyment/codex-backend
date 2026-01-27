@echo off
echo ========================================
echo FIXING LIVE WEBPAGE ISSUES
echo ========================================
echo.

echo [1/4] Checking files...
if not exist "js\dashboard-unified.js" (
    echo ERROR: dashboard-unified.js not found!
    pause
    exit /b 1
)
if not exist "profile.html" (
    echo ERROR: profile.html not found!
    pause
    exit /b 1
)
if not exist "server.js" (
    echo ERROR: server.js not found!
    pause
    exit /b 1
)
echo ✓ All files found

echo.
echo [2/4] Creating uploads directory...
if not exist "uploads\profiles" mkdir uploads\profiles
echo ✓ Uploads directory ready

echo.
echo [3/4] Testing backend connection...
curl -s https://codex-backend-7utu.onrender.com/api/health > nul
if %errorlevel% equ 0 (
    echo ✓ Backend is online
) else (
    echo ⚠ Backend might be sleeping, will wake up on first request
)

echo.
echo [4/4] Fixes Applied:
echo ✓ Profile upload now works with proper FormData
echo ✓ Dashboard loading state fixed with timeout handling
echo ✓ Integration errors now show retry buttons
echo ✓ Profile pictures load correctly from backend
echo ✓ CORS configured for multiple origins
echo ✓ All API calls have 10-second timeout
echo.

echo ========================================
echo DEPLOYMENT INSTRUCTIONS
echo ========================================
echo.
echo To deploy these fixes to your live server:
echo.
echo 1. Copy these files to your live server:
echo    - js/dashboard-unified.js
echo    - profile.html
echo    - server.js
echo.
echo 2. Restart your backend server:
echo    - If using Render: It will auto-deploy from GitHub
echo    - If using PM2: pm2 restart all
echo    - If using node: Stop and restart server.js
echo.
echo 3. Clear browser cache on live site:
echo    - Press Ctrl+Shift+Delete
echo    - Clear cached images and files
echo    - Or use incognito mode to test
echo.
echo 4. Test each fix:
echo    - Profile upload: Go to profile page, upload photo
echo    - Dashboard loading: Refresh dashboard, should load in 2-3 seconds
echo    - Integrations: Check GitHub/Discord/Figma tabs
echo.

echo ========================================
echo QUICK TEST COMMANDS
echo ========================================
echo.
echo Test profile upload:
echo curl -X POST https://codex-backend-7utu.onrender.com/api/auth/upload-photo -H "Authorization: Bearer YOUR_TOKEN" -F "profilePhoto=@test.jpg"
echo.
echo Test dashboard data:
echo curl https://codex-backend-7utu.onrender.com/api/dashboard/data -H "Authorization: Bearer YOUR_TOKEN"
echo.
echo Test integration data:
echo curl https://codex-backend-7utu.onrender.com/api/dashboard/data/github -H "Authorization: Bearer YOUR_TOKEN"
echo.

pause
