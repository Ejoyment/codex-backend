@echo off
echo ========================================
echo PUSH FIX TO GITHUB
echo ========================================
echo.

cd deployment

echo Step 1: Adding changes...
git add .
echo.

echo Step 2: Committing changes...
git commit -m "Remove Facebook OAuth - fix deployment error"
echo.

echo Step 3: Pushing to GitHub...
git push
echo.

echo ========================================
echo DONE! Changes pushed to GitHub.
echo ========================================
echo.
echo Render will automatically redeploy in 1-2 minutes.
echo Check your Render dashboard to see the deployment progress.
echo.
pause
