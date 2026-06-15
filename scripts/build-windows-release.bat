@echo off
setlocal EnableExtensions

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows-release.ps1"
exit /b %ERRORLEVEL%
endlocal
