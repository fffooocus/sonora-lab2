@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Для запуску встановіть Node.js 22 або новіший: https://nodejs.org/
  pause
  exit /b 1
)
echo SONORA — Лабораторна робота №2
echo Відкрийте http://127.0.0.1:4173
echo Для зупинки натисніть Ctrl+C у цьому вікні.
start "" "http://127.0.0.1:4173"
node scripts/serve.mjs
pause
