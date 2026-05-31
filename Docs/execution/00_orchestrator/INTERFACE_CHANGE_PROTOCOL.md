# Interface Change Protocol

Once public contracts are frozen by A0, parallel agents (A1-A8) cannot alter them independently. This document provides the protocol for requesting, reviewing, and approving changes to frozen interfaces.

## 1. Scope of Frozen Interfaces
This applies to any contract defined in `CONTRACT_FREEZE.md` or any structural changes crossing the boundaries defined in `FILE_OWNERSHIP_MATRIX.md`.

## 2. Requesting a Change
If an agent determines a change to a frozen interface is unavoidable, they must submit a change request.
1. Document the proposed change.
2. Provide a rationale outlining why the current contract is insufficient and cannot be worked around.
3. Assess the blast radius across dependent agents (consult `DEPENDENCY_GRAPH.md`).

## 3. Orchestrator Review (A0)
1. A0 reviews the change request against the core program rationale.
2. A0 assesses whether the request creates duplicate execution paths or jeopardizes strict constraints (e.g., static-mode safety).
3. If approved, A0 records the exception in `DECISIONS_LOG.md`.

## 4. Execution & Dissemination
1. The approved change must be implemented according to the prescribed merge order or explicit sequencing by A0.
2. A0 alerts all downstream dependent agents of the contract update.
3. The originating agent updates tests and type definitions to conform to the new structure.
