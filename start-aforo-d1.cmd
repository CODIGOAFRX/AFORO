@echo off
cd /d "%~dp0"
call npm --prefix frontend ci
if errorlevel 1 exit /b 1
node cloudflare/build.mjs
if errorlevel 1 exit /b 1
cd cloudflare
call npm ci
if errorlevel 1 exit /b 1
call npm run migrate:local
if errorlevel 1 exit /b 1
echo Abre http://localhost:8787/proyecto/aforo para probar D1 en local.
call npm run dev -- --var DEMO_ENABLED:true
