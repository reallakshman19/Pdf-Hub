# PDF Hub RLL-1 repository adapter

This repository is a thin consumer of Engineering Relay V3.1 RLL-1 in Common.

## Authority

- Root AGENTS.md governs PDF Hub engineering.
- Engineering Relay V3.1 governs engineering authority, evidence, review and merge boundaries.
- RLL-1 is transport only.
- Read and obey the authorized RLL_EXECUTION_V1 envelope on the governed child.
- The canonical launcher is Common skills/engineering-pr-delivery-v3.1/scripts/rll_worker.py.
- Required Common CODEX_LOCAL_V1 basis: 22d365839e64c19c7ba606e2cf4edc6b9cc2999f.
- The standard local worker identity is codex-local.
- Executor selection is machine configuration and does not create engineering authority.

Do not reproduce issue discovery, lease, directive, worktree, state-machine, schema or result-authority logic in PDF Hub.

## Execution modes

BRANCH_RESUME resumes current governed-branch material truth. base_sha is an ancestry boundary, never a reset target. For Codex, BRANCH_RESUME requires explicit repository-relative allowed_paths and a launcher-owned commit message.

EXACT_HEAD_EVIDENCE uses the declared immutable head for read-only evidence. Repository material must return clean at the exact declared head.

## Machine and identity boundary

Windows Task Scheduler is only the host wake. The deterministic provider/launcher runs under WSL2/Linux.

The provider/launcher identity owns:
- git and gh provider access;
- issue discovery, mutex, lease and directives;
- worktree preparation;
- Git HEAD/ref observation;
- changed-path confinement;
- launcher-owned commit/push;
- TASK_EVIDENCE and RLL state.

Codex runs under a dedicated Linux user with a dedicated CODEX_HOME and repository-worktree access only. Codex must not receive GitHub credentials or provider authority.

The scheduled wrapper must refuse GH_TOKEN, GITHUB_TOKEN, GH_ENTERPRISE_TOKEN and GITHUB_ENTERPRISE_TOKEN. Common also scrubs those variables from the Codex subprocess.

Codex must not invoke gh, GitHub APIs, GitHub MCP, web/network research, commit, push, rebase, merge or mutate Git refs.

## Source-write qualification

Native-Windows BRANCH_RESUME is not qualified and must fail closed.

Source-writing Codex execution requires WSL2/Linux plus all current smoke gates:
1. adapter/source-guard validation;
2. fresh deterministic smoke;
3. exact-head read-only Codex smoke;
4. overlap/mutex smoke;
5. fresh disposable WSL2/Linux BRANCH_RESUME write smoke proving allowed_paths and launcher-owned commit/push.

Production rll-ready is restored only after the required smoke sequence passes.

## Provider and directive boundary

RLL execution uses native git plus authenticated gh / gh api in the WSL provider identity. It does not depend on GitHub MCP.

Ordinary comments are context. Only launcher-filtered authorized RELAY_DIRECTIVE_V1 envelopes may control transport.

## Safety

Never:
- merge a pull request or create a release;
- delete or force-update branches;
- close programme work;
- infer Owner approval;
- weaken tests or acceptance criteria;
- convert FAIL, BLOCKED or NOT_RUN into PASS;
- broaden explicit issue non-goals;
- use a dangerous Codex approval/sandbox bypass.

Routine unspecified implementation details remain engineering research responsibility inside the bounded task.
