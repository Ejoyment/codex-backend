@echo off
echo ========================================
echo FIX GITHUB REPOSITORY STRUCTURE
echo ========================================
echo.
echo This will restructure your GitHub repo so Render can read it correctly.
echo.
pause

cd deployment

echo Step 1: Remove old remote...
git remote remove origin
echo.

echo Step 2: Initialize fresh repo...
rmdir /s /q .git
git init
echo.

echo Step 3: Add all files...
git add .
echo.

echo Step 4: Commit...
git commit -m "Production deployment - fixed structure"
echo.

echo Step 5: Set branch to main...
git branch -M main
echo.

set /p username="Enter your GitHub username: "
echo.

echo Step 6: Add remote...
git remote add origin https://github.com/%username%/codex-inc-backend.git
echo.

echo Step 7: Force push (this will overwrite the repo)...
git push -f origin main
echo.

echo ========================================
echo DONE! Repository restructured.
echo ========================================
echo.
echo Now Render will see the correct files!
echo Go to Render and click "Manual Deploy"
echo.
pause
