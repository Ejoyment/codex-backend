@echo off
echo ========================================
echo FORCE RENDER REDEPLOY
echo ========================================
echo.

cd deployment

echo Making a small change to force redeploy...
echo. >> README.md
echo # Last updated: %date% %time% >> README.md
echo.

echo Adding changes...
git add .
echo.

echo Committing...
git commit -m "Force redeploy - remove Facebook OAuth"
echo.

echo Pushing to GitHub...
git push
echo.

echo ========================================
echo DONE! Render will redeploy now.
echo ========================================
echo.
echo Go to Render dashboard and watch the deployment.
echo.
pause
