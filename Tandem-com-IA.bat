@echo off
chcp 65001 >nul
title Tandem Browser + IA Local (Qwen3-VL)
cd /d "D:\projetos\NavegadorTandemBrowser"

echo ═══════════════════════════════════════════════
echo   TANDEM BROWSER + IA LOCAL (Qwen3-VL)
echo ═══════════════════════════════════════════════
echo.

REM 1. Garantir que Ollama está rodando
echo [1/3] Verificando Ollama...
tasklist /FI "IMAGENAME eq ollama.exe" 2>NUL | find /I "ollama.exe" >NUL
if errorlevel 1 (
    echo   Ollama nao esta rodando. Iniciando...
    start "" /B ollama serve
    timeout /t 4 /nobreak >nul
) else (
    echo   Ollama ja esta rodando.
)

REM 2. Iniciar Tandem em background
echo [2/3] Iniciando Tandem Browser...
tasklist /FI "WINDOWTITLE eq *Tandem*" 2>NUL | find /I "electron" >NUL
if errorlevel 1 (
    start "Tandem Browser" /B cmd /C "npm start"
    echo   Aguardando Tandem subir API (8 segundos)...
    timeout /t 8 /nobreak >nul
) else (
    echo   Tandem ja esta aberto.
)

REM 3. Iniciar a ponte Ollama-Tandem
echo [3/3] Iniciando ponte IA-Tandem...
echo.
node bridge\ollama-bridge.js

pause
