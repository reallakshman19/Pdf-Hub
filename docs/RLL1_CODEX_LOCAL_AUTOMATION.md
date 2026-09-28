# PDF Hub RLL-1 Codex local automation

PDF Hub consumes Engineering Relay V3.1 RLL-1 from reallaksh19/Common and uses Common CODEX_LOCAL_V1.

This repository contains only a thin Windows adapter.

## Architecture

Windows Task Scheduler
  -> scripts/rll1-codex-worker.ps1
  -> Common skills/engineering-pr-delivery-v3.1/scripts/rll_worker.py --executor codex
  -> codex exec
  -> Common Git/provider postflight

Common owns issue discovery, execution-envelope validation, directive filtering, mutex and lease state, workspace preparation, exact material observation, bounded branch push, executor evidence publication and transport-state transitions.

Required Common basis:

e551cb50941b160b50cc21ea76888f2b962ca248

## Prerequisites

Install and authenticate Python, Git, GitHub CLI gh, OpenAI Codex CLI codex, and a local checkout of reallaksh19/Common.

Verify:

    python --version
    git --version
    gh --version
    gh auth status
    codex --version
    codex login status

The Windows Scheduled Task runs as the current interactive user with limited privileges. GitHub and Codex credentials remain in the user's existing credential stores; the RLL config stores no token or password.

## 1. Native-Windows Codex conformance

Before source-writing execution, prove the installed Codex can honor both read-only and workspace-write modes on this machine:

    .\scripts\rll1-codex-conformance.ps1 -CommonRepoRoot 'C:\Code\Common'

The probe uses a disposable temporary Git repository and verifies:

- Codex authentication;
- bounded non-interactive codex exec;
- schema-bound --output-last-message;
- read-only mode makes no unexpected workspace mutation;
- workspace-write mode actually creates a known probe file.

A passing probe writes:

    ~/.rll/pdf-hub/codex-conformance.json

The marker is bound to the current machine, Windows user, installed Codex version, and required Common basis. If Codex is upgraded, rerun conformance before re-enabling source execution.

Conformance does not touch PDF Hub product source or GitHub issue state.

## 2. Install Windows Task Scheduler worker in smoke mode

Initial installation is non-destructive:

    .\scripts\install-rll1-codex-task.ps1 -CommonRepoRoot 'C:\Code\Common'

The installer:

- ensures rll-ready, rll-active, rll-review-ready and rll-escalation labels exist;
- writes non-secret worker config to ~/.rll/pdf-hub/codex-worker.json;
- stores the currently validated tool PATH so scheduled runs resolve git, gh, python and codex;
- registers Windows Task Scheduler task PDF Hub RLL-1 Codex;
- repeats every 10 minutes by default;
- uses MultipleInstances: IgnoreNew;
- runs as the current interactive user with limited privileges;
- defaults to smoke mode.

Common's local mutex remains a second overlap guard.

Inspect:

    Get-ScheduledTask -TaskName 'PDF Hub RLL-1 Codex'
    Get-ScheduledTaskInfo -TaskName 'PDF Hub RLL-1 Codex'
    Get-Content "$HOME\.rll\pdf-hub\codex-worker.json"

Worker logs are written to:

    ~/.rll/pdf-hub/logs/worker.log

## 3. Smoke mode

Smoke mode lets Common perform deterministic RLL setup without invoking Codex.

It may acquire/release the local mutex, discover an eligible RLL issue, validate RLL_EXECUTION_V1, prepare the governed workspace, update the singular RLL_WORKER_STATE_V1 comment and transition transport labels.

It must not run Codex or change product source.

Use -RunNow only when an immediate scheduled smoke is intended.

## 4. Enable source execution

Source execution requires a valid local conformance marker:

    .\scripts\install-rll1-codex-task.ps1 -CommonRepoRoot 'C:\Code\Common' -EnableExecution

The installer refuses execution mode if conformance does not match the current Codex version, machine, user or required Common basis.

## 5. Disable

    .\scripts\install-rll1-codex-task.ps1 -Disable

This disables the Windows scheduled task. It does not delete GitHub issues, branches, evidence or RLL state.

## Execution envelope

Codex is local executor configuration; the issue envelope identifies the stable worker:

    RLL_EXECUTION_V1

    transport: RLL-1
    worker: pdfhub-rll-local
    mode: BRANCH_RESUME
    repository: reallaksh19/Pdf-Hub
    branch: owned-branch
    base_sha: <approved-base>
    allow_material_write: true

For exact-head evidence use worker pdfhub-rll-local, mode EXACT_HEAD_EVIDENCE, the exact head SHA, comparison base SHA, and allow_material_write false.

Executor selection is not controlled by ordinary issue comments.

## Directives

Only authorized structured RELAY_DIRECTIVE_V1 envelopes are transport commands. Ordinary comments remain context.

Supported actions remain CONTINUE, PAUSE, RESUME, REPLAN and CANCEL.

## Phase 13.7 migration

After this adapter is merged and local conformance/smoke pass, #342 may receive a new authorized RLL_EXECUTION_V1 envelope with:

    worker: pdfhub-rll-local
    mode: BRANCH_RESUME
    branch: phase13/native-spacing-and-compound-shows
    base_sha: 9e7d3476b5a14f9ccb09417fc56a34b724bd0063

Its existing material must be preserved. The approved base is an ancestry boundary, not a reset target.

The outstanding correction directive remains durable issue history. Migration must not invent a new engineering plan merely because the executor changed.

## Evidence and authority

Transport state is not engineering acceptance.

REVIEW_READY means exact material/evidence is available for independent review. It does not grant merge authority.

Common may publish executor-provided evidence after binding it to the observed Git head. Git material truth outranks executor claims and mutable transport state.

## Adapter audit

Run:

    node .\scripts\rll1-adapter-source-guard.mjs

The audit proves PDF Hub remains a thin Common consumer and rejects executor/scheduler authority drift.

## Rollback

1. Disable the Windows task.
2. Leave durable GitHub issue, branch and evidence intact.
3. Remove or pause RLL eligibility if required.
4. Continue normal interactive V3.1 engineering.

Disabling RLL does not invalidate engineering material truth.
