@echo off
echo ========================================
echo FIX GIT REMOTE ORIGIN
echo ========================================
echo.

cd deployment

echo Step 1: Removing old remote origin...
git remote remove origin
echo.

echo Step 2: Check what you have now...
git remote -v
echo.

echo ========================================
echo DONE! Old remote removed.
echo ========================================
echo.
echo Now run: add-git-remote.bat
echo.
pause
