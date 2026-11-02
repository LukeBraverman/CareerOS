param(
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "  CareerOS Desktop Suite - Setup" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

if (-not $Token -and -not (Test-Path ".env")) {
    $Token = Read-Host "Enter your Hugging Face Read Token (hf_...)"
}

if ($Token) {
    "HF_TOKEN=$Token`nCAREEROS_PORT=8420" | Set-Content ".env" -Encoding UTF8
    Write-Host "[OK] Saved HF_TOKEN to .env" -ForegroundColor Green
}

if (-not (Test-Path "venv")) {
    Write-Host "Creating Python virtual environment..."
    python -m venv venv
}

Write-Host "Installing Python backend dependencies..."
.\venv\Scripts\pip.exe install --upgrade pip
.\venv\Scripts\pip.exe install -r requirements.txt

Write-Host "Installing & building React frontend..."
Push-Location frontend
npm install
npm run build
Pop-Location

Write-Host "`n[SUCCESS] CareerOS is ready! Run .\launch-careeros.bat to open the desktop app." -ForegroundColor Green
