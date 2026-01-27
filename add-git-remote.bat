@echo off
echo ========================================
echo ADD CORRECT GIT REMOTE
echo ========================================
echo.

cd deployment

echo IMPORTANT: Replace YOUR_USERNAME with your actual GitHub username!
echo.
set /p username="Enter your GitHub username: "
echo.

echo Adding remote origin...
git remote add origin https://github.com/%username%/codex-inc-backend.git
echo.

echo Checking remote...
git remote -v
echo.

echo ========================================
echo DONE! Remote added successfully.
echo ========================================
echo.
echo Now you can push with: git push -u origin main
echo.
pause
