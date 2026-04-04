@echo off
echo Dang bien dich TypeScript sang JavaScript...
call npx tsc
if %ERRORLEVEL% equ 0 (
    echo Hoan tat bien dich thanh cong!
) else (
    echo Co loi xay ra khi bien dich.
)
