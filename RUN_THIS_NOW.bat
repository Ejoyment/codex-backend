@echo off
cls
echo.
echo ========================================
echo   PREMIUM UPGRADE FIX
echo ========================================
echo.
echo This will activate your premium subscription
echo.
echo ========================================
echo.
pause
echo.
echo Upgrading your account...
echo.
node upgrade-to-premium.js layefaebono@gmail.com professional
echo.
echo ========================================
echo.
echo Verifying upgrade...
echo.
node check-subscription.js layefaebono@gmail.com
echo.
echo ========================================
echo   NEXT STEPS:
echo ========================================
echo.
echo 1. Go to: http://localhost:5500/dashboard.html
echo 2. Press Ctrl+F5 to refresh
echo 3. You should see "Professional" badge!
echo.
echo ========================================
echo.
pause
