[CmdletBinding()]
param(
    [string]$CommonRepoRoot = $env:COMMON_REPO_ROOT,
    [ValidateRange(30, 1800)][int]$TimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RequiredCommonBasis = 'e551cb50941b160b50cc21ea76888f2b962ca248'

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

function Invoke-BoundedNative {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )

    $Job = Start-Job -ScriptBlock {
        param($Exe, $ArgsList, $WorkingDir)
        Set-Location $WorkingDir
        $Captured = & $Exe @ArgsList 2>&1
        $Code = $LASTEXITCODE
        [pscustomobject]@{
            ExitCode = $Code
            Output = ($Captured | ForEach-Object { [string]$_ }) -join [Environment]::NewLine
        }
    } -ArgumentList $Executable, $Arguments, $WorkingDirectory

    $Completed = Wait-Job -Job $Job -Timeout $TimeoutSeconds
    if ($null -eq $Completed) {
        Stop-Job -Job $Job -ErrorAction SilentlyContinue
        Remove-Job -Job $Job -Force -ErrorAction SilentlyContinue
        throw "Codex conformance invocation timed out after $TimeoutSeconds seconds."
    }

    $Result = Receive-Job -Job $Job
    Remove-Job -Job $Job -Force
    return $Result
}

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$CommonRoot = Resolve-CommonRoot -Configured $CommonRepoRoot -RepoRoot $RepoRoot
$Git = Require-Command 'git'
$Codex = Require-Command 'codex'

& $Codex login status *> $null
if ($LASTEXITCODE -ne 0) {
    throw 'Codex authentication is unavailable.'
}

& $Git -C $CommonRoot fetch origin main --quiet
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to fetch Common origin/main.'
}

& $Git -C $CommonRoot merge-base --is-ancestor $RequiredCommonBasis HEAD
if ($LASTEXITCODE -ne 0) {
    throw "Local Common checkout lacks required CODEX_LOCAL_V1 basis $RequiredCommonBasis."
}

$CodexVersion = (& $Codex --version 2>&1 | Out-String).Trim()
$ConfigRoot = Join-Path $HOME '.rll\pdf-hub'
$MarkerPath = Join-Path $ConfigRoot 'codex-conformance.json'
New-Item -ItemType Directory -Force -Path $ConfigRoot | Out-Null

$ProbeRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("pdfhub-rll-codex-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $ProbeRoot | Out-Null

try {
    & $Git init $ProbeRoot *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to initialize disposable Git probe.' }
    & $Git -C $ProbeRoot config user.email 'rll-conformance@example.invalid'
    & $Git -C $ProbeRoot config user.name 'RLL Codex Conformance'
    Set-Content -Path (Join-Path $ProbeRoot 'baseline.txt') -Value 'baseline' -Encoding ASCII
    & $Git -C $ProbeRoot add baseline.txt
    & $Git -C $ProbeRoot commit -m 'conformance baseline' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to commit disposable conformance baseline.' }

    $ReadSchemaPath = Join-Path $ProbeRoot 'read-schema.json'
    $ReadOutputPath = Join-Path $ProbeRoot 'read-output.json'
    $WriteSchemaPath = Join-Path $ProbeRoot 'write-schema.json'
    $WriteOutputPath = Join-Path $ProbeRoot 'write-output.json'

    @{
        type = 'object'
        additionalProperties = $false
        required = @('status', 'mode')
        properties = @{
            status = @{ const = 'PASS' }
            mode = @{ const = 'read-only' }
        }
    } | ConvertTo-Json -Depth 10 | Set-Content -Path $ReadSchemaPath -Encoding UTF8

    @{
        type = 'object'
        additionalProperties = $false
        required = @('status', 'mode')
        properties = @{
            status = @{ const = 'PASS' }
            mode = @{ const = 'workspace-write' }
        }
    } | ConvertTo-Json -Depth 10 | Set-Content -Path $WriteSchemaPath -Encoding UTF8

    & $Git -C $ProbeRoot add read-schema.json write-schema.json
    & $Git -C $ProbeRoot commit -m 'add conformance schemas' *> $null
    if ($LASTEXITCODE -ne 0) { throw 'Unable to commit conformance schemas.' }

    $ReadArgs = @(
        '--ask-for-approval', 'never',
        'exec',
        '--ephemeral',
        '--color', 'never',
        '--sandbox', 'read-only',
        '-C', $ProbeRoot,
        '--output-schema', $ReadSchemaPath,
        '--output-last-message', $ReadOutputPath,
        '-c', 'model_reasoning_effort="low"',
        'Do not modify any file. Return only the requested JSON with status PASS and mode read-only.'
    )

    $ReadRun = Invoke-BoundedNative -Executable $Codex -Arguments $ReadArgs -WorkingDirectory $ProbeRoot -TimeoutSeconds $TimeoutSeconds
    if ([int]$ReadRun.ExitCode -ne 0) {
        throw "Codex read-only conformance failed: $($ReadRun.Output)"
    }
    if (-not (Test-Path $ReadOutputPath)) {
        throw 'Codex read-only conformance produced no output-last-message file.'
    }
    $ReadResult = Get-Content $ReadOutputPath -Raw | ConvertFrom-Json
    if ($ReadResult.status -ne 'PASS' -or $ReadResult.mode -ne 'read-only') {
        throw 'Codex read-only structured result did not match the conformance schema.'
    }

    $ReadStatus = @(& $Git -C $ProbeRoot status --porcelain=v1 --untracked-files=all)
    $UnexpectedRead = @($ReadStatus | Where-Object { $_ -notmatch '^\?\? read-output\.json$' })
    if ($UnexpectedRead.Count -ne 0) {
        throw "Read-only Codex run mutated the probe workspace unexpectedly: $($UnexpectedRead -join '; ')"
    }

    Remove-Item $ReadOutputPath -Force
    $WriteProbeName = 'rll-codex-write-probe.txt'
    $WriteArgs = @(
        '--ask-for-approval', 'never',
        'exec',
        '--ephemeral',
        '--color', 'never',
        '--sandbox', 'workspace-write',
        '-C', $ProbeRoot,
        '--output-schema', $WriteSchemaPath,
        '--output-last-message', $WriteOutputPath,
        '-c', 'model_reasoning_effort="low"',
        "Create exactly one file named $WriteProbeName containing exactly RLL_CODEX_WRITE_OK. Do not change any other file. Then return only the requested JSON with status PASS and mode workspace-write."
    )

    $WriteRun = Invoke-BoundedNative -Executable $Codex -Arguments $WriteArgs -WorkingDirectory $ProbeRoot -TimeoutSeconds $TimeoutSeconds
    if ([int]$WriteRun.ExitCode -ne 0) {
        throw "Codex workspace-write conformance failed: $($WriteRun.Output)"
    }
    if (-not (Test-Path $WriteOutputPath)) {
        throw 'Codex workspace-write conformance produced no output-last-message file.'
    }
    $WriteResult = Get-Content $WriteOutputPath -Raw | ConvertFrom-Json
    if ($WriteResult.status -ne 'PASS' -or $WriteResult.mode -ne 'workspace-write') {
        throw 'Codex workspace-write structured result did not match the conformance schema.'
    }

    $WriteProbePath = Join-Path $ProbeRoot $WriteProbeName
    if (-not (Test-Path $WriteProbePath)) {
        throw 'Codex reported workspace-write PASS but did not create the probe file.'
    }
    $WriteProbeContent = (Get-Content $WriteProbePath -Raw).Trim()
    if ($WriteProbeContent -ne 'RLL_CODEX_WRITE_OK') {
        throw "Codex write probe content mismatch: $WriteProbeContent"
    }

    $WriteStatus = @(& $Git -C $ProbeRoot status --porcelain=v1 --untracked-files=all)
    $UnexpectedWrite = @($WriteStatus | Where-Object {
        $_ -notmatch '^\?\? write-output\.json$' -and
        $_ -notmatch '^\?\? rll-codex-write-probe\.txt$'
    })
    if ($UnexpectedWrite.Count -ne 0) {
        throw "Workspace-write Codex run changed unexpected material: $($UnexpectedWrite -join '; ')"
    }

    $Marker = [ordered]@{
        schema = 'PDF_HUB_RLL_CODEX_CONFORMANCE_V1'
        passed = $true
        tested_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        required_common_basis = $RequiredCommonBasis
        common_head = (& $Git -C $CommonRoot rev-parse HEAD).Trim()
        codex_version = $CodexVersion
        machine = $env:COMPUTERNAME
        user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
        read_only = 'PASS'
        workspace_write = 'PASS'
        timeout_seconds = $TimeoutSeconds
    }
    $Marker | ConvertTo-Json -Depth 10 | Set-Content -Path $MarkerPath -Encoding UTF8

    Write-Host 'Codex RLL conformance PASS.'
    Write-Host "Marker: $MarkerPath"
    Write-Host "Codex: $CodexVersion"
}
finally {
    Remove-Item -Path $ProbeRoot -Recurse -Force -ErrorAction SilentlyContinue
}
