@echo off
cls
echo.
echo ========================================
echo   RESTART BACKEND AND TEST
echo ========================================
echo.
echo This will help you restart the backend
echo with the new fixes applied.
echo.
echo ========================================
echo.
echo STEP 1: Stop Current Backend
echo ========================================
echo.
echo Please do this manually:
echo 1. Go to your backend terminal
echo 2. Press Ctrl+C to stop it
echo 3. Come back here and press any key
echo.
pause
echo.
echo ========================================
echo STEP 2: Start Backend
echo ========================================
echo.
echo Starting backend with new fixes...
echo.
start cmd /k "cd /d %~dp0 && start-backend.bat"
echo.
echo Backend is starting in a new window...
echo Wait 5 seconds for it to fully start...
timeout /t 5 /nobreak >nul
echo.
echo ========================================
echo STEP 3: Test Backend
echo ========================================
echo.
call test-backend.bat
echo.
echo ========================================
echo STEP 4: Check Your Subscription
echo ========================================
echo.
node check-subscription.js layefaebono@gmail.com
echo.
echo ========================================
echo STEP 5: Test in Browser
echo ========================================
echo.
echo Now open your browser (Incognito mode):
echo.
echo 1. Press Ctrl+Shift+N (Incognito)
echo 2. Go to: http://localhost:5500/test-premium-access.html
echo 3. Should show your features as a list
echo 4. Click "Test Code Editor Access"
echo 5. Should say "Access granted!"
echo.
echo ========================================
echo.
pause
