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

REM Padrao: compila o release local, abre o release, depois tenta instalado.
REM Nunca abra o .exe de debug direto; ele depende do Vite em 127.0.0.1:1420.
call :BUILD_RELEASE
if errorlevel 1 exit /b %ERRORLEVEL%
goto USE_RELEASE

:USE_RELEASE
call :BUILD_RELEASE
if errorlevel 1 exit /b %ERRORLEVEL%
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

:BUILD_RELEASE
if "%SKIP_FOCUSWALL_BUILD%"=="1" exit /b 0
set "SKIP_FOCUSWALL_BUILD=1"

tasklist /FI "IMAGENAME eq focus-desktop-dashboard.exe" 2>NUL | find /I "focus-desktop-dashboard.exe" >NUL
if not errorlevel 1 (
    echo Fechando Focus Dashboard em execucao para atualizar o build...
    taskkill /F /IM focus-desktop-dashboard.exe >NUL 2>NUL
)

echo Compilando Focus Dashboard...
call npm run tauri:build
if errorlevel 1 (
    echo.
    echo Falha ao compilar o Focus Dashboard.
    echo Feche o aplicativo se ele ainda estiver aberto e tente novamente.
    echo.
    pause
    exit /b %ERRORLEVEL%
)
exit /b 0

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
