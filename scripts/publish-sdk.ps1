# SDK 배포 스크립트
# 사용법: .\scripts\publish-sdk.ps1 -Package spring|summer|python|all

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet("spring", "summer", "python", "all")]
    [string]$Package
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot

Write-Host "=== Seizn SDK Publisher ===" -ForegroundColor Cyan

# Load environment variables from Dendron .env.local
$EnvFile = "C:\Users\admin\Dendron\.env.local"
if (Test-Path $EnvFile) {
    Get-Content $EnvFile | ForEach-Object {
        if ($_ -match "^([^#=]+)=(.*)$") {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim().Trim('"')
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
        }
    }
    Write-Host "Loaded environment from $EnvFile" -ForegroundColor Green
}

function Publish-NpmPackage {
    param([string]$PackageName)

    $PackageDir = Join-Path $ProjectRoot "packages\$PackageName-sdk"

    if (-not (Test-Path $PackageDir)) {
        Write-Host "Package directory not found: $PackageDir" -ForegroundColor Red
        return
    }

    Write-Host "`nPublishing @seizn/$PackageName to npm..." -ForegroundColor Yellow

    Push-Location $PackageDir
    try {
        # Set npm token
        $env:NODE_AUTH_TOKEN = $env:NPM_TOKEN

        # Build
        Write-Host "Building..." -ForegroundColor Gray
        npm install
        npm run build

        # Publish
        Write-Host "Publishing..." -ForegroundColor Gray
        npm publish --access public

        Write-Host "@seizn/$PackageName published successfully!" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

function Publish-PyPiPackage {
    $PackageDir = Join-Path $ProjectRoot "packages\seizn-python"

    if (-not (Test-Path $PackageDir)) {
        Write-Host "Package directory not found: $PackageDir" -ForegroundColor Red
        return
    }

    Write-Host "`nPublishing seizn to PyPI..." -ForegroundColor Yellow

    Push-Location $PackageDir
    try {
        # Clean previous builds
        if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
        if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
        if (Test-Path "*.egg-info") { Remove-Item -Recurse -Force "*.egg-info" }

        # Build
        Write-Host "Building..." -ForegroundColor Gray
        python -m pip install --upgrade build twine
        python -m build

        # Publish
        Write-Host "Publishing..." -ForegroundColor Gray
        $env:TWINE_USERNAME = "__token__"
        $env:TWINE_PASSWORD = $env:PYPI_TOKEN
        python -m twine upload dist/*

        Write-Host "seizn published to PyPI successfully!" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

# Execute based on package selection
switch ($Package) {
    "spring" {
        Publish-NpmPackage -PackageName "spring"
    }
    "summer" {
        Publish-NpmPackage -PackageName "summer"
    }
    "python" {
        Publish-PyPiPackage
    }
    "all" {
        Publish-NpmPackage -PackageName "spring"
        Publish-NpmPackage -PackageName "summer"
        Publish-PyPiPackage
    }
}

Write-Host "`n=== Done ===" -ForegroundColor Cyan
