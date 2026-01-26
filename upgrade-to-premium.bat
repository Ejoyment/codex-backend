@echo off
echo ========================================
echo Manual Premium Upgrade Tool
echo ========================================
echo.

if "%1"=="" (
    echo Usage: upgrade-to-premium.bat email [tier]
    echo Example: upgrade-to-premium.bat user@example.com professional
    echo.
    echo Available tiers: professional, enterprise
    echo.
    pause
    exit /b 1
)

node upgrade-to-premium.js %1 %2
pause
