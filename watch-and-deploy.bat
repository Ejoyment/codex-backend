@echo off
setlocal enabledelayedexpansion

echo ========================================
echo WATCH AND AUTO-DEPLOY
echo ========================================
echo.
echo This script will watch for file changes
echo and automatically deploy to GitHub.
echo.
echo Press Ctrl+C to stop watching
echo.

REM Configuration
set "WATCH_INTERVAL=30"
set "LAST_COMMIT="

:watch_loop
    echo [%date% %time%] Checking for changes...
    
    REM Check if there are any changes
    git status --short > temp_status.txt
    set /p changes=<temp_status.txt
    del temp_status.txt
    
    if not "!changes!"=="" (
        echo.
        echo ========================================
        echo CHANGES DETECTED!
        echo ========================================
        git status --short
        echo.
        
        REM Add all changes
        echo Adding files...
        git add .
        
        REM Commit with timestamp
        set "commit_msg=Auto-deploy: %date% %time%"
        echo Committing: !commit_msg!
        git commit -m "!commit_msg!"
        
        REM Push to GitHub
        echo Pushing to GitHub...
        git push origin main
        if !errorlevel! neq 0 (
            git push origin master
        )
        
        if !errorlevel! equ 0 (
            echo.
            echo ✓ Successfully deployed to GitHub!
            echo ✓ Render will auto-deploy in 2-3 minutes
            echo.
            set "LAST_COMMIT=%date% %time%"
        ) else (
            echo.
            echo ✗ Failed to push to GitHub
            echo.
        )
        
        echo ========================================
        echo.
    )
    
    REM Wait before next check
    timeout /t %WATCH_INTERVAL% /nobreak >nul
    
goto watch_loop
