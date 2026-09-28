[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $HOME '.rll\pdf-hub\codex-worker.json'),
    [switch]$Smoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'reallaksh19/Pdf-Hub'
$WorkerId = 'pdfhub-rll-local'
$AuthorizedLogin = 'reallaksh19'
$RequiredCommonBasis = 'e551cb50941b160b50cc21ea76888f2b962ca248'

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "Missing required command: $Name"
    }
    return $command.Source
}

if (-not (Test-Path $ConfigPath)) {
    throw "RLL Codex worker config is missing: $ConfigPath. Run scripts\install-rll1-codex-task.ps1 first."
}

$Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
if ($Config.schema -ne 'PDF_HUB_RLL_CODEX_CONFIG_V1') {
    throw "Unsupported RLL Codex worker config schema: $($Config.schema)"
}

if ([string]::IsNullOrWhiteSpace([string]$Config.tool_path)) {
    throw 'RLL Codex worker config has no validated tool PATH.'
}

$env:PATH = [string]$Config.tool_path
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'

$Git = Require-Command 'git'
$Gh = Require-Command 'gh'
$Python = Require-Command 'python'
$Codex = Require-Command 'codex'

$RepoRoot = (Resolve-Path ([string]$Config.repo_root)).Path
$CommonRoot = (Resolve-Path ([string]$Config.common_repo_root)).Path
$LogPath = [string]$Config.log_path
$LogRoot = Split-Path $LogPath -Parent
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

& $Git -C $RepoRoot rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    throw "PDF Hub root is not a Git repository: $RepoRoot"
}

& $Git -C $CommonRoot rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Common root is not a Git repository: $CommonRoot"
}

& $Gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI authentication is unavailable. Run gh auth login.'
}

& $Codex login status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Codex authentication is unavailable. Authenticate Codex interactively before scheduled execution.'
}

& $Git -C $CommonRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main.'
}

& $Git -C $CommonRoot merge-base --is-ancestor $RequiredCommonBasis HEAD
if ($LASTEXITCODE -ne 0) {
    $localCommonHead = (& $Git -C $CommonRoot rev-parse HEAD).Trim()
    $remoteCommonHead = (& $Git -C $CommonRoot rev-parse origin/main).Trim()
    throw "Local Common checkout lacks required CODEX_LOCAL_V1 basis $RequiredCommonBasis. local=$localCommonHead origin/main=$remoteCommonHead"
}

$WorkerPath = Join-Path $CommonRoot 'skills\engineering-pr-delivery-v3.1\scripts\rll_worker.py'
if (-not (Test-Path $WorkerPath)) {
    throw "Canonical Common RLL worker is missing: $WorkerPath"
}

$SmokeEnabled = $Smoke.IsPresent -or [bool]$Config.smoke

$WorkerArgs = @(
    $WorkerPath,
    '--repo-root', $RepoRoot,
    '--repository', $Repository,
    '--worker-id', $WorkerId,
    '--authorized-login', $AuthorizedLogin,
    '--executor', 'codex',
    '--effort', 'high'
)

if ($SmokeEnabled) {
    $WorkerArgs += '--smoke'
}

$Started = (Get-Date).ToUniversalTime().ToString('o')
"[$Started] START executor=codex smoke=$SmokeEnabled" | Add-Content -Path $LogPath -Encoding UTF8

$Output = & $Python @WorkerArgs 2>&1
$ExitCode = $LASTEXITCODE

if ($Output) {
    $Output | ForEach-Object { [string]$_ } | Add-Content -Path $LogPath -Encoding UTF8
    $Output | Write-Output
}

$Finished = (Get-Date).ToUniversalTime().ToString('o')
"[$Finished] END exit=$ExitCode" | Add-Content -Path $LogPath -Encoding UTF8
exit $ExitCode
