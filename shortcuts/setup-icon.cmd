@echo off
setlocal EnableExtensions

cd /d "%~dp0"

echo.
echo ========================================
echo   Chrome Extension Icon Setup
echo ========================================
echo.

REM ============================================================
REM Usage:
REM   setup-icon.cmd "C:\Users\dell\Pictures\padded-logo.png"
REM
REM Behavior:
REM   - First run:
REM       Creates icons\ if missing
REM       Creates required Chrome extension icons
REM       Adds icon config to manifest.json
REM
REM   - Next runs:
REM       Reuses existing icons\
REM       Overwrites existing icons with the new PNG
REM       Creates only missing required icon files
REM       Updates manifest.json in place
REM
REM   - No backup files
REM   - No temp files
REM ============================================================


REM ============================================================
REM Validate source PNG
REM ============================================================

if "%~1"=="" (
    echo [ERROR] Please provide a PNG file.
    echo.
    echo Example:
    echo   setup-icon.cmd "C:\Users\dell\Pictures\padded-logo.png"
    echo.
    pause
    exit /b 1
)

set "SOURCE_PNG=%~f1"

if not exist "%SOURCE_PNG%" (
    echo [ERROR] Source PNG not found:
    echo   %SOURCE_PNG%
    echo.
    pause
    exit /b 1
)

for %%F in ("%SOURCE_PNG%") do set "EXT=%%~xF"

if /I not "%EXT%"==".png" (
    echo [ERROR] Source image must be a PNG file.
    echo Found:
    echo   %EXT%
    echo.
    pause
    exit /b 1
)


REM ============================================================
REM Validate extension root
REM ============================================================

if not exist "manifest.json" (
    echo [ERROR] manifest.json not found.
    echo.
    echo Put setup-icon.cmd in the root folder of the extension.
    echo.
    echo Current folder:
    echo   %CD%
    echo.
    pause
    exit /b 1
)


REM ============================================================
REM Detect existing icon setup
REM ============================================================

set "FIRST_SETUP=0"

if not exist "icons\" (
    echo [INFO] Icon setup not found.
    echo [INFO] Creating icons folder...
    mkdir "icons"

    if errorlevel 1 (
        echo.
        echo [ERROR] Failed to create:
        echo   %CD%\icons
        echo.
        pause
        exit /b 1
    )

    set "FIRST_SETUP=1"
) else (
    echo [INFO] Existing icons folder detected.
    echo [INFO] Existing icon setup will be updated.
)

set "ICON_DIR=%CD%\icons"
set "MANIFEST_PATH=%CD%\manifest.json"


REM ============================================================
REM Show existing state
REM ============================================================

echo.
echo [1/4] Checking icon files...
echo.

if exist "icons\icon-16.png" (
    echo   UPDATE  icons\icon-16.png
) else (
    echo   CREATE  icons\icon-16.png
)

if exist "icons\icon-32.png" (
    echo   UPDATE  icons\icon-32.png
) else (
    echo   CREATE  icons\icon-32.png
)

if exist "icons\icon-48.png" (
    echo   UPDATE  icons\icon-48.png
) else (
    echo   CREATE  icons\icon-48.png
)

if exist "icons\icon-128.png" (
    echo   UPDATE  icons\icon-128.png
) else (
    echo   CREATE  icons\icon-128.png
)


REM ============================================================
REM Generate / replace icons
REM ============================================================

