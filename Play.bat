@echo off
title Graveyard Shift - game server
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve.ps1" -Open
