[CmdletBinding()]
param(
    [string]$CommonRepoRoot = $env:COMMON_REPO_ROOT,
    [string]$WslDistro,
    [string]$WslRepoRoot,
    [string]$WslCommonRoot,
    [string]$CodexUser = 'rll-codex',
    [string]$CodexHome = '/home/rll-codex/.codex-rll',
    [int]$SmokeIssue = 350,
    [string]$TaskName = 'PDF Hub RLL-1 Codex',
    [ValidateRange(5, 1440)][int]$IntervalMinutes = 10,
    [switch]$EnableExecution,
    [switch]$Disable,
    [switch]$RunNow
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Repository = 'reallaksh19/Pdf-Hub'
$RequiredCommonBasis = '22d365839e64c19c7ba606e2cf4edc6b9cc2999f'
$WorkerId = 'codex-local'
$AuthorizedLogin = 'reallaksh19'
$ForbiddenProviderTokenEnv = @(
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN'
)
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

function Resolve-WslDistro {
    param(
        [Parameter(Mandatory = $true)][string]$Wsl,
        [string]$Configured
    )
    if (-not [string]::IsNullOrWhiteSpace($Configured)) {
        & $Wsl -d $Configured -- true *> $null
        if ($LASTEXITCODE -ne 0) {
            throw "WSL distribution is unavailable: $Configured"
        }
        return $Configured
    }

    $Rows = @(& $Wsl -l -q 2>$null | ForEach-Object {
        ([string]$_ -replace [char]0, '').Trim()
    } | Where-Object { $_ })
    if ($Rows.Count -eq 0) {
        throw 'No WSL distribution is installed. Install/enable WSL2 before RLL Codex setup.'
    }
    return $Rows[0]
}

function Convert-ToWslPath {
    param(
        [Parameter(Mandatory = $true)][string]$Wsl,
        [Parameter(Mandatory = $true)][string]$Distro,
        [Parameter(Mandatory = $true)][string]$WindowsPath
    )
    $Resolved = (Resolve-Path $WindowsPath).Path
    $Converted = (& $Wsl -d $Distro -- wslpath -a $Resolved | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Converted)) {
        throw "Unable to convert Windows path to WSL path: $Resolved"
    }
    return $Converted
}

function Resolve-CommonWindowsRoot {
    param([string]$Configured, [string]$RepoRoot)
    if ($Configured) {
        return (Resolve-Path $Configured).Path
    }
    $Sibling = Join-Path (Split-Path $RepoRoot -Parent) 'Common'
    if (Test-Path $Sibling) {
        return (Resolve-Path $Sibling).Path
    }
    throw 'Common checkout not found. Pass -CommonRepoRoot, -WslCommonRoot, or set COMMON_REPO_ROOT.'
}

Import-Module ScheduledTasks -ErrorAction Stop

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

foreach ($Name in $ForbiddenProviderTokenEnv) {
    $Value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        throw "Installer refuses provider token environment variable: $Name"
    }
}

$RepoRootWindows = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SourceWrapperPath = Join-Path $RepoRootWindows 'scripts\rll1-codex-worker.ps1'
if (-not (Test-Path $SourceWrapperPath)) {
    throw "RLL Codex wrapper not found: $SourceWrapperPath"
}

$Wsl = Require-Command 'wsl.exe'
$PowerShell = Require-Command 'powershell.exe'
$Distro = Resolve-WslDistro -Wsl $Wsl -Configured $WslDistro

$Kernel = (& $Wsl -d $Distro -- uname -r | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $Kernel -notmatch '(?i)(WSL2|microsoft-standard)') {
    throw "CODEX_LOCAL_V1 BRANCH_RESUME requires WSL2. distro=$Distro kernel=$Kernel"
}

if ([string]::IsNullOrWhiteSpace($WslRepoRoot)) {
    $RepoRootWsl = Convert-ToWslPath -Wsl $Wsl -Distro $Distro -WindowsPath $RepoRootWindows
}
else {
    $RepoRootWsl = $WslRepoRoot
}