echo.
echo [2/4] Processing icons...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Add-Type -AssemblyName System.Drawing; $bytes=[System.IO.File]::ReadAllBytes($env:SOURCE_PNG); $stream=New-Object System.IO.MemoryStream(,$bytes); $src=[System.Drawing.Image]::FromStream($stream); $sizes=@(16,32,48,128); foreach($size in $sizes){ $output=Join-Path $env:ICON_DIR ('icon-'+$size+'.png'); $bmp=New-Object System.Drawing.Bitmap($size,$size,[System.Drawing.Imaging.PixelFormat]::Format32bppArgb); $g=[System.Drawing.Graphics]::FromImage($bmp); $g.Clear([System.Drawing.Color]::Transparent); $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic; $g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality; $g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality; $g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality; $ratio=[Math]::Min($size/[double]$src.Width,$size/[double]$src.Height); $w=[Math]::Max(1,[Math]::Round($src.Width*$ratio)); $h=[Math]::Max(1,[Math]::Round($src.Height*$ratio)); $x=[Math]::Floor(($size-$w)/2); $y=[Math]::Floor(($size-$h)/2); $dest=New-Object System.Drawing.Rectangle($x,$y,$w,$h); $g.DrawImage($src,$dest); $g.Dispose(); $bmp.Save($output,[System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose() }; $src.Dispose(); $stream.Dispose()"

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to generate extension icons.
    echo.
    pause
    exit /b 1
)

echo   OK  icons\icon-16.png
echo   OK  icons\icon-32.png
echo   OK  icons\icon-48.png
echo   OK  icons\icon-128.png


REM ============================================================
REM Setup / update manifest.json
REM ============================================================

echo.
echo [3/4] Updating manifest.json...
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $path=$env:MANIFEST_PATH; $manifest=Get-Content -LiteralPath $path -Raw | ConvertFrom-Json; $icons=[ordered]@{'16'='icons/icon-16.png';'32'='icons/icon-32.png';'48'='icons/icon-48.png';'128'='icons/icon-128.png'}; $manifest | Add-Member -NotePropertyName 'icons' -NotePropertyValue $icons -Force; if($null -eq $manifest.action){ $manifest | Add-Member -NotePropertyName 'action' -NotePropertyValue ([PSCustomObject]@{}) -Force }; $manifest.action | Add-Member -NotePropertyName 'default_icon' -NotePropertyValue $icons -Force; $json=$manifest | ConvertTo-Json -Depth 100; [System.IO.File]::WriteAllText($path,$json,(New-Object System.Text.UTF8Encoding($false)))"

if errorlevel 1 (
    echo.
    echo [ERROR] Failed to update manifest.json.
    echo.
    pause
    exit /b 1
)

echo   OK  manifest.json


REM ============================================================
REM Verify icon files + manifest
REM ============================================================

echo.
echo [4/4] Verifying setup...
echo.

set "FAILED=0"

if not exist "icons\icon-16.png" (
    echo [ERROR] Missing icons\icon-16.png
    set "FAILED=1"
)

if not exist "icons\icon-32.png" (
    echo [ERROR] Missing icons\icon-32.png
    set "FAILED=1"
)

if not exist "icons\icon-48.png" (
    echo [ERROR] Missing icons\icon-48.png
    set "FAILED=1"
)

if not exist "icons\icon-128.png" (
    echo [ERROR] Missing icons\icon-128.png
    set "FAILED=1"
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $m=Get-Content -LiteralPath $env:MANIFEST_PATH -Raw | ConvertFrom-Json; if($m.icons.'16' -ne 'icons/icon-16.png'){throw 'Invalid manifest icons.16'}; if($m.icons.'32' -ne 'icons/icon-32.png'){throw 'Invalid manifest icons.32'}; if($m.icons.'48' -ne 'icons/icon-48.png'){throw 'Invalid manifest icons.48'}; if($m.icons.'128' -ne 'icons/icon-128.png'){throw 'Invalid manifest icons.128'}; if($m.action.default_icon.'16' -ne 'icons/icon-16.png'){throw 'Invalid action.default_icon.16'}; if($m.action.default_icon.'32' -ne 'icons/icon-32.png'){throw 'Invalid action.default_icon.32'}; if($m.action.default_icon.'48' -ne 'icons/icon-48.png'){throw 'Invalid action.default_icon.48'}; if($m.action.default_icon.'128' -ne 'icons/icon-128.png'){throw 'Invalid action.default_icon.128'}"

if errorlevel 1 (
    echo [ERROR] manifest.json verification failed.
    set "FAILED=1"
)

if "%FAILED%"=="1" (
    echo.
    echo ========================================
    echo   ICON SETUP FAILED
    echo ========================================
    echo.
    pause
    exit /b 1
)


REM ============================================================
REM Success
REM ============================================================

echo.
echo ========================================
echo   ICON SETUP SUCCESSFUL
echo ========================================
echo.

if "%FIRST_SETUP%"=="1" (
    echo Mode:
    echo   FIRST SETUP
    echo.
    echo The icon structure was created.
) else (
    echo Mode:
    echo   UPDATE
    echo.
    echo Existing icon setup was reused and updated.
)

echo.
echo Source:
echo   %SOURCE_PNG%
echo.
echo Extension icons:
echo   icons\icon-16.png
echo   icons\icon-32.png
echo   icons\icon-48.png
echo   icons\icon-128.png
echo.
echo Manifest:
echo   manifest.json
echo.
echo No backup files were created.
echo No temporary files were created.
echo.

echo Next:
echo   1. Open chrome://extensions
echo   2. Find your extension
echo   3. Click Reload
echo.

pause
endlocal