# Emergency Rollback Plan

This document outlines the procedure to execute an emergency rollback if a merge violates strict program constraints, introduces critical regressions, or breaks downstream execution tracks.

## Triggers for Rollback
1. Persistent build failure (`tsc --noEmit`, lint, or unit tests) introduced by a new merge.
2. Silent-skip behavior or silent failures identified during manual smoke testing.
3. Breaking of frozen contracts without A0 approval.
4. Duplicate execution paths or out-of-order merges breaking the dependency graph.

## Rollback Procedure
1. **Identify the Offending Commit:** Pinpoint the specific commit or PR that introduced the failure using bisect or logs.
2. **Halt Merges:** A0 pauses all pending merges (A1-A8) to prevent compounding errors.
3. **Revert Execution:** Issue a git revert on the target commit. If multiple commits are involved, revert the entire feature branch merge.
4. **Validation:** Run the `GLOBAL_GATE.md` checks on the reverted state.
5. **Log Event:** Document the rollback in `DECISIONS_LOG.md` detailing:
   - Offending Agent/Branch
   - Reason for failure
   - Remediation requirements before re-merging
6. **Resume:** Once validated, orchestrator unpauses merges and notifies the affected agent to correct the implementation.
