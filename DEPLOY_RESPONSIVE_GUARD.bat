@echo off
echo ========================================
echo   DEPLOYING RESPONSIVE GUARD FEATURE
echo ========================================
echo.

echo Step 1: Committing changes to GitHub...
git add .
git commit -m "Add responsive guard: Desktop-only dashboard with mobile/small window blocking"
git push origin main

echo.
echo Step 2: Preparing files for Spaceship upload...
if not exist "UPLOAD_TO_SPACESHIP" mkdir UPLOAD_TO_SPACESHIP
if not exist "UPLOAD_TO_SPACESHIP\css" mkdir UPLOAD_TO_SPACESHIP\css
if not exist "UPLOAD_TO_SPACESHIP\js" mkdir UPLOAD_TO_SPACESHIP\js

echo Copying updated files...
copy "dashboard.html" "UPLOAD_TO_SPACESHIP\dashboard.html"
copy "settings.html" "UPLOAD_TO_SPACESHIP\settings.html"
copy "profile.html" "UPLOAD_TO_SPACESHIP\profile.html"
copy "tasks.html" "UPLOAD_TO_SPACESHIP\tasks.html"
copy "source-code.html" "UPLOAD_TO_SPACESHIP\source-code.html"
copy "workspace.html" "UPLOAD_TO_SPACESHIP\workspace.html"
copy "css\responsive-guard.css" "UPLOAD_TO_SPACESHIP\css\responsive-guard.css"
copy "js\responsive-guard.js" "UPLOAD_TO_SPACESHIP\js\responsive-guard.js"

echo.
echo ========================================
echo   DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Backend: Auto-deployed to Render (2-3 minutes)
echo Frontend: Upload these files to Spaceship:
echo.
echo   1. dashboard.html
echo   2. settings.html
echo   3. profile.html
echo   4. tasks.html
echo   5. source-code.html
echo   6. workspace.html
echo   7. css/responsive-guard.css (NEW)
echo   8. js/responsive-guard.js (NEW)
echo.
echo Files are ready in: UPLOAD_TO_SPACESHIP folder
echo.
pause
