@echo off
REM Start the local server and open the app in a browser.
cd /d "%~dp0"
python tools\serve.py --port 8000
