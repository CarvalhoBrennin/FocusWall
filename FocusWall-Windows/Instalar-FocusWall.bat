@echo off
setlocal
chcp 65001 >nul
title Instalacao do FocusWall

set "INSTALLER=%~dp0Instalar-Focus-Setup.exe"

if not exist "%INSTALLER%" (
    echo.
    echo ERRO: O arquivo "Instalar-Focus-Setup.exe" nao foi encontrado.
    echo Mantenha este arquivo na mesma pasta do instalador e extraia o ZIP por completo antes de executar.
    echo.
    pause
    exit /b 1
)

echo.
echo Abrindo o instalador do FocusWall...
echo.
start "" /wait "%INSTALLER%"
exit /b %errorlevel%
