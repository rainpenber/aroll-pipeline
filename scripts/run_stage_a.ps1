<#
.SYNOPSIS
  Stage A runner: call ai-jian-koubo run_transcribe.sh via Git Bash (default v2-standard / seedasr).

.PARAMETER Video
  Path to koubo wav/video.

.PARAMETER OutDir
  Base output directory (default: current directory). Prefer work trees on Z:.

.PARAMETER Engine
  v2-standard | seedasr | flash | v1-standard | auto  (default v2-standard)
#>
param(
  [Parameter(Mandatory = $true)][string]$Video,
  [string]$OutDir = ".",
  [ValidateSet("v2-standard", "seedasr", "flash", "v1-standard", "auto")]
  [string]$Engine = "v2-standard"
)

$ErrorActionPreference = "Stop"
$ffmpegBin = "C:\App\ffmpeg\bin"
if (Test-Path $ffmpegBin) {
  $env:Path = "$ffmpegBin;" + $env:Path
}
$Bash = "C:\Program Files\Git\bin\bash.exe"
$Skill = "D:\coding\ai-jian-koubo"
$Script = "$Skill/scripts/run_transcribe.sh"

if (-not (Test-Path $Bash)) { throw "Git Bash not found: $Bash" }
if (-not (Test-Path $Script)) { throw "Missing: $Script" }
if (-not (Test-Path $Video)) { throw "Video/audio not found: $Video" }

$flag = switch ($Engine) {
  "v2-standard" { "--v2-standard" }
  "seedasr"     { "--seedasr" }
  "flash"       { "--flash" }
  "v1-standard" { "--v1-standard" }
  "auto"        { "--auto" }
}

# Git Bash needs POSIX-ish paths; convert D:\... -> /d/...
function Convert-ToGitBashPath([string]$p) {
  $full = (Resolve-Path $p).Path
  if ($full -match '^[A-Za-z]:\\') {
    $drive = $full.Substring(0,1).ToLower()
    $rest = $full.Substring(2) -replace '\\','/'
    return "/$drive/$rest"
  }
  return ($full -replace '\\','/')
}

$videoPosix = Convert-ToGitBashPath $Video
$outPosix = Convert-ToGitBashPath $OutDir
$scriptPosix = Convert-ToGitBashPath $Script

Write-Host "Stage A: $Engine"
Write-Host "  video: $videoPosix"
Write-Host "  out:   $outPosix"

& $Bash -lc "bash '$scriptPosix' '$videoPosix' '$outPosix' $flag"
exit $LASTEXITCODE
