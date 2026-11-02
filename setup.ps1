param(
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host "  CareerOS Desktop Suite - Full Setup & Model Installer" -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

# 1. Check & install external CLI dependencies via winget if missing
function Ensure-WingetTool {
    param(
        [string]$CommandName,
        [string]$WingetId,
        [string]$FriendlyName,
        [string]$FallbackPath = ""
    )
    if ((Get-Command $CommandName -ErrorAction SilentlyContinue) -or ($FallbackPath -and (Test-Path $FallbackPath))) {
        Write-Host "[OK] $FriendlyName is installed." -ForegroundColor Green
        return
    }
    Write-Host "[INSTALL] $FriendlyName not found. Installing via winget ($WingetId)..." -ForegroundColor Yellow
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        winget install --id $WingetId -e --accept-source-agreements --accept-package-agreements
    } else {
        Write-Host "[WARN] winget not available. Please install $FriendlyName manually." -ForegroundColor Red
    }
}

Ensure-WingetTool -CommandName "ffmpeg" -WingetId "Gyan.FFmpeg" -FriendlyName "FFmpeg & FFprobe" -FallbackPath "C:\Users\User\Documents\SOVHQDawnload\ffmpeg-7.1.1-essentials_build\ffmpeg-7.1.1-essentials_build\bin\ffmpeg.exe"
Ensure-WingetTool -CommandName "yt-dlp" -WingetId "yt-dlp.yt-dlp" -FriendlyName "yt-dlp Video Downloader" -FallbackPath "C:\Users\User\Documents\SOVHQDawnload\Ytdlp\yt-dlp.exe"
Ensure-WingetTool -CommandName "aws" -WingetId "Amazon.AWSCLI" -FriendlyName "AWS CLI"
Ensure-WingetTool -CommandName "node" -WingetId "OpenJS.NodeJS.LTS" -FriendlyName "Node.js & npm"

# 2. Hugging Face Read Token (.env)
if (-not $Token -and (Test-Path ".env")) {
    $envLines = Get-Content ".env"
    foreach ($line in $envLines) {
        if ($line -match "^\s*HF_TOKEN\s*=\s*(.+)$") {
            $Token = $Matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

if (-not $Token) {
    Write-Host "`nBefore continuing, make sure you have accepted the free PyAnnote licenses on Hugging Face:" -ForegroundColor Yellow
    Write-Host "  1. https://huggingface.co/pyannote/speaker-diarization-3.1"
    Write-Host "  2. https://huggingface.co/pyannote/segmentation-3.0"
    Write-Host "  3. https://huggingface.co/pyannote/speaker-diarization-community-1"
    $Token = Read-Host "Enter your Hugging Face Read Token (hf_...)"
}

if ($Token) {
    "HF_TOKEN=$Token`nCAREEROS_PORT=8420" | Set-Content ".env" -Encoding UTF8
    Write-Host "[OK] Saved HF_TOKEN to .env" -ForegroundColor Green
}

# 3. Resolve or create Python virtual environment
$PythonExe = ""
if (Test-Path ".\venv\Scripts\python.exe") {
    $PythonExe = ".\venv\Scripts\python.exe"
} elseif (Test-Path "..\MeIncRemidner\MeInc_ReminderService\venv\Scripts\python.exe") {
    $PythonExe = "..\MeIncRemidner\MeInc_ReminderService\venv\Scripts\python.exe"
    Write-Host "[OK] Using shared Python virtual environment: $PythonExe" -ForegroundColor Green
} else {
    Write-Host "Creating Python virtual environment..." -ForegroundColor Cyan
    python -m venv venv
    $PythonExe = ".\venv\Scripts\python.exe"
}

Write-Host "`nInstalling Python backend & AI dependencies (faster-whisper, pyannote.audio, yt-dlp)..." -ForegroundColor Cyan
& $PythonExe -m pip install --upgrade pip
& $PythonExe -m pip install -r requirements.txt

# 4. Pre-download and verify Whisper + PyAnnote models from Hugging Face
Write-Host "`nDownloading & verifying Whisper + PyAnnote models from Hugging Face..." -ForegroundColor Cyan
if ($Token) {
    & $PythonExe backend\verify_models.py --model base --token $Token
} else {
    & $PythonExe backend\verify_models.py --model base
}

# 5. Install & build React frontend
Write-Host "`nInstalling & building React frontend..." -ForegroundColor Cyan
Push-Location frontend
npm install
npm run build
Pop-Location

Write-Host "`n[SUCCESS] CareerOS & all Hugging Face models are installed and ready!" -ForegroundColor Green
Write-Host "Run .\launch-careeros.bat to open the desktop app." -ForegroundColor Cyan
