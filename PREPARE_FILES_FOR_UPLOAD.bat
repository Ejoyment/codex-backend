@echo off
echo.
echo ╔════════════════════════════════════════════════╗
echo ║   PREPARING FILES FOR SPACESHIP UPLOAD        ║
echo ╚════════════════════════════════════════════════╝
echo.

REM Create a folder for files to upload
if not exist "UPLOAD_TO_SPACESHIP" mkdir UPLOAD_TO_SPACESHIP
if not exist "UPLOAD_TO_SPACESHIP\js" mkdir UPLOAD_TO_SPACESHIP\js

echo [1/5] Copying dashboard.html...
copy /Y dashboard.html UPLOAD_TO_SPACESHIP\
echo ✓ Done

echo.
echo [2/5] Copying profile.html...
copy /Y profile.html UPLOAD_TO_SPACESHIP\
echo ✓ Done

echo.
echo [3/5] Copying settings.html...
copy /Y settings.html UPLOAD_TO_SPACESHIP\
echo ✓ Done

echo.
echo [4/5] Copying js/dashboard-unified.js...
copy /Y js\dashboard-unified.js UPLOAD_TO_SPACESHIP\js\
echo ✓ Done

echo.
echo [5/5] Copying js/api.js...
copy /Y js\api.js UPLOAD_TO_SPACESHIP\js\
echo ✓ Done

echo.
echo ╔════════════════════════════════════════════════╗
echo ║              FILES READY TO UPLOAD!            ║
echo ╚════════════════════════════════════════════════╝
echo.
echo All files are in the "UPLOAD_TO_SPACESHIP" folder
echo.
echo Next steps:
echo 1. Open FileZilla
echo 2. Connect to: ftp.codexincenterprise.online
echo 3. Upload files from UPLOAD_TO_SPACESHIP folder to:
echo    - HTML files → /public_html/
echo    - js folder → /public_html/js/
echo.
echo Files to upload:
echo   dashboard.html
echo   profile.html
echo   settings.html
echo   js/dashboard-unified.js
echo   js/api.js
echo.

pause
