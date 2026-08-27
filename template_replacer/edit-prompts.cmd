@echo off
echo Dang mo cac file prompt trong Notepad...
cd /d "%~dp0\prompts"
for %%f in (*.txt) do (
    start notepad "%%f"
)
exit
