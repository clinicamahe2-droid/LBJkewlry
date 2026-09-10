@echo off
cd /d "%~dp0"
start "" cmd /c "node server/index.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3480/admin"
