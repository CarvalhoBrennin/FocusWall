@echo off
setlocal

set "ROOT=%~dp0"
set "PROJECT_ROOT=%ROOT%"
set "APP=%PROJECT_ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"

if not exist "%APP%" (
  set "PROJECT_ROOT=%ROOT%wallpaper\"
  set "APP=%PROJECT_ROOT%src-tauri\target\release\focus-desktop-dashboard.exe"
)

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

for /f %%I in ('powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$project = '%PROJECT_ROOT%'.TrimEnd('\');" ^
  "$exe = '%APP%';" ^
  "if (-not (Test-Path $project)) { 'missing_project'; exit }" ^
  "$sourcePatterns = @('*.html','*.css','*.js','*.json','*.rs','*.toml','*.mjs','*.svelte');" ^
  "$files = Get-ChildItem -Path $project -Recurse -File -Include $sourcePatterns | Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\|\\target\\' };" ^
  "if (-not (Test-Path $exe)) { 'rebuild'; exit }" ^
  "$latestSource = ($files | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1).LastWriteTimeUtc;" ^
  "$exeTime = (Get-Item $exe).LastWriteTimeUtc;" ^
  "if ($latestSource -gt $exeTime) { 'rebuild' } else { 'run' }"') do set "ACTION=%%I"

if /i "%ACTION%"=="missing_project" (
  echo Pasta do projeto nao encontrada:
  echo %PROJECT_ROOT%
  pause
  exit /b 1
)

if /i "%ACTION%"=="rebuild" (
  echo Alteracoes detectadas. Atualizando o executavel...
  pushd "%PROJECT_ROOT%"
  call npm run tauri:build
  if errorlevel 1 (
    popd
    echo.
    echo Falha ao atualizar o app.
    pause
    exit /b 1
  )
  popd
)

if not exist "%APP%" (
  echo Executavel nao encontrado em:
  echo %APP%
  pause
  exit /b 1
)

start "" "%APP%"
