<#
.SYNOPSIS
  Run ai-jian-koubo doctor.js --force via node (Windows).
#>
$ErrorActionPreference = "Stop"
$Skill = "D:\coding\ai-jian-koubo"
$Doctor = Join-Path $Skill "scripts\doctor.js"

if (-not (Test-Path $Doctor)) { throw "Missing: $Doctor" }

Push-Location $Skill
try {
  Write-Host "Running: node scripts/doctor.js --force"
  node "scripts\doctor.js" --force
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
