@echo off
echo ========================================
echo   DEPLOYING RESEND EMAIL SERVICE
echo ========================================
echo.

echo Step 1: Committing changes to GitHub...
git add .
git commit -m "Add Resend email service for production OTP delivery"
git push origin main

echo.
echo ========================================
echo   DEPLOYMENT COMPLETE!
echo ========================================
echo.
echo Backend: Auto-deployed to Render (2-3 minutes)
echo.
echo NEXT STEPS:
echo.
echo 1. Create Resend Account
echo    Visit: https://resend.com
echo.
echo 2. Get API Key
echo    Dashboard -^> API Keys -^> Create API Key
echo.
echo 3. Add to Render
echo    Dashboard -^> codex-backend -^> Environment
echo    Add: RESEND_API_KEY=re_your_key_here
echo.
echo 4. Test Email
echo    Try signing up at: https://codexincenterprise.online
echo.
echo Full guide: RESEND_EMAIL_SETUP.md
echo.
pause
