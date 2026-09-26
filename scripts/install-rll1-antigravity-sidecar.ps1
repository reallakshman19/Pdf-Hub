[CmdletBinding()]
param(
    [string]$CommonRepoRoot = $env:COMMON_REPO_ROOT,
    [string]$Cron = '*/10 * * * *',
    [string]$SidecarId = 'pdf-hub-rll1',
    [switch]$EnableExecution,
    [switch]$Disable
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'reallaksh19/Pdf-Hub'
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
    $sibling = Join-Path (Split-Path $RepoRoot -Parent) 'Common'
    if (Test-Path $sibling) {
        return (Resolve-Path $sibling).Path
    }
    throw 'Common checkout not found. Pass -CommonRepoRoot or set COMMON_REPO_ROOT.'
}

function Ensure-ObjectProperty {
    param(
        [Parameter(Mandatory = $true)]$Object,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)]$Value
    )

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        $Object | Add-Member -MemberType NoteProperty -Name $Name -Value $Value
    }
    else {
        $property.Value = $Value
    }
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CommonRoot = Resolve-CommonRoot -Configured $CommonRepoRoot -RepoRoot $RepoRoot
$WrapperPath = Join-Path $RepoRoot 'scripts\rll1-antigravity-worker.ps1'

if (-not (Test-Path $WrapperPath)) {
    throw "RLL wrapper not found: $WrapperPath"
}

$Gh = Require-Command 'gh'
$null = Require-Command 'git'
$null = Require-Command 'python'
$null = Require-Command 'agy'
$PowerShell = Require-Command 'powershell.exe'

& $Gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'GitHub CLI authentication is unavailable. Run gh auth login.'
}

$ConfigRoot = Join-Path $HOME '.gemini\config'
$SidecarsRoot = Join-Path $ConfigRoot 'sidecars'
$SidecarRoot = Join-Path $SidecarsRoot $SidecarId
$SidecarPath = Join-Path $SidecarRoot 'sidecar.json'
$ConfigPath = Join-Path $ConfigRoot 'config.json'

New-Item -ItemType Directory -Force -Path $SidecarRoot | Out-Null

if (Test-Path $ConfigPath) {
    $Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
}
else {
    New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null
    $Config = [pscustomobject]@{}
}

if ($null -eq $Config.PSObject.Properties['sidecars']) {
    $Config | Add-Member -MemberType NoteProperty -Name 'sidecars' -Value ([pscustomobject]@{})
}

if ($null -eq $Config.sidecars.PSObject.Properties[$SidecarId]) {
    $Config.sidecars | Add-Member -MemberType NoteProperty -Name $SidecarId -Value ([pscustomobject]@{ enabled = (-not $Disable.IsPresent) })
}
else {
    $Entry = $Config.sidecars.PSObject.Properties[$SidecarId].Value
    Ensure-ObjectProperty -Object $Entry -Name 'enabled' -Value (-not $Disable.IsPresent)
}

$Config | ConvertTo-Json -Depth 20 | Set-Content -Path $ConfigPath -Encoding UTF8

if ($Disable.IsPresent) {
    Write-Host "Disabled Antigravity sidecar '$SidecarId'. Existing sidecar configuration was retained."
    exit 0
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

$SmokeValue = if ($EnableExecution.IsPresent) { '0' } else { '1' }

$Sidecar = [ordered]@{
    display_name = 'PDF Hub RLL-1'
    description = 'Engineering Relay V3.1 RLL-1 scheduled local worker for reallaksh19/Pdf-Hub'
    builtin = 'schedule'
    args = @(
        $Cron,
        $PowerShell,
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        $WrapperPath
    )
    restart_policy = 'always'
    env = [ordered]@{
        COMMON_REPO_ROOT = $CommonRoot
        RLL_SMOKE = $SmokeValue
    }
}

$Sidecar | ConvertTo-Json -Depth 20 | Set-Content -Path $SidecarPath -Encoding UTF8

Write-Host "Installed Antigravity sidecar '$SidecarId' at $SidecarPath"
Write-Host "Schedule: $Cron"
if ($EnableExecution.IsPresent) {
    Write-Warning 'RLL_SMOKE=0: engineering-agent execution is enabled. Use only after the non-destructive smoke has been reviewed.'
}
else {
    Write-Host 'RLL_SMOKE=1: non-destructive transport smoke is enabled; Common will not invoke Antigravity.'
}
Write-Host "Global Antigravity config enabled '$SidecarId' in $ConfigPath"
