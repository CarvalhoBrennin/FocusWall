@echo off
setlocal

set "ROOT=%~dp0"
cd /d "%ROOT%"

set "INSTALLED=%LOCALAPPDATA%\FocusWall\focus-desktop-dashboard.exe"
set "RELEASE=%ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
set "DIST=%ROOT%dist\index.html"

if /I "%~1"=="--debug" goto DEV_MODE
if /I "%~1"=="--installed" goto USE_INSTALLED
if /I "%~1"=="--release" goto USE_RELEASE

REM Padrao: release local, depois instalado.
REM Nunca abra o .exe de debug direto — ele depende do Vite em 127.0.0.1:1420.
goto USE_RELEASE

:USE_RELEASE
if not exist "%RELEASE%" goto TRY_INSTALLED
if not exist "%DIST%" goto NEED_BUILD
echo Abrindo Focus Dashboard...
start "" "%RELEASE%"
exit /b 0

:TRY_INSTALLED
if /I "%~1"=="--release" goto NOT_FOUND

:USE_INSTALLED
if exist "%INSTALLED%" (
    echo Abrindo Focus Dashboard instalado...
    start "" "%INSTALLED%"
    exit /b 0
)
goto NOT_FOUND

:DEV_MODE
echo Modo desenvolvimento: iniciando Vite + Tauri...
call npm run tauri:dev
exit /b %ERRORLEVEL%

:NEED_BUILD
echo Frontend nao compilado. Execute:
echo   npm run tauri:build
echo.
pause
exit /b 1

:NOT_FOUND
echo Focus Dashboard nao encontrado.
echo.
echo Desenvolvedor:
echo   npm run tauri:build          ^(gera o .exe standalone^)
echo   abrir-dashboard.bat --debug  ^(modo dev com hot reload^)
echo   npm run open:dev
echo.
echo Usuario final: execute o instalador (Instalar-Focus-Setup.exe).
echo.
pause
exit /b 1
