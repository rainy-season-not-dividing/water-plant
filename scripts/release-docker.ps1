param(
    [string]$Version,
    [ValidateSet('patch', 'minor', 'major')]
    [string]$Bump = 'patch',
    [switch]$PushLatest = $true,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$deployComposePath = Join-Path $repoRoot 'deploy\docker-compose.yml'
$frontendContext = Join-Path $repoRoot 'frontend'
$backendContext = Join-Path $repoRoot 'backend'

$frontendImage = 'docker.whyfjz.com/water-plant/water-plant-frontend'
$backendImage = 'docker.whyfjz.com/water-plant/water-plant-backend'

function Get-CurrentVersion {
    param([string]$ComposePath)

    $content = Get-Content -Raw -LiteralPath $ComposePath
    $match = [regex]::Match($content, 'water-plant-frontend:(v\d+\.\d+\.\d+)')
    if (-not $match.Success) {
        throw "Failed to parse current version from $ComposePath."
    }
    return $match.Groups[1].Value
}

function Get-NextVersion {
    param(
        [string]$CurrentVersion,
        [string]$BumpType
    )

    $parts = $CurrentVersion.TrimStart('v').Split('.')
    if ($parts.Length -ne 3) {
        throw "Invalid current version format: $CurrentVersion"
    }

    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]

    switch ($BumpType) {
        'major' {
            $major += 1
            $minor = 0
            $patch = 0
        }
        'minor' {
            $minor += 1
            $patch = 0
        }
        default {
            $patch += 1
        }
    }

    return "v$major.$minor.$patch"
}

function Update-ComposeVersion {
    param(
        [string]$ComposePath,
        [string]$NewVersion
    )

    $content = Get-Content -Raw -LiteralPath $ComposePath
    $content = [regex]::Replace($content, '(water-plant-frontend:)(v\d+\.\d+\.\d+)', "`$1$NewVersion")
    $content = [regex]::Replace($content, '(water-plant-backend:)(v\d+\.\d+\.\d+)', "`$1$NewVersion")
    Set-Content -LiteralPath $ComposePath -Value $content -Encoding utf8
}

function Invoke-LoggedCommand {
    param(
        [string]$Command,
        [string[]]$Arguments,
        [string]$WorkingDirectory
    )

    $display = "$Command $($Arguments -join ' ')"
    Write-Host ">> $display" -ForegroundColor Cyan

    if ($DryRun) {
        return
    }

    Push-Location $WorkingDirectory
    try {
        & $Command @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed: $display"
        }
    }
    finally {
        Pop-Location
    }
}

$currentVersion = Get-CurrentVersion -ComposePath $deployComposePath
$targetVersion = if ($Version) { $Version } else { Get-NextVersion -CurrentVersion $currentVersion -BumpType $Bump }

if ($targetVersion -notmatch '^v\d+\.\d+\.\d+$') {
    throw "Target version must use the format v<major>.<minor>.<patch>, for example v0.1.1"
}

$frontendVersionTag = "${frontendImage}:${targetVersion}"
$backendVersionTag = "${backendImage}:${targetVersion}"
$frontendLatestTag = "${frontendImage}:latest"
$backendLatestTag = "${backendImage}:latest"

Write-Host "Current version: $currentVersion" -ForegroundColor Yellow
Write-Host "Target version: $targetVersion" -ForegroundColor Green

Invoke-LoggedCommand -Command 'docker' -Arguments @('build', '-t', $frontendVersionTag, '.') -WorkingDirectory $frontendContext
Invoke-LoggedCommand -Command 'docker' -Arguments @('build', '-t', $backendVersionTag, '.') -WorkingDirectory $backendContext

if ($PushLatest) {
    Invoke-LoggedCommand -Command 'docker' -Arguments @('tag', $frontendVersionTag, $frontendLatestTag) -WorkingDirectory $repoRoot
    Invoke-LoggedCommand -Command 'docker' -Arguments @('tag', $backendVersionTag, $backendLatestTag) -WorkingDirectory $repoRoot
}

Invoke-LoggedCommand -Command 'docker' -Arguments @('push', $frontendVersionTag) -WorkingDirectory $repoRoot
Invoke-LoggedCommand -Command 'docker' -Arguments @('push', $backendVersionTag) -WorkingDirectory $repoRoot

if ($PushLatest) {
    Invoke-LoggedCommand -Command 'docker' -Arguments @('push', $frontendLatestTag) -WorkingDirectory $repoRoot
    Invoke-LoggedCommand -Command 'docker' -Arguments @('push', $backendLatestTag) -WorkingDirectory $repoRoot
}

if (-not $DryRun) {
    Update-ComposeVersion -ComposePath $deployComposePath -NewVersion $targetVersion
    Write-Host "Updated deploy/docker-compose.yml image version to $targetVersion" -ForegroundColor Green
}
else {
    Write-Host "DryRun mode: deploy/docker-compose.yml was not modified" -ForegroundColor Yellow
}

Write-Host "Release completed." -ForegroundColor Green
