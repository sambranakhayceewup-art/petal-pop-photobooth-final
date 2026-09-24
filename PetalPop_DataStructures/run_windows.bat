@echo off
cd /d "%~dp0"
py -m pip install -r requirements.txt
if errorlevel 1 (echo Please install Python and check your internet connection. & pause & exit /b 1)
start "" http://localhost:5000
py server.py
pause
