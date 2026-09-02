@echo off
setlocal
cd /d "%~dp0"

echo Shortcuts Extension v4.0.0 - OCR setup
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0setup-ocr-assets.ps1"
set "EXITCODE=%ERRORLEVEL%"

echo.
if not "%EXITCODE%"=="0" (
  echo OCR setup failed with exit code %EXITCODE%.
  echo Check your internet connection and run this file again.
) else (
  echo OCR setup completed successfully.
)

echo.
pause
exit /b %EXITCODE%
