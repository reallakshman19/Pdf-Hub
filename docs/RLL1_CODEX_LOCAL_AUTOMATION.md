# PDF Hub RLL-1 Codex local automation

PDF Hub consumes Engineering Relay V3.1 RLL-1 and Common CODEX_LOCAL_V1. This repository keeps only a thin consumer adapter.

Required Common basis:

22d365839e64c19c7ba606e2cf4edc6b9cc2999f

## Topology

Windows Task Scheduler
  -> branch-independent PowerShell wrapper under ~/.rll/pdf-hub/bin
  -> WSL2/Linux provider and deterministic Common launcher
  -> Common rll_worker.py --executor codex
  -> dedicated Linux Codex identity / dedicated CODEX_HOME
  -> codex exec

Windows Task Scheduler is only the host wake. BRANCH_RESUME source-writing execution runs inside WSL2/Linux. Native-Windows BRANCH_RESUME is not qualified.

Common owns issue discovery, execution-envelope validation, directive filtering, mutex/lease state, workspace preparation, provider context retrieval, exact Git observation, allowed-path confinement, launcher-owned commit/push, TASK_EVIDENCE publication and transport-state transitions.

Codex owns only bounded repository inspection/edit/test reasoning.

## Identity and credential split

The WSL provider/launcher identity uses git and gh with browser-backed credential-store authentication.

The dedicated Codex identity defaults to:

    user: rll-codex
    CODEX_HOME: /home/rll-codex/.codex-rll

Codex must not have GitHub provider credentials. The conformance probe verifies that gh authentication is unavailable to the dedicated Codex user.

The scheduled wrapper refuses these process variables:

    GH_TOKEN
    GITHUB_TOKEN
    GH_ENTERPRISE_TOKEN
    GITHUB_ENTERPRISE_TOKEN

Common also removes them from the Codex subprocess.

Do not store provider tokens, passwords or OAuth material in RLL configuration, prompts or scheduled-task arguments.

## Prerequisites

Windows:
- PowerShell with ScheduledTasks;
- WSL2;
- a usable WSL distribution.

Inside the selected WSL2 distribution:
- git;
- gh;
- python3;
- codex;
- sudo;
- provider gh authentication from gh auth login --web;
- dedicated Linux user rll-codex;
- non-interactive sudo delegation from the provider identity to that dedicated user for the bounded Codex invocation;
- Codex authentication under the dedicated CODEX_HOME.

The PDF Hub and Common checkouts must be visible inside WSL2. They may be supplied explicitly with -WslRepoRoot and -WslCommonRoot, or Windows checkouts may be converted with wslpath.

## 1. WSL2 Codex conformance

Run:

    .\scripts\rll1-codex-conformance.ps1 -CommonRepoRoot 'C:\Code\Common'

Optional parameters include -WslDistro, -WslCommonRoot, -CodexUser and -CodexHome.

The probe uses a disposable WSL2 Git repository and verifies:

- WSL2 rather than native-Windows write execution;
- current Common basis;
- WSL provider gh authentication;
- dedicated Codex authentication;
- dedicated Codex identity has no gh provider authentication;
- provider token environment variables are absent;
- bounded non-interactive codex exec;
- JSON/schema-bound read-only execution;
- read-only execution does not mutate repository material;
- JSON/schema-bound workspace-write execution;
- workspace-write can create only the requested probe file;
- web search disabled;
- workspace-write network access disabled;
- approvals_reviewer=user;
- no dangerous sandbox/approval bypass;
- bounded timeout / no indefinite stdin wait.

A passing probe writes:

    ~/.rll/pdf-hub/codex-conformance.json

The marker is bound to the current Common basis, WSL distribution, WSL kernel, Codex user/home and Codex version.

This low-level conformance probe does not replace the required RLL exact-head, overlap and disposable branch-write smoke gates.

## 2. Install scheduled worker in smoke mode

Initial installation is smoke-first:

    .\scripts\install-rll1-codex-task.ps1 -CommonRepoRoot 'C:\Code\Common'

The installer:

- verifies WSL2;
- verifies WSL git, gh, python3, codex and sudo;
- verifies provider gh authentication;
- verifies isolated Codex authentication;
- verifies current Common basis;
- verifies the selected smoke issue is open and has no REVIEW_READY/CANCELLED RLL history;
- ensures the four RLL labels exist;
- copies scripts/rll1-codex-worker.ps1 to ~/.rll/pdf-hub/bin/rll1-codex-worker.ps1;
- schedules that branch-independent copy, not the governed checkout copy;
- uses a 10-minute default cadence;
- uses MultipleInstances IgnoreNew;
- runs as the current interactive Windows user with limited privileges;
- keeps Common's mutex as the second overlap guard;
- writes non-secret config to ~/.rll/pdf-hub/codex-worker.json;
- defaults to smoke mode.

The default fresh smoke issue is #350 until it reaches REVIEW_READY/CANCELLED. A later disposable branch-write smoke must use a new fresh issue.

Inspect:

    Get-ScheduledTask -TaskName 'PDF Hub RLL-1 Codex'
    Get-ScheduledTaskInfo -TaskName 'PDF Hub RLL-1 Codex'
    Get-Content "$HOME\.rll\pdf-hub\codex-worker.json"

Worker logs:

    ~/.rll/pdf-hub/logs/worker.log

## 3. Required smoke and promotion sequence

Do not enable production source-writing first.

Required sequence:

A. adapter/source guard
   -> PASS

