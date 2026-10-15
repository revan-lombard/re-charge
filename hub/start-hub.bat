@echo off
REM Starts the Re-Charge AI hub gateway. Put this in the Windows Startup folder
REM (Win+R, shell:startup) so it starts with the PC. LM Studio's server and Tailscale
REM start by themselves once set up (README.md).
REM Your hub password lives in hub-token.txt next to this file (never commit or share it).
cd /d "%~dp0"
if not exist hub-token.txt (
  echo Make hub-token.txt first: see README.md, step 4.
  pause
  exit /b 1
)
set /p HUB_TOKEN=<hub-token.txt
set HUB_UPSTREAM=http://127.0.0.1:1234
:loop
python proxy.py
echo The gateway stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
