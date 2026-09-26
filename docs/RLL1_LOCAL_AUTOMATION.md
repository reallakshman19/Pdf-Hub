# PDF Hub RLL-1 local automation

PDF Hub consumes the generic Engineering Relay V3.1 RLL-1 transport from `reallaksh19/Common`. This repository contains only a thin local adapter.

## Architecture

```text
Antigravity sidecar schedule
        ↓
scripts/rll1-antigravity-worker.ps1
        ↓
Common skills/engineering-pr-delivery-v3.1/scripts/rll_worker.py
        ↓
git + gh + one agy -p engineering session
```

Common owns issue discovery, authorization envelopes, directives, mutex/lease behavior, workspace preparation, Antigravity invocation, result validation and transport-state transitions.

PDF Hub does not fork those semantics.

Minimum known Common RLL capability basis:

`8c013591659cbf42111d9d61d102e338f462cff5`

## Prerequisites

Install and authenticate:

- Python;
- Git;
- GitHub CLI `gh`;
- Google Antigravity CLI `agy`;
- a local checkout of `reallaksh19/Common`.

Authenticate GitHub if needed:

```powershell
gh auth login
gh auth status
```

The local Common checkout must contain the minimum RLL basis above. The wrapper fetches Common metadata but does not modify Common source.

Set `COMMON_REPO_ROOT` if Common is not a sibling directory of PDF Hub:

```powershell
$env:COMMON_REPO_ROOT = 'C:\Code\Common'
```

## Install the scheduled sidecar

Initial installation is intentionally non-destructive:

```powershell
.\scripts\install-rll1-antigravity-sidecar.ps1 -CommonRepoRoot 'C:\Code\Common'
```

The installer:

- ensures `rll-ready`, `rll-active`, `rll-review-ready` and `rll-escalation` labels exist;
- writes `~/.gemini/config/sidecars/pdf-hub-rll1/sidecar.json`;
- enables that sidecar in `~/.gemini/config/config.json`;
- schedules the wrapper every ten minutes by default;
- sets `RLL_SMOKE=1`.

Antigravity sidecars use the `schedule` builtin. The sidecar runs the wrapper command; it does not duplicate RLL logic.

## Smoke mode

With `RLL_SMOKE=1`, Common's launcher performs the transport preflight but does not invoke Antigravity.

The smoke is expected to prove:

- local mutex acquisition/release;
- one eligible issue is selected;
- an authorized `RLL_EXECUTION_V1` is parsed;
- Git basis/workspace is validated;
- one `RLL_WORKER_STATE_V1` comment is created/updated;
- transport labels transition correctly;
- no engineering-agent run occurs;
- no tracked source changes are made.

Review the smoke before enabling source execution.

## Enable engineering execution

After smoke validation:

```powershell
.\scripts\install-rll1-antigravity-sidecar.ps1 -CommonRepoRoot 'C:\Code\Common' -EnableExecution
```

This rewrites the sidecar environment with `RLL_SMOKE=0`.

The next eligible wake may invoke one Common-governed `agy -p` engineering session.

## Disable

```powershell
.\scripts\install-rll1-antigravity-sidecar.ps1 -Disable
```

This disables the PDF Hub sidecar in Antigravity global configuration. GitHub issues, branches, commits and durable evidence remain intact.

## Execution envelopes

An issue does not become executable merely because it exists. It also needs an authorized `RLL_EXECUTION_V1` envelope and an RLL eligibility label.

### Branch-resume implementation

```text
RLL_EXECUTION_V1

transport: RLL-1
worker: antigravity-local
mode: BRANCH_RESUME
repository: reallaksh19/Pdf-Hub
branch: owned-branch
base_sha: <approved-base-sha>
allow_material_write: true
```

`base_sha` is an ancestry boundary, not a reset target. Existing legitimate commits on the governed branch are preserved.

### Exact-head evidence

```text
RLL_EXECUTION_V1

transport: RLL-1
worker: antigravity-local
mode: EXACT_HEAD_EVIDENCE
repository: reallaksh19/Pdf-Hub
head_sha: <exact-40-character-sha>
base_sha: <comparison-base-sha>
allow_material_write: false
```

Common creates/reuses a dedicated clean detached worktree for this mode. Tracked material writes are forbidden.

## Directives

Ordinary GitHub comments are not commands.

Transport control requires an authorized structured envelope, for example:

```text
RELAY_DIRECTIVE_V1

sequence: 1
issue: 342
action: PAUSE
```

Supported actions are `CONTINUE`, `PAUSE`, `RESUME`, `REPLAN` and `CANCEL`.

Example resume:

```text
RELAY_DIRECTIVE_V1

sequence: 2
issue: 342
action: RESUME
instruction: >
  Continue the existing bounded implementation plan.
```

## Phase 13.7 pilot

After this adapter is merged and smoke mode is installed, #342 can be attached using:

```text
RLL_EXECUTION_V1

transport: RLL-1
worker: antigravity-local
mode: BRANCH_RESUME
repository: reallaksh19/Pdf-Hub
branch: phase13/native-spacing-and-compound-shows
base_sha: 9e7d3476b5a14f9ccb09417fc56a34b724bd0063
allow_material_write: true
```

The Phase 13.7 branch already contains legitimate material after that base. `BRANCH_RESUME` must resume current Git truth and must not reset those commits.

Add `rll-ready` only when the coordinator intends the local worker to claim the issue.

## Evidence and authority

Transport states are not engineering verdicts.

For example:

```text
RLL: REVIEW_READY
focused tests: PASS
broad typecheck: FAIL — PRE-EXISTING BASELINE
hosted CI: NOT_RUN — INFRASTRUCTURE
```

is coherent.

`REVIEW_READY` means evidence is ready for independent review. It does not mean accepted or merged.

RLL never grants merge/release authority. Owner authorization and normal V3.1 merge reconciliation still apply.

## Adapter audit

Run:

```powershell
node .\scripts\rll1-adapter-source-guard.mjs
```

The audit verifies that PDF Hub remains a thin Common consumer and that the adapter does not contain merge/release/force/delete authority or a local RLL implementation.

## Rollback

To stop local automation:

1. disable the sidecar with the installer;
2. optionally remove RLL transport labels from the active child;
3. retain the child issue, implementation branch, commits and evidence;
4. continue normal interactive Engineering Relay V3.1 execution.

Disabling RLL does not invalidate material engineering work.
