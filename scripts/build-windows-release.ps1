$ErrorActionPreference = "Stop"

$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$Frontend = Join-Path $Root "frontend"
$Backend = Join-Path $Root "backend"
$ProjectParent = Split-Path $Root -Parent
$DailyList = Join-Path $ProjectParent "DailyList"
$MatchedOutDir = Get-ChildItem -Path $DailyList -Directory -Filter "20260612-*" | Select-Object -First 1
if (-not $MatchedOutDir) {
    throw "Cannot find output directory matching $DailyList\20260612-*"
}
$OutDir = $MatchedOutDir.FullName
$ReleaseDir = Join-Path $OutDir "water-plant-windows"
$ReleaseVenv = Join-Path $Root ".venv-release"
$ReleasePython = Join-Path $ReleaseVenv "Scripts\python.exe"

Write-Host "[1/5] Build frontend"
Push-Location $Frontend
try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install failed" }

    $env:VITE_API_MODE = "live"
    $env:VITE_API_BASE_URL = "/api"
    $env:VITE_AI_BASE_URL = "/api"
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "npm run build failed" }
}
finally {
    Pop-Location
}

Write-Host "[2/5] Prepare Python dependencies"
Push-Location $Backend
try {
    if (-not (Test-Path $ReleasePython)) {
        python -m venv $ReleaseVenv
        if ($LASTEXITCODE -ne 0) { throw "venv create failed" }
    }

    & $ReleasePython -m pip install --upgrade pip "setuptools<81" wheel
    if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed" }

    & $ReleasePython -m pip install -r requirements.txt pyinstaller
    if ($LASTEXITCODE -ne 0) { throw "pip install failed" }

    Write-Host "[3/5] Build backend exe"
    & $ReleasePython -m PyInstaller --clean --noconfirm water_plant.spec
    if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }
}
finally {
    Pop-Location
}

Write-Host "[4/5] Copy release files"
if (Test-Path $ReleaseDir) {
    Remove-Item -LiteralPath $ReleaseDir -Recurse -Force
}
New-Item -ItemType Directory -Path $ReleaseDir -Force | Out-Null
Copy-Item -Path (Join-Path $Backend "dist\water-plant\*") -Destination $ReleaseDir -Recurse -Force
Copy-Item -Path (Join-Path $PSScriptRoot "start-water-plant.bat") -Destination (Join-Path $ReleaseDir "start-water-plant.bat") -Force
Copy-Item -Path (Join-Path $PSScriptRoot "README-windows-release.txt") -Destination (Join-Path $ReleaseDir "README.txt") -Force

$EnvExample = Join-Path $Backend ".env.example"
$EnvFile = Join-Path $Backend ".env"
if (Test-Path $EnvExample) {
    Copy-Item -Path $EnvExample -Destination (Join-Path $ReleaseDir ".env.example") -Force
}
if (Test-Path $EnvFile) {
    Copy-Item -Path $EnvFile -Destination (Join-Path $ReleaseDir ".env") -Force
}

Write-Host "[5/5] Done"
Write-Host "Release package: $ReleaseDir"
