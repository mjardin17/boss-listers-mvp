@echo off
rem Double-click this file once. It turns on the automatic inventory sync (every 15 minutes).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-inventory-sync-task.ps1"
echo.
pause
