@echo off
REM Quick deploy without prompts - uses default commit message

echo Auto-deploying to GitHub...

git add .
git commit -m "Auto-deploy: %date% %time%"
git push origin main

if %errorlevel% neq 0 (
    git push origin master
)

echo.
echo Deployed! Check Render dashboard for deployment status.
echo https://dashboard.render.com
