@echo off
title Graveyard Shift - build shareable copies
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
pause