B. fresh deterministic smoke
   -> fresh open issue
   -> rll-ready
   -> scheduler pickup
   -> mutex/state mutation
   -> no Codex invocation
   -> SMOKE_COMPLETE

C. exact-head Codex smoke
   -> enable executor after WSL2 conformance
   -> EXACT_HEAD_EVIDENCE
   -> read-only sandbox
   -> unchanged exact head
   -> clean tree
   -> Common-owned TASK_EVIDENCE
   -> REVIEW_READY

D. overlap smoke
   -> overlapping host wake
   -> Task Scheduler IgnoreNew and/or Common mutex prevents competing ownership

E. fresh disposable WSL2/Linux branch-write smoke
   -> new fresh smoke issue
   -> BRANCH_RESUME
   -> explicit allowed_paths
   -> one harmless allowed edit
   -> out-of-scope write rejected
   -> Codex cannot move HEAD
   -> Common launcher commits and pushes
   -> exact evidence published

F. production activation
   -> only after all required gates pass
   -> repin production envelope to worker codex-local
   -> add rll-ready

Do not reuse a completed or REVIEW_READY smoke issue for a new smoke purpose.

## 4. Enable Codex execution

After WSL2 conformance and deterministic smoke review:

    .\scripts\install-rll1-codex-task.ps1 -CommonRepoRoot 'C:\Code\Common' -EnableExecution

This permits eligible RLL work to invoke Codex. It is not by itself production BRANCH_RESUME authority. The issue still requires an authorized execution envelope and rll-ready, and production writes remain withheld until all required smoke gates pass.

## 5. Execution envelopes

### Read-only exact-head evidence

    RLL_EXECUTION_V1

    transport: RLL-1
    worker: codex-local
    mode: EXACT_HEAD_EVIDENCE
    repository: reallaksh19/Pdf-Hub
    head_sha: <exact-sha>
    base_sha: <comparison-base-sha>
    allow_material_write: false

For exact-head evidence, allowed_paths is empty/not used.

### Governed branch implementation

    RLL_EXECUTION_V1

    transport: RLL-1
    worker: codex-local
    mode: BRANCH_RESUME
    repository: reallaksh19/Pdf-Hub
    branch: <governed-branch>
    base_sha: <approved-base-sha>
    allow_material_write: true
    allowed_paths: <path/one>; <path/two>
    commit_message: <launcher-owned bounded commit message>

For CODEX_LOCAL_V1 BRANCH_RESUME, allowed_paths is mandatory and semicolon-delimited.

Codex may edit/test only. Common verifies changed-path confinement, verifies Codex did not move Git HEAD, runs git diff --check, stages, commits, confirms the remote branch did not advance, pushes without force, re-observes material truth and publishes durable evidence.

## 6. Phase 13.7 production migration

Engineering issue #342 and PR #345 remain the existing engineering task/material.

Current governed branch:

    phase13/native-spacing-and-compound-shows

Approved base:

    9e7d3476b5a14f9ccb09417fc56a34b724bd0063

Current accepted branch material before the outstanding correction:

    616bd4c268e6d3e3afa69b18ef7962a985f3230f

After all smoke gates pass, the production envelope should use:

    worker: codex-local
    mode: BRANCH_RESUME
    branch: phase13/native-spacing-and-compound-shows
    base_sha: 9e7d3476b5a14f9ccb09417fc56a34b724bd0063
    allow_material_write: true
    allowed_paths: frontend/src/core/existing-text/contentStreamScanner.ts; frontend/src/core/existing-text/__tests__/contentStreamScanner.test.ts
    commit_message: Phase 13.7: fail closed on malformed double-quote spacing state

This preserves the existing branch and engineering authorization. It does not restart Phase 13.7.

The outstanding correction requires:
- fully validate compound double-quote operands before proving spacing;
- poison both spacing proofs on malformed compound operands;
- preserve valid aw/ac spacing updates when placement alone is unsupported;
- add the specified recovery regression journeys;
- rerun focused and affected compatibility certification.

The historical directive wording that says the engineering agent should commit/push is superseded only at the transport-mechanics layer: Codex edits/tests; Common owns commit/push. The engineering correction itself remains authoritative.

## 7. Failure classification

Transport RETRY_WAIT includes transient quota/runtime/network failures, missing local prerequisite, Codex auth unavailable and native-Windows source-write requests.

Transport ESCALATION_REQUIRED includes:
- Codex changes Git HEAD;
- changed path escapes allowed_paths;
- exact-head worktree becomes dirty;
- remote governed branch advances during execution;
- provider credentials are exposed to Codex;
- reconciliation would require reset/rebase/force;
- a protected surface must change.

Engineering results remain independently classified as PASS, FAIL, BLOCKED, NOT_RUN or NOT_APPLICABLE.

## 8. Disable / rollback

Disable the Windows task without requiring Codex, GitHub or Common health:

    .\scripts\install-rll1-codex-task.ps1 -Disable

Disabling automation does not invalidate durable Git material or engineering evidence.

## 9. Adapter audit

Run:

    node .\scripts\rll1-adapter-source-guard.mjs

The guard checks current Common pin, WSL2 write topology, identity isolation, token isolation, branch-independent scheduling, mandatory allowed_paths documentation and authority boundaries.

## Authority boundary

RLL and Codex never grant merge or release authority. REVIEW_READY is evidence-ready transport state, not engineering acceptance. Merge remains a direct Owner decision after independent exact-head review.
