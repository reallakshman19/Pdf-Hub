[CmdletBinding()]
param(
    [string]$CommonRepoRoot = $env:COMMON_REPO_ROOT,
    [string]$TaskName = 'PDF Hub RLL-1 Codex',
    [ValidateRange(5, 1440)][int]$IntervalMinutes = 10,
    [switch]$EnableExecution,
    [switch]$Disable,
    [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'reallaksh19/Pdf-Hub'
$RequiredCommonBasis = 'e551cb50941b160b50cc21ea76888f2b962ca248'
$WorkerId = 'pdfhub-rll-local'
$Labels = @(
    @{ Name = 'rll-ready';        Color = '1D76DB'; Description = 'RLL-1 issue is authorized and ready for the local worker.' },
    @{ Name = 'rll-active';       Color = 'FBCA04'; Description = 'RLL-1 local worker currently owns transport execution.' },
    @{ Name = 'rll-review-ready'; Color = '0E8A16'; Description = 'RLL-1 transport published exact-head evidence for independent review.' },
    @{ Name = 'rll-escalation';   Color = 'D93F0B'; Description = 'RLL-1 transport found a real contract/scope contradiction requiring coordinator action.' }
)

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
    $Sibling = Join-Path (Split-Path $RepoRoot -Parent) 'Common'
    if (Test-Path $Sibling) {
        return (Resolve-Path $Sibling).Path
    }
    throw 'Common checkout not found. Pass -CommonRepoRoot or set COMMON_REPO_ROOT.'
}

Import-Module ScheduledTasks -ErrorAction Stop

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CommonRoot = Resolve-CommonRoot -Configured $CommonRepoRoot -RepoRoot $RepoRoot
$WrapperPath = Join-Path $RepoRoot 'scripts\rll1-codex-worker.ps1'
$ConfigRoot = Join-Path $HOME '.rll\pdf-hub'
$ConfigPath = Join-Path $ConfigRoot 'codex-worker.json'
$ConformancePath = Join-Path $ConfigRoot 'codex-conformance.json'
$LogPath = Join-Path $ConfigRoot 'logs\worker.log'

if (-not (Test-Path $WrapperPath)) {
    throw "RLL Codex wrapper not found: $WrapperPath"
}

$Git = Require-Command 'git'
$Gh = Require-Command 'gh'
$Python = Require-Command 'python'
$Codex = Require-Command 'codex'
$PowerShell = Require-Command 'powershell.exe'

& $Gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI authentication is unavailable. Run gh auth login.'
}

& $Codex login status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Codex authentication is unavailable. Authenticate Codex interactively first.'
}

& $Git -C $CommonRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main.'
}

& $Git -C $CommonRoot merge-base --is-ancestor $RequiredCommonBasis HEAD
if ($LASTEXITCODE -ne 0) {
    $LocalHead = (& $Git -C $CommonRoot rev-parse HEAD).Trim()
    throw "Local Common checkout lacks required CODEX_LOCAL_V1 basis $RequiredCommonBasis. current=$LocalHead"
}

if ($Disable.IsPresent) {
    $ExistingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($null -ne $ExistingTask) {
        Disable-ScheduledTask -TaskName $TaskName | Out-Null
        Write-Host "Disabled Windows scheduled task '$TaskName'."
    }
    else {
        Write-Host "Scheduled task '$TaskName' is not installed."
    }
    exit 0
}

$CodexVersion = (& $Codex --version 2>&1 | Out-String).Trim()
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Machine = $env:COMPUTERNAME

if ($EnableExecution.IsPresent) {
    if (-not (Test-Path $ConformancePath)) {
        throw "Codex source-write conformance marker is missing: $ConformancePath. Run scripts\rll1-codex-conformance.ps1 first."
    }
    $Conformance = Get-Content $ConformancePath -Raw | ConvertFrom-Json
    if (
        $Conformance.schema -ne 'PDF_HUB_RLL_CODEX_CONFORMANCE_V1' -or
        -not [bool]$Conformance.passed -or
        $Conformance.required_common_basis -ne $RequiredCommonBasis -or
        $Conformance.codex_version -ne $CodexVersion -or
        $Conformance.machine -ne $Machine -or
        $Conformance.user -ne $CurrentUser
    ) {
        throw 'Codex conformance marker does not match the current Common basis, Codex version, machine, or user. Rerun conformance.'
    }
}

foreach ($Label in $Labels) {
    $Existing = & $Gh label list --repo $Repository --limit 200 --json name --jq '.[].name'
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to list GitHub labels.'
    }
    if ($Existing -notcontains $Label.Name) {
        & $Gh label create $Label.Name --repo $Repository --color $Label.Color --description $Label.Description
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to create GitHub label $($Label.Name)."
        }
    }
}

New-Item -ItemType Directory -Force -Path (Split-Path $LogPath -Parent) | Out-Null

$Config = [ordered]@{
    schema = 'PDF_HUB_RLL_CODEX_CONFIG_V1'
    repository = $Repository
    repo_root = $RepoRoot
    common_repo_root = $CommonRoot
    required_common_basis = $RequiredCommonBasis
    worker_id = $WorkerId
    authorized_login = 'reallaksh19'
    executor = 'codex'
    tool_path = $env:PATH
    smoke = (-not $EnableExecution.IsPresent)
    log_path = $LogPath
}

$Config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8

$Quote = [char]34
$ActionArguments = "-NoProfile -ExecutionPolicy Bypass -File $Quote$WrapperPath$Quote -ConfigPath $Quote$ConfigPath$Quote"
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $ActionArguments
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Engineering Relay V3.1 RLL-1 Codex worker for reallaksh19/Pdf-Hub' -Force | Out-Null

Write-Host "Installed Windows scheduled task '$TaskName'."
Write-Host "Cadence: every $IntervalMinutes minutes for the current interactive user."
Write-Host 'MultipleInstances: IgnoreNew (Common mutex remains the second overlap guard).'
Write-Host "Config: $ConfigPath"
Write-Host "Log: $LogPath"

if ($EnableExecution.IsPresent) {
    Write-Warning 'Execution mode is ENABLED. The matching native-Windows Codex conformance marker was verified.'
}
else {
    Write-Host 'Smoke mode is enabled. Common will not invoke Codex.'
}

if ($RunNow.IsPresent) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Started scheduled task '$TaskName' on demand."
}