if ([string]::IsNullOrWhiteSpace($WslCommonRoot)) {
    $CommonWindowsRoot = Resolve-CommonWindowsRoot -Configured $CommonRepoRoot -RepoRoot $RepoRootWindows
    $CommonRootWsl = Convert-ToWslPath -Wsl $Wsl -Distro $Distro -WindowsPath $CommonWindowsRoot
}
else {
    $CommonRootWsl = $WslCommonRoot
}

foreach ($Name in @('git', 'gh', 'python3', 'codex', 'sudo')) {
    & $Wsl -d $Distro -- which $Name *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Missing required WSL command: $Name"
    }
}

foreach ($Name in $ForbiddenProviderTokenEnv) {
    & $Wsl -d $Distro -- printenv $Name *> $null
    if ($LASTEXITCODE -eq 0) {
        throw "WSL provider environment exposes forbidden token variable: $Name"
    }
}

& $Wsl -d $Distro -- git -C $RepoRootWsl rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    throw "PDF Hub WSL root is not a Git repository: $RepoRootWsl"
}

& $Wsl -d $Distro -- git -C $CommonRootWsl rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Common WSL root is not a Git repository: $CommonRootWsl"
}

& $Wsl -d $Distro -- gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'WSL provider GitHub authentication is unavailable. Use gh auth login --web inside WSL.'
}

& $Wsl -d $Distro -- id -u $CodexUser *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Dedicated Codex Linux user does not exist: $CodexUser"
}

& $Wsl -d $Distro -- sudo -n -u $CodexUser true *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Provider identity lacks non-interactive sudo delegation to dedicated Codex user $CodexUser."
}

& $Wsl -d $Distro -- sudo -n -u $CodexUser env "CODEX_HOME=$CodexHome" "HOME=/home/$CodexUser" codex login status *> $null
if ($LASTEXITCODE -ne 0) {
    throw "Codex authentication is unavailable for dedicated user $CodexUser and CODEX_HOME $CodexHome."
}

& $Wsl -d $Distro -- git -C $CommonRootWsl fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main in WSL.'
}

& $Wsl -d $Distro -- git -C $CommonRootWsl merge-base --is-ancestor $RequiredCommonBasis HEAD
if ($LASTEXITCODE -ne 0) {
    $LocalHead = (& $Wsl -d $Distro -- git -C $CommonRootWsl rev-parse HEAD | Out-String).Trim()
    throw "Local Common checkout lacks required CODEX_LOCAL_V1 basis $RequiredCommonBasis. current=$LocalHead"
}

$IssueJsonText = (& $Wsl -d $Distro -- gh issue view $SmokeIssue --repo $Repository --json state,comments | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($IssueJsonText)) {
    throw "Unable to inspect smoke issue #$SmokeIssue."
}
$IssueJson = $IssueJsonText | ConvertFrom-Json
if ($IssueJson.state -ne 'OPEN') {
    throw "Smoke issue #$SmokeIssue is not open. Use a fresh open smoke issue."
}
foreach ($Comment in @($IssueJson.comments)) {
    $Body = [string]$Comment.body
    if ($Body -match '(?ms)^RLL_WORKER_STATE_V1\b.*?^state:\s*(REVIEW_READY|CANCELLED)\s*$') {
        throw "Smoke issue #$SmokeIssue already has terminal/review-ready RLL history. Use a fresh smoke issue."
    }
}

foreach ($Label in $Labels) {
    $Existing = @(& $Wsl -d $Distro -- gh label list --repo $Repository --limit 200 --json name --jq '.[].name')
    if ($LASTEXITCODE -ne 0) {
        throw 'Unable to list GitHub labels through WSL provider identity.'
    }
    if ($Existing -notcontains $Label.Name) {
        & $Wsl -d $Distro -- gh label create $Label.Name --repo $Repository --color $Label.Color --description $Label.Description
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to create GitHub label $($Label.Name)."
        }
    }
}

