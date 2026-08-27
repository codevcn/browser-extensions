@echo off
echo Dang bien dich TypeScript...
npx tsc
if %ERRORLEVEL% EQU 0 (
    echo Bien dich thanh cong!
) else (
    echo Co loi xay ra trong qua trinh bien dich!
)
pause
