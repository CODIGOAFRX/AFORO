@echo off
cd /d "%~dp0"
docker compose up -d --build --wait
if errorlevel 1 (
  echo No se pudo arrancar AFORO. Comprueba que Docker Desktop este abierto.
  pause
  exit /b 1
)
start "" "http://localhost:8088"
