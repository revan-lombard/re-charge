@echo off
REM Starts the Re-Charge AI hub on this PC. Put a shortcut to this file in the Windows Startup folder
REM (Win+R, shell:startup) so it starts with the PC. LM Studio's server starts by itself once set up
REM (README.md, step 2). The PC only calls out to the website: nothing here is open to the internet.
REM Your hub password lives in hub-token.txt next to this file (never commit or share it).
cd /d "%~dp0"
if not exist hub-token.txt (
  echo Make hub-token.txt first: see README.md, step 4.
  pause
  exit /b 1
)
set /p HUB_TOKEN=<hub-token.txt
REM Call transcription (README.md, "Call transcription"): Whisper in its own minimised window
if exist whisper\whisper-server.exe start "Whisper" /min whisper\whisper-server.exe -m whisper\ggml-small.bin --host 127.0.0.1 --port 8080 --convert -t 4
REM Only for the older direct way (LOCAL_AI_URL set in Supabase, README.md "The older way"): remove the REM below
REM start "Re-Charge gateway" /min cmd /c "set HUB_TOKEN=%HUB_TOKEN%&& set HUB_UPSTREAM=http://127.0.0.1:1234&& python proxy.py"
:loop
python worker.py
echo The hub worker stopped. Restarting in 5 seconds...
timeout /t 5 >nul
goto loop