$ConfigRoot = Join-Path $HOME '.rll\pdf-hub'
$BinRoot = Join-Path $ConfigRoot 'bin'
$InstalledWrapperPath = Join-Path $BinRoot 'rll1-codex-worker.ps1'
$ConfigPath = Join-Path $ConfigRoot 'codex-worker.json'
$ConformancePath = Join-Path $ConfigRoot 'codex-conformance.json'
$LogPath = Join-Path $ConfigRoot 'logs\worker.log'

New-Item -ItemType Directory -Force -Path $BinRoot | Out-Null
New-Item -ItemType Directory -Force -Path (Split-Path $LogPath -Parent) | Out-Null
Copy-Item -Path $SourceWrapperPath -Destination $InstalledWrapperPath -Force

$CodexVersion = (& $Wsl -d $Distro -- sudo -n -u $CodexUser env "CODEX_HOME=$CodexHome" "HOME=/home/$CodexUser" codex --version 2>&1 | Out-String).Trim()

if ($EnableExecution.IsPresent) {
    if (-not (Test-Path $ConformancePath)) {
        throw "Codex WSL2 conformance marker is missing: $ConformancePath. Run scripts\rll1-codex-conformance.ps1 first."
    }
    $Conformance = Get-Content $ConformancePath -Raw | ConvertFrom-Json
    if (
        $Conformance.schema -ne 'PDF_HUB_RLL_CODEX_CONFORMANCE_V2' -or
        -not [bool]$Conformance.passed -or
        $Conformance.required_common_basis -ne $RequiredCommonBasis -or
        $Conformance.wsl_distro -ne $Distro -or
        $Conformance.codex_user -ne $CodexUser -or
        $Conformance.codex_home -ne $CodexHome -or
        $Conformance.codex_version -ne $CodexVersion
    ) {
        throw 'Codex conformance marker does not match the current Common basis, WSL distribution, Codex identity/home, or Codex version. Rerun conformance.'
    }
}

$Config = [ordered]@{
    schema = 'PDF_HUB_RLL_CODEX_CONFIG_V2'
    repository = $Repository
    repo_root_wsl = $RepoRootWsl
    common_repo_root_wsl = $CommonRootWsl
    required_common_basis = $RequiredCommonBasis
    worker_id = $WorkerId
    authorized_login = $AuthorizedLogin
    executor = 'codex'
    wsl_distro = $Distro
    codex_user = $CodexUser
    codex_home = $CodexHome
    smoke = (-not $EnableExecution.IsPresent)
    log_path = $LogPath
}

$Config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8

$Quote = [char]34
$ActionArguments = "-NoProfile -ExecutionPolicy Bypass -File $Quote$InstalledWrapperPath$Quote -ConfigPath $Quote$ConfigPath$Quote"
$Action = New-ScheduledTaskAction -Execute $PowerShell -Argument $ActionArguments
$Trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $IntervalMinutes) -RepetitionDuration (New-TimeSpan -Days 3650)
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 3)
$CurrentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$Principal = New-ScheduledTaskPrincipal -UserId $CurrentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Engineering Relay V3.1 RLL-1 Codex worker for reallaksh19/Pdf-Hub' -Force | Out-Null

Write-Host "Installed Windows scheduled task '$TaskName'."
Write-Host "Host cadence: every $IntervalMinutes minutes."
Write-Host "Runtime: WSL2 distribution $Distro."
Write-Host "Provider repository: $RepoRootWsl"
Write-Host "Common repository: $CommonRootWsl"
Write-Host "Codex identity: $CodexUser / $CodexHome"
Write-Host "Branch-independent wrapper: $InstalledWrapperPath"
Write-Host "MultipleInstances: IgnoreNew (Common mutex remains the second overlap guard)."
Write-Host "Config: $ConfigPath"
Write-Host "Log: $LogPath"

if ($EnableExecution.IsPresent) {
    Write-Warning 'Codex execution is enabled for eligible RLL work. Production branch-write eligibility still requires the governed smoke sequence and an authorized RLL_EXECUTION_V1.'
}
else {
    Write-Host 'Smoke mode is enabled. Common will not invoke Codex.'
}

if ($RunNow.IsPresent) {
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "Started scheduled task '$TaskName' on demand."
}
