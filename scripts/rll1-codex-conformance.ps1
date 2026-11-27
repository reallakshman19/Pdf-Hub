[CmdletBinding()]
param(
    [string]$CommonRepoRoot = $env:COMMON_REPO_ROOT,
    [string]$WslDistro,
    [string]$WslCommonRoot,
    [string]$CodexUser = 'rll-codex',
    [string]$CodexHome = '/home/rll-codex/.codex-rll',
    [ValidateRange(30, 1800)][int]$TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

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
        throw 'No WSL distribution is installed.'
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

function Invoke-BoundedWsl {
    param(
        [Parameter(Mandatory = $true)][string]$Wsl,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $Job = Start-Job -ScriptBlock {
        param($Exe, $ArgsList)
        $Captured = & $Exe @ArgsList 2>&1
        [pscustomobject]@{
            ExitCode = $LASTEXITCODE
            Output = ($Captured | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        }
    } -ArgumentList $Wsl, $Arguments

    $Completed = Wait-Job -Job $Job -Timeout $TimeoutSeconds
    if ($null -eq $Completed) {
        Stop-Job -Job $Job -ErrorAction SilentlyContinue
        Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
        throw "Codex WSL conformance timed out after $TimeoutSeconds seconds."
    }

    $Result = Receive-Job -Job $Job
    Remove-Job -Job $Job -Force
    return $Result
}

foreach ($Name in $ForbiddenProviderTokenEnv) {
    $Value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not [string]::IsNullOrWhiteSpace($Value)) {
        throw "Conformance refuses provider token environment variable: $Name"
    }
}

$RepoRootWindows = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$Wsl = Require-Command 'wsl.exe'
$Distro = Resolve-WslDistro -Wsl $Wsl -Configured $WslDistro

$Kernel = (& $Wsl -d $Distro -- uname -r | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $Kernel -notmatch '(?i)(WSL2|microsoft-standard)') {
    throw "CODEX_LOCAL_V1 write conformance requires WSL2. distro=$Distro kernel=$Kernel"
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
    throw "Codex authentication is unavailable for dedicated user $CodexUser."
}

& $Wsl -d $Distro -- sudo -n -u $CodexUser env "HOME=/home/$CodexUser" gh auth status *> $null
if ($LASTEXITCODE -eq 0) {
    throw 'Dedicated Codex identity unexpectedly has GitHub provider authentication.'
}

& $Wsl -d $Distro -- git -C $CommonRootWsl fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main in WSL.'
}

& $Wsl -d $Distro -- git -C $CommonRootWsl merge-base --is-ancestor $RequiredCommonBasis HEAD
if ($LASTEXITCODE -ne 0) {
    throw "Local Common checkout lacks required CODEX_LOCAL_V1 basis $RequiredCommonBasis."
}

$CodexVersion = (& $Wsl -d $Distro -- sudo -n -u $CodexUser env "CODEX_HOME=$CodexHome" "HOME=/home/$CodexUser" codex --version 2>&1 | Out-String).Trim()

$ProbeRoot = (& $Wsl -d $Distro -- mktemp -d -t pdfhub-rll-codex-XXXXXXXX | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ProbeRoot)) {
    throw 'Unable to create disposable WSL conformance directory.'
}

