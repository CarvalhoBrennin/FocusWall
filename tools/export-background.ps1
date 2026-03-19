param(
  [int]$Width = 2560,
  [int]$Height = 1440,
  [string]$BaseName = "focus-background-quadhd"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptDir
$htmlPath = Join-Path $scriptDir "background-render.html"
$exportDir = Join-Path $projectRoot "exports"
$pngPath = Join-Path $exportDir ($BaseName + ".png")
$jpgPath = Join-Path $exportDir ($BaseName + ".jpg")

if (-not (Test-Path $htmlPath)) {
  throw "Arquivo HTML de render nao encontrado: $htmlPath"
}

if (-not (Test-Path $exportDir)) {
  New-Item -ItemType Directory -Path $exportDir | Out-Null
}

$edgeCandidates = @(
  "msedge",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
)

$edgePath = $null
foreach ($candidate in $edgeCandidates) {
  $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($cmd) {
    $edgePath = $cmd.Source
    break
  }
  if (Test-Path $candidate) {
    $edgePath = $candidate
    break
  }
}

if (-not $edgePath) {
  throw "Microsoft Edge nao encontrado."
}

$uri = [System.Uri]::new($htmlPath).AbsoluteUri

& $edgePath `
  --headless `
  --disable-gpu `
  --hide-scrollbars `
  --force-color-profile=srgb `
  --window-size="$Width,$Height" `
  "--screenshot=$pngPath" `
  $uri | Out-Null

if (-not (Test-Path $pngPath)) {
  throw "Falha ao gerar PNG em $pngPath"
}

Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile($pngPath)
$bitmap = New-Object System.Drawing.Bitmap($image.Width, $image.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([System.Drawing.Color]::Black)
$graphics.DrawImage($image, 0, 0, $image.Width, $image.Height)

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$params = New-Object System.Drawing.Imaging.EncoderParameters(1)
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]100)
$bitmap.Save($jpgPath, $codec, $params)

$graphics.Dispose()
$bitmap.Dispose()
$image.Dispose()
$params.Dispose()

Write-Output "PNG: $pngPath"
Write-Output "JPG: $jpgPath"
