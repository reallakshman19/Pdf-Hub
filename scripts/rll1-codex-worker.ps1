[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $HOME '.rll\pdf-hub\codex-worker.json'),
    [switch]$Smoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'reallaksh19/Pdf-Hub'
$WorkerId = 'codex-local'
$AuthorizedLogin = 'reallaksh19'
$RequiredCommonBasis = '22d365839e64c19c7ba606e2cf4edc6b9cc2999f'
$ForbiddenProviderTokenEnv = @(
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN'
)

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "Missing required command: $Name"
    }
    return $command.Source
}

foreach ($Name in $ForbiddenProviderTokenEnv) {
    $Value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        throw "Scheduled RLL refuses provider token environment variable: $Name"
    }
}

if (-not (Test-Path $ConfigPath)) {
    throw "RLL Codex worker config is missing: $ConfigPath. Run scripts\install-rll1-codex-task.ps1 first."
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if ($Config.schema -ne 'PDF_HUB_RLL_CODEX_CONFIG_V2') {
    throw "Unsupported RLL Codex worker config schema: $($Config.schema)"
}
if ($Config.required_common_basis -ne $RequiredCommonBasis) {
    throw "Configured Common basis does not match adapter basis $RequiredCommonBasis."
}
if ($Config.worker_id -ne $WorkerId) {
    throw "Configured RLL worker identity does not match $WorkerId."
}
if ($Config.executor -ne 'codex') {
    throw 'Configured executor must be codex.'
}

$Wsl = Require-Command 'wsl.exe'
$Distro = [string]$Config.wsl_distro
$RepoRoot = [string]$Config.repo_root_wsl
$CommonRoot = [string]$Config.common_repo_root_wsl
$CodexUser = [string]$Config.codex_user
$CodexHome = [string]$Config.codex_home
$LogPath = [string]$Config.log_path

foreach ($Pair in @(
    @{ Name = 'wsl_distro'; Value = $Distro },
    @{ Name = 'repo_root_wsl'; Value = $RepoRoot },
    @{ Name = 'common_repo_root_wsl'; Value = $CommonRoot },
    @{ Name = 'codex_user'; Value = $CodexUser },
    @{ Name = 'codex_home'; Value = $CodexHome },
    @{ Name = 'log_path'; Value = $LogPath }
)) {
    if ([string]::IsNullOrWhiteSpace([string]$Pair.Value)) {
        throw "RLL Codex worker config has no $($Pair.Name)."
    }
}

$LogRoot = Split-Path $LogPath -Parent
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

& $Wsl -d $Distro -- git -C $RepoRoot rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    throw "PDF Hub WSL root is not a Git repository: $RepoRoot"
}

& $Wsl -d $Distro -- git -C $CommonRoot rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Common WSL root is not a Git repository: $CommonRoot"
}

& $Wsl -d $Distro -- gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'WSL provider GitHub CLI authentication is unavailable. Use browser-backed gh auth login in WSL.'
}

& $Wsl -d $Distro -- sudo -n -u $CodexUser env "CODEX_HOME=$CodexHome" "HOME=/home/$CodexUser" codex login status *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Codex authentication is unavailable for dedicated WSL user $CodexUser."
}

& $Wsl -d $Distro -- git -C $CommonRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main in WSL.'
}

& $Wsl -d $Distro -- git -C $CommonRoot merge-base --is-ancestor $RequiredCommonBasis HEAD
if ($LASTEXITCODE -ne 0) {
    $LocalCommonHead = (& $Wsl -d $Distro -- git -C $CommonRoot rev-parse HEAD | Out-String).Trim()
    $RemoteCommonHead = (& $Wsl -d $Distro -- git -C $CommonRoot rev-parse origin/main | Out-String).Trim()
    throw "Local Common checkout lacks required CODEX_LOCAL_V1 basis $RequiredCommonBasis. local=$LocalCommonHead origin/main=$RemoteCommonHead"
}

$WorkerPath = "$CommonRoot/skills/engineering-pr-delivery-v3.1/scripts/rll_worker.py"
& $Wsl -d $Distro -- test -f $WorkerPath
if ($LASTEXITCODE -ne 0) {
    throw "Canonical Common RLL worker is missing: $WorkerPath"
}

$SmokeEnabled = $Smoke.IsPresent -or [bool]$Config.smoke

$WslArgs = @(
    '-d', $Distro,
    '--',
    'env',
    '-u', 'GH_TOKEN',
    '-u', 'GITHUB_TOKEN',
    '-u', 'GH_ENTERPRISE_TOKEN',
    '-u', 'GITHUB_ENTERPRISE_TOKEN',
    'PYTHONUTF8=1',
    'PYTHONIOENCODING=utf-8',
    'python3',
    $WorkerPath,
    '--repo-root', $RepoRoot,
    '--repository', $Repository,
    '--worker-id', $WorkerId,
    '--authorized-login', $AuthorizedLogin,
    '--executor', 'codex',
    '--codex-user', $CodexUser,
    '--codex-home', $CodexHome,
    '--effort', 'high'
)

if ($SmokeEnabled) {
    $WslArgs += '--smoke'
}

$Started = (Get-Date).ToUniversalTime().ToString('o')
"[$Started] START executor=codex runtime=WSL2 distro=$Distro smoke=$SmokeEnabled" | Add-Content -Path $LogPath -Encoding UTF8

$Output = & $Wsl @WslArgs 2>&1
$ExitCode = $LASTEXITCODE

if ($Output) {
    $Output | ForEach-Object { [string]$_ } | Add-Content -Path $LogPath -Encoding UTF8
    $Output | Write-Output
}

$Finished = (Get-Date).ToUniversalTime().ToString('o')
"[$Finished] END exit=$ExitCode" | Add-Content -Path $LogPath -Encoding UTF8
exit $ExitCode
