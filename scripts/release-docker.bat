@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0release-docker.ps1" %*
