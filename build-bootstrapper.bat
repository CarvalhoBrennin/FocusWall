@echo off
setlocal

echo === Criando instalador portatil do Focus Dashboard ===
echo.

where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: cargo nao encontrado. Instale o Rust: https://www.rust-lang.org/tools/install
    pause
    exit /b 1
)

set "RELEASE_BIN=src-tauri\target\release\focus-desktop-dashboard.exe"

if not exist "%RELEASE_BIN%" (
    echo ERRO: Executavel compilado nao encontrado em %RELEASE_BIN%
    echo Execute 'npm run tauri:build' primeiro para gerar o executavel.
    pause
    exit /b 1
)

echo [1/3] Compilando bootstrapper...
cargo build --release --manifest-path tools\bootstrapper\Cargo.toml
if %errorlevel% neq 0 (
    echo ERRO: Falha na compilacao do bootstrapper.
    pause
    exit /b 1
)

set "BOOTSTRAPPER=tools\bootstrapper\target\release\focus-bootstrapper.exe"
set "OUTDIR=FocusWall-Installer"

echo.
echo [2/3] Preparando pasta de distribuicao...

if exist "%OUTDIR%" rmdir /S /Q "%OUTDIR%"
mkdir "%OUTDIR%"
mkdir "%OUTDIR%\release"

copy /Y "%BOOTSTRAPPER%" "%OUTDIR%\Instalar-Focus-Setup.exe" >nul
if %errorlevel% neq 0 (
    echo ERRO: Falha ao copiar bootstrapper.
    pause
    exit /b 1
)

copy /Y "%RELEASE_BIN%" "%OUTDIR%\release\" >nul
if %errorlevel% neq 0 (
    echo ERRO: Falha ao copiar executavel do Focus Dashboard.
    pause
    exit /b 1
)

echo.
echo [3/3] Pronto!
echo.
echo Instalador portatil criado em: %CD%\%OUTDIR%\
echo.
echo Estrutura:
echo   %OUTDIR%\Instalar-Focus-Setup.exe    (instalador)
echo   %OUTDIR%\release\%~nxRELEASE_BIN%    (aplicativo)
echo.
echo Para distribuir, compacte a pasta '%OUTDIR%' e envie o arquivo .zip.
echo O usuario final so precisa executar 'Instalar-Focus-Setup.exe'.
echo.
echo A unica dependencia para o usuario final e o WebView2 Runtime,
echo que ja vem pre-instalado no Windows 10 1809+ e Windows 11.
echo O instalador baixa automaticamente se necessario.
echo.
pause