try {
    & $Wsl -d $Distro -- chmod 0777 $ProbeRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to make disposable probe directory available to isolated Codex user.' }

    & $Wsl -d $Distro -- git init $ProbeRoot *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to initialize disposable WSL Git probe.' }
    & $Wsl -d $Distro -- git -C $ProbeRoot config user.email 'rll-conformance@example.invalid'
    & $Wsl -d $Distro -- git -C $ProbeRoot config user.name 'RLL Codex Conformance'

    $CreateFilesPython = @'
from pathlib import Path
import json
import sys
root = Path(sys.argv[1])
(root / "baseline.txt").write_text("baseline\n", encoding="utf-8")
read_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["status", "mode"],
    "properties": {
        "status": {"const": "PASS"},
        "mode": {"const": "read-only"}
    }
}
write_schema = {
    "type": "object",
    "additionalProperties": False,
    "required": ["status", "mode"],
    "properties": {
        "status": {"const": "PASS"},
        "mode": {"const": "workspace-write"}
    }
}
(root / "read-schema.json").write_text(json.dumps(read_schema), encoding="utf-8")
(root / "write-schema.json").write_text(json.dumps(write_schema), encoding="utf-8")
'@
    & $Wsl -d $Distro -- python3 -c $CreateFilesPython $ProbeRoot
    if ($LASTEXITCODE -ne 0) { throw 'Unable to create WSL conformance fixtures.' }

    & $Wsl -d $Distro -- git -C $ProbeRoot add baseline.txt read-schema.json write-schema.json
    & $Wsl -d $Distro -- git -C $ProbeRoot commit -m 'conformance baseline' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to commit WSL conformance baseline.' }

    $ReadSchemaPath = "$ProbeRoot/read-schema.json"
    $ReadOutputPath = "$ProbeRoot/read-output.json"
    $WriteSchemaPath = "$ProbeRoot/write-schema.json"
    $WriteOutputPath = "$ProbeRoot/write-output.json"
    $WriteProbePath = "$ProbeRoot/rll-codex-write-probe.txt"

    $ReadArgs = @(
        '-d', $Distro,
        '--',
        'sudo', '-n', '-u', $CodexUser,
        'env',
        "CODEX_HOME=$CodexHome",
        "HOME=/home/$CodexUser",
        'codex',
        '--ask-for-approval', 'never',
        'exec',
        '--ephemeral',
        '--color', 'never',
        '--json',
        '--sandbox', 'read-only',
        '-C', $ProbeRoot,
        '--output-schema', $ReadSchemaPath,
        '--output-last-message', $ReadOutputPath,
        '-c', 'model_reasoning_effort="low"',
        '-c', 'approvals_reviewer="user"',
        '-c', 'web_search="disabled"',
        '-c', 'sandbox_workspace_write.network_access=false',
        'Do not modify repository material. Return only the requested JSON with status PASS and mode read-only.'
    )

    $ReadRun = Invoke-BoundedWsl -Wsl $Wsl -Arguments $ReadArgs -TimeoutSeconds $TimeoutSeconds
    if ([int]$ReadRun.ExitCode -ne 0) {
        throw "Codex WSL read-only conformance failed: $($ReadRun.Output)"
    }

    $ReadJson = (& $Wsl -d $Distro -- cat $ReadOutputPath | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($ReadJson)) {
        throw 'Codex WSL read-only conformance produced no output-last-message.'
    }
    $ReadResult = $ReadJson | ConvertFrom-Json
    if ($ReadResult.status -ne 'PASS' -or $ReadResult.mode -ne 'read-only') {
        throw 'Codex WSL read-only structured result did not match the schema.'
    }

    $ReadStatus = @(& $Wsl -d $Distro -- git -C $ProbeRoot status --porcelain=v1 --untracked-files=all)
    $UnexpectedRead = @($ReadStatus | Where-Object { [string]$_ -notmatch '^\?\? read-output\.json$' })
    if ($UnexpectedRead.Count -ne 0) {
        throw "Read-only Codex run mutated repository material: $($UnexpectedRead -join '; ')"
    }

    & $Wsl -d $Distro -- rm -f $ReadOutputPath

    $WriteArgs = @(
        '-d', $Distro,
        '--',
        'sudo', '-n', '-u', $CodexUser,
        'env',
        "CODEX_HOME=$CodexHome",
        "HOME=/home/$CodexUser",
        'codex',
        '--ask-for-approval', 'never',
        'exec',
        '--ephemeral',
        '--color', 'never',
        '--json',
        '--sandbox', 'workspace-write',
        '-C', $ProbeRoot,
        '--output-schema', $WriteSchemaPath,
        '--output-last-message', $WriteOutputPath,
        '-c', 'model_reasoning_effort="low"',
        '-c', 'approvals_reviewer="user"',
        '-c', 'web_search="disabled"',
        '-c', 'sandbox_workspace_write.network_access=false',
        'Create exactly one file named rll-codex-write-probe.txt containing exactly RLL_CODEX_WRITE_OK. Do not modify any other repository material. Then return only the requested JSON with status PASS and mode workspace-write.'
    )

    $WriteRun = Invoke-BoundedWsl -Wsl $Wsl -Arguments $WriteArgs -TimeoutSeconds $TimeoutSeconds
    if ([int]$WriteRun.ExitCode -ne 0) {
        throw "Codex WSL workspace-write conformance failed: $($WriteRun.Output)"
    }

    $WriteJson = (& $Wsl -d $Distro -- cat $WriteOutputPath | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($WriteJson)) {
        throw 'Codex WSL workspace-write conformance produced no output-last-message.'
    }
    $WriteResult = $WriteJson | ConvertFrom-Json
    if ($WriteResult.status -ne 'PASS' -or $WriteResult.mode -ne 'workspace-write') {
        throw 'Codex WSL workspace-write structured result did not match the schema.'
    }

    $WriteProbeContent = (& $Wsl -d $Distro -- cat $WriteProbePath | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $WriteProbeContent -ne 'RLL_CODEX_WRITE_OK') {
        throw 'Codex WSL workspace-write probe file is missing or has incorrect content.'
    }

    $WriteStatus = @(& $Wsl -d $Distro -- git -C $ProbeRoot status --porcelain=v1 --untracked-files=all)
    $UnexpectedWrite = @($WriteStatus | Where-Object {
        [string]$_ -notmatch '^\?\? write-output\.json$' -and
        [string]$_ -notmatch '^\?\? rll-codex-write-probe\.txt$'
    })
    if ($UnexpectedWrite.Count -ne 0) {
        throw "Workspace-write Codex run changed unexpected repository material: $($UnexpectedWrite -join '; ')"
    }

    $ConfigRoot = Join-Path $HOME '.rll\pdf-hub'
    $MarkerPath = Join-Path $ConfigRoot 'codex-conformance.json'
    New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null

    $Marker = [ordered]@{
        schema = 'PDF_HUB_RLL_CODEX_CONFORMANCE_V2'
        passed = $true
        tested_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        required_common_basis = $RequiredCommonBasis
        common_head = (& $Wsl -d $Distro -- git -C $CommonRootWsl rev-parse HEAD | Out-String).Trim()
        wsl_distro = $Distro
        wsl_kernel = $Kernel
        codex_user = $CodexUser
        codex_home = $CodexHome
        codex_version = $CodexVersion
        provider_gh_auth = 'PASS'
        codex_provider_access = 'BLOCKED'
        read_only = 'PASS'
        workspace_write = 'PASS'
        timeout_seconds = $TimeoutSeconds
    }
    $Marker | ConvertTo-Json -Depth 10 | Set-Content -Path $MarkerPath -Encoding UTF8

    Write-Host 'Codex RLL WSL2 conformance PASS.'
    Write-Host "Marker: $MarkerPath"
    Write-Host "WSL distribution: $Distro"
    Write-Host "Codex identity: $CodexUser / $CodexHome"
    Write-Host "Codex: $CodexVersion"
}
finally {
    & $Wsl -d $Distro -- rm -rf $ProbeRoot *> $null
}
