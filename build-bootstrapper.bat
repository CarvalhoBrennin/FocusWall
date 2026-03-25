@echo off
setlocal

echo === Compilando Focus Bootstrapper ===
echo.

where cargo >nul 2>&1
if %errorlevel% neq 0 (
    echo ERRO: cargo nao encontrado. Instale o Rust: https://www.rust-lang.org/tools/install
    pause
    exit /b 1
)

echo Compilando em modo release...
cargo build --release --manifest-path tools\bootstrapper\Cargo.toml
if %errorlevel% neq 0 (
    echo.
    echo ERRO: Falha na compilacao.
    pause
    exit /b 1
)

set "SOURCE=tools\bootstrapper\target\release\focus-bootstrapper.exe"
set "DEST=Instalar-Focus-Setup.exe"

if not exist "%SOURCE%" (
    echo ERRO: Executavel nao encontrado em %SOURCE%
    pause
    exit /b 1
)

copy /Y "%SOURCE%" "%DEST%" >nul
echo.
echo Bootstrapper compilado com sucesso: %DEST%
echo.
pause
