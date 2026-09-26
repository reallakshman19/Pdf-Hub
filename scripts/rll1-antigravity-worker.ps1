[CmdletBinding()]
param(
    [string]$CommonRepoRoot = $env:COMMON_REPO_ROOT,
    [switch]$Smoke
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$MinimumCommonRllSha = '8c013591659cbf42111d9d61d102e338f462cff5'
$Repository = 'reallaksh19/Pdf-Hub'
$WorkerId = 'antigravity-local'
$AuthorizedLogin = 'reallaksh19'

function Require-Command {
    param([Parameter(Mandatory = $true)][string]$Name)
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        throw "Missing required command: $Name"
    }
    return $command.Source
}

function Resolve-CommonRoot {
    param([string]$Configured, [string]$RepoRoot)

    if ($Configured) {
        return (Resolve-Path $Configured).Path
    }

    $sibling = Join-Path (Split-Path $RepoRoot -Parent) 'Common'
    if (Test-Path $sibling) {
        return (Resolve-Path $sibling).Path
    }

    throw 'Common checkout not found. Set COMMON_REPO_ROOT to the local reallaksh19/Common checkout.'
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CommonRoot = Resolve-CommonRoot -Configured $CommonRepoRoot -RepoRoot $RepoRoot

$Git = Require-Command 'git'
$Gh = Require-Command 'gh'
$Python = Require-Command 'python'
$Agy = Require-Command 'agy'

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

& $Git -C $CommonRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main.'
}

& $Git -C $CommonRoot merge-base --is-ancestor $MinimumCommonRllSha HEAD
if ($LASTEXITCODE -ne 0) {
    $localCommonHead = (& $Git -C $CommonRoot rev-parse HEAD).Trim()
    $remoteCommonHead = (& $Git -C $CommonRoot rev-parse origin/main).Trim()
    throw "Local Common checkout lacks the required RLL-1 basis $MinimumCommonRllSha. local=$localCommonHead origin/main=$remoteCommonHead. Update Common safely before running RLL."
}

$WorkerPath = Join-Path $CommonRoot 'skills\engineering-pr-delivery-v3.1\scripts\rll_worker.py'
if (-not (Test-Path $WorkerPath)) {
    throw "Canonical Common RLL worker is missing: $WorkerPath"
}

$SmokeEnabled = $Smoke.IsPresent -or $env:RLL_SMOKE -eq '1' -or $env:RLL_SMOKE -eq 'true'

$WorkerArgs = @(
    $WorkerPath,
    '--repo-root', $RepoRoot,
    '--repository', $Repository,
    '--worker-id', $WorkerId,
    '--authorized-login', $AuthorizedLogin,
    '--effort', 'high'
)

if ($SmokeEnabled) {
    $WorkerArgs += '--smoke'
}

& $Python @WorkerArgs
exit $LASTEXITCODE
