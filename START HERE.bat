@echo off
cd /d "%%~dp0"
start "design kit server" /min python serve.py 8127 --no-browser
timeout /t 2 >nul
start "" http://127.0.0.1:8127/kit.html
