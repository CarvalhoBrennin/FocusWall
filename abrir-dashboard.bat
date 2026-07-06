@echo off
setlocal EnableDelayedExpansion

set "ROOT=%~dp0"
cd /d "%ROOT%"

if exist "%USERPROFILE%\.cargo\bin" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

set "INSTALLED=%LOCALAPPDATA%\FocusWall\focus-desktop-dashboard.exe"
set "RELEASE_EXE=%ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
set "DIST_INDEX=%ROOT%dist\index.html"

if /I "%~1"=="--debug" goto DEV_MODE
if /I "%~1"=="--installed" goto USE_INSTALLED
if /I "%~1"=="--build" goto FORCE_BUILD_AND_OPEN
if /I "%~1"=="--release" goto OPEN_APP

REM Padrao: abre se o build estiver atualizado; recompila so se codigo mudou.
goto OPEN_APP

:OPEN_APP
call :CHECK_BUILD_STALE
if errorlevel 1 goto REBUILD_AND_OPEN
echo Build atual. Abrindo sem recompilar...
goto LAUNCH_APP

:REBUILD_AND_OPEN
echo Alteracoes detectadas no codigo. Recompilando...
call :DO_TAURI_BUILD
if errorlevel 1 exit /b %ERRORLEVEL%
goto LAUNCH_APP

:FORCE_BUILD_AND_OPEN
call :DO_TAURI_BUILD
if errorlevel 1 exit /b %ERRORLEVEL%
goto LAUNCH_APP

:LAUNCH_APP
if not exist "%RELEASE_EXE%" goto TRY_INSTALLED
if not exist "%DIST_INDEX%" goto NEED_BUILD
echo Abrindo FocusWall...
call :START_ASSISTANT
start "" "%RELEASE_EXE%"
exit /b 0

:TRY_INSTALLED
if /I "%~1"=="--release" goto NOT_FOUND

:USE_INSTALLED
if exist "%INSTALLED%" (
    echo Abrindo FocusWall instalado...
    call :START_ASSISTANT
    start "" "%INSTALLED%"
    exit /b 0
)
goto NOT_FOUND

:DEV_MODE
echo Modo desenvolvimento: iniciando Vite + Tauri...
call :START_ASSISTANT
call :ENSURE_NPM_DEPS
if errorlevel 1 exit /b %ERRORLEVEL%
call npm run tauri:dev
exit /b %ERRORLEVEL%

:START_ASSISTANT
call :CHECK_OLLAMA_ONLINE
if not errorlevel 1 exit /b 0
call :RESOLVE_OLLAMA
if errorlevel 1 exit /b 0
echo Iniciando assistente local (Ollama)...
start "" /B "%OLLAMA_CMD%" serve >NUL 2>NUL
exit /b 0

:CHECK_OLLAMA_ONLINE
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >NUL 2>NUL
exit /b %ERRORLEVEL%

:RESOLVE_OLLAMA
set "OLLAMA_CMD="
where ollama >NUL 2>&1
if not errorlevel 1 (
    set "OLLAMA_CMD=ollama"
    exit /b 0
)
if exist "%LOCALAPPDATA%\Programs\Ollama\ollama.exe" (
    set "OLLAMA_CMD=%LOCALAPPDATA%\Programs\Ollama\ollama.exe"
    exit /b 0
)
if exist "%ProgramFiles%\Ollama\ollama.exe" (
    set "OLLAMA_CMD=%ProgramFiles%\Ollama\ollama.exe"
    exit /b 0
)
if exist "%ProgramFiles(x86)%\Ollama\ollama.exe" (
    set "OLLAMA_CMD=%ProgramFiles(x86)%\Ollama\ollama.exe"
    exit /b 0
)
echo Assistente local nao encontrado. Instale o Ollama ou use o botao "Iniciar assistente" na aba Assistente.
exit /b 1

:CHECK_BUILD_STALE
if not exist "%RELEASE_EXE%" exit /b 1
if not exist "%DIST_INDEX%" exit /b 1
where node >NUL 2>&1
if errorlevel 1 exit /b 1
node "tools\is-build-stale.mjs"
exit /b %ERRORLEVEL%

:CLOSE_RUNNING
set "CLOSE_ATTEMPTS=0"
:CLOSE_RETRY
tasklist /FI "IMAGENAME eq focus-desktop-dashboard.exe" 2>NUL | find /I "focus-desktop-dashboard.exe" >NUL
if errorlevel 1 exit /b 0
set /A CLOSE_ATTEMPTS+=1
if !CLOSE_ATTEMPTS! GTR 8 goto CLOSE_FAILED
if !CLOSE_ATTEMPTS! EQU 1 echo Fechando FocusWall em execucao para atualizar o build...
taskkill /F /IM focus-desktop-dashboard.exe >NUL 2>NUL
ping 127.0.0.1 -n 2 >NUL
goto CLOSE_RETRY

:CLOSE_FAILED
echo.
echo Nao foi possivel fechar FocusWall apos varias tentativas.
echo Feche o aplicativo manualmente e tente novamente.
echo.
pause
exit /b 1

:ENSURE_NPM_DEPS
if exist "%ROOT%node_modules\.bin\tauri.cmd" exit /b 0
echo Dependencias npm nao encontradas. Instalando...
if exist "%ROOT%package-lock.json" goto NPM_CI
call npm install
goto NPM_DEPS_DONE
:NPM_CI
call npm ci
:NPM_DEPS_DONE
if errorlevel 1 goto NPM_DEPS_FAIL
if not exist "%ROOT%node_modules\.bin\tauri.cmd" goto NPM_TAURI_MISSING
exit /b 0

:NPM_DEPS_FAIL
echo.
echo Falha ao instalar dependencias npm.
echo Verifique se Node.js 20 ou superior esta instalado.
echo.
pause
exit /b 1

:NPM_TAURI_MISSING
echo.
echo Tauri CLI nao encontrado apos npm install.
echo Execute manualmente na pasta do projeto: npm install
echo.
pause
exit /b 1

:DO_TAURI_BUILD
call :ENSURE_NPM_DEPS
if errorlevel 1 exit /b %ERRORLEVEL%
call :CLOSE_RUNNING
if errorlevel 1 exit /b %ERRORLEVEL%
echo Compilando FocusWall...
call npm run tauri:build
if errorlevel 1 goto BUILD_FAILED
exit /b 0

:BUILD_FAILED
echo.
echo Falha ao compilar o FocusWall.
echo Feche o aplicativo se ele ainda estiver aberto e tente novamente.
echo.
pause
exit /b %ERRORLEVEL%

:NEED_BUILD
echo Frontend nao compilado. Execute:
echo   abrir-dashboard.bat --build
echo.
pause
exit /b 1

:NOT_FOUND
echo FocusWall nao encontrado.
echo.
echo Desenvolvedor:
echo   abrir-dashboard.bat           - abre; recompila se codigo mudou
echo   abrir-dashboard.bat --build   - forca recompilacao
echo   abrir-dashboard.bat --debug   - modo dev com hot reload
echo   npm run open:dev
echo.
echo Usuario final: execute o instalador Instalar-Focus-Setup.exe
echo.
pause
exit /b 1
