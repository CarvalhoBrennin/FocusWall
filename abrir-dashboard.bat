@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
cd /d "%ROOT%"

if not exist "%ROOT%package.json" goto PROJECT_NOT_FOUND
if not exist "%ROOT%src-tauri\Cargo.toml" goto TAURI_NOT_FOUND

if /I "%~1"=="--dev" goto DEV_MODE
if /I "%~1"=="--debug" goto DEV_MODE
if /I "%~1"=="--run" goto RUN_MODE
if /I "%~1"=="--rebuild" goto RELEASE_MODE
if /I "%~1"=="--help" goto HELP

goto OPEN_MODE

:DEV_MODE
echo Iniciando FocusWall em modo de desenvolvimento...
call :ENSURE_TOOLS
if errorlevel 1 goto FAILED
call :START_ASSISTANT
call "%ROOT%node_modules\.bin\tauri.cmd" dev
set "EXIT_CODE=%ERRORLEVEL%"
goto FINISH

:RUN_MODE
call :ENSURE_TOOLS
if errorlevel 1 goto FAILED
set "APP=%ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
if not exist "%APP%" (
    echo Executavel release nao encontrado. Gerando o build agora...
    goto RELEASE_MODE
)
goto START_APP

:OPEN_MODE
call :ENSURE_TOOLS
if errorlevel 1 goto FAILED
set "APP=%ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
if not exist "%APP%" goto RELEASE_MODE
if not exist "%ROOT%dist\index.html" goto RELEASE_MODE
node "%ROOT%tools\is-build-stale.mjs"
if errorlevel 1 goto RELEASE_MODE
goto START_APP

:RELEASE_MODE
echo Preparando o build do FocusWall...
call :ENSURE_TOOLS
if errorlevel 1 goto FAILED

call :STOP_RUNNING_APP
if errorlevel 1 goto FAILED

echo Compilando o aplicativo desktop...
call "%ROOT%node_modules\.bin\tauri.cmd" build --no-bundle
if errorlevel 1 goto BUILD_FAILED

set "APP=%ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
if not exist "%APP%" goto APP_NOT_FOUND

:START_APP
call :START_ASSISTANT
echo Abrindo o FocusWall...
start "FocusWall" "%APP%"
set "EXIT_CODE=0"
goto FINISH

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
exit /b 1

:ENSURE_TOOLS
where node >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao foi encontrado no PATH.
    echo Instale o Node.js e abra um novo terminal.
    exit /b 1
)

where npm >nul 2>&1
if errorlevel 1 (
    echo ERRO: npm nao foi encontrado no PATH.
    echo Reinstale o Node.js ou corrija o PATH.
    exit /b 1
)

where cargo >nul 2>&1
if errorlevel 1 (
    echo ERRO: Rust Cargo nao foi encontrado no PATH.
    echo Instale o Rust pelo site https://rustup.rs/ e abra um novo terminal.
    exit /b 1
)

if exist "%ROOT%node_modules\.bin\tauri.cmd" exit /b 0

echo Dependencias npm nao encontradas. Instalando...
if exist "%ROOT%package-lock.json" (
    call npm.cmd ci
) else (
    call npm.cmd install
)
if errorlevel 1 (
    echo ERRO: Nao foi possivel instalar as dependencias npm.
    exit /b 1
)

if not exist "%ROOT%node_modules\.bin\tauri.cmd" (
    echo ERRO: Tauri CLI nao foi encontrado apos a instalacao.
    exit /b 1
)
exit /b 0

:STOP_RUNNING_APP
set "FOCUSWALL_APP=%ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$target = [IO.Path]::GetFullPath($env:FOCUSWALL_APP); Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'focus-desktop-dashboard.exe' -and $_.ExecutablePath -eq $target } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }; exit 0"
set "FOCUSWALL_APP="
timeout /t 1 /nobreak >nul
exit /b 0

:PROJECT_NOT_FOUND
echo ERRO: package.json nao foi encontrado.
echo Execute este arquivo a partir da pasta do projeto FocusWall.
set "EXIT_CODE=1"
goto FAILED

:TAURI_NOT_FOUND
echo ERRO: src-tauri\Cargo.toml nao foi encontrado.
echo A pasta do projeto esta incompleta.
set "EXIT_CODE=1"
goto FAILED

:BUILD_FAILED
echo ERRO: O build do FocusWall falhou.
set "EXIT_CODE=1"
goto FAILED

:APP_NOT_FOUND
echo ERRO: O executavel nao foi gerado em:
echo %ROOT%src-tauri\target\release\focus-desktop-dashboard.exe
set "EXIT_CODE=1"
goto FAILED

:HELP
echo Uso:
echo   abrir-dashboard.bat          Abre o release e recompila apenas se necessario.
echo   abrir-dashboard.bat --run    Abre o ultimo release sem recompilar.
echo   abrir-dashboard.bat --rebuild Forca um novo build release.
echo   abrir-dashboard.bat --dev    Inicia o modo desenvolvimento com hot reload.
echo   abrir-dashboard.bat --help   Mostra esta ajuda.
set "EXIT_CODE=0"
goto FINISH

:FAILED
if not defined EXIT_CODE set "EXIT_CODE=1"
echo.
pause

:FINISH
if not defined EXIT_CODE set "EXIT_CODE=0"
exit /b %EXIT_CODE%
