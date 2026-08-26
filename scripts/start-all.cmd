@echo off
REM Wrapper so start-all works when LocalMachine execution policy is AllSigned.
cd /d "%~dp0\.."
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1" %*
