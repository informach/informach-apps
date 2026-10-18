@echo off
rem Starts the tool through PowerShell: not an npm shim.
powershell -NoProfile -File "%~dp0tool.ps1" %*
