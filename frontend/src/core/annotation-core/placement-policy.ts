// src/core/annotation-core/placement-policy.ts
// ⚠️ INVARIANT: All obstacle penalties must flow through PlacementPolicy (AD-03).
// NEVER hardcode penalty numbers in the layout engine.

import type { ObstacleKind } from './page-scene';

export interface PlacementPolicy {
  /** Obstacle kinds whose box overlap is NEVER permitted. Beam search discards such candidates. */
  prohibited: ReadonlySet<ObstacleKind>;
  /** Score penalty for callout box overlapping each obstacle kind (default 0) */
  boxPenalties: Partial<Record<ObstacleKind, number>>;
  /** Score penalty for leader line crossing each obstacle kind (default 0) */
  leaderPenalties: Partial<Record<ObstacleKind, number>>;
  /** Score below which the solver auto-approves without requiring review */
  autoApproveThreshold: number;
  /** Score below which the solver marks as compromised and requires review */
  reviewThreshold: number;
  /** Whether margin-rail fallback placement is permitted */
  allowMarginRail: boolean;
  /** Minimum clearance (points) between callout box and any obstacle */
  minimumClearance: number;
}

/** Standard piping-isometric placement policy.
 *
 * ⚠️ DO NOT loosen `prohibited` without explicit product decision (AD-02).
 * Dimensions and title-blocks must NEVER be silently obscured.
 */
export const PIPING_ISO_PLACEMENT_POLICY: PlacementPolicy = {
  prohibited: new Set<ObstacleKind>([
    'title-block',
    'revision-block',
    'dimension-text',
    'equipment-tag',
  ]),
  boxPenalties: {
    'text': 35,
    'pipe-line': 50,
    'symbol': 40,
    'dimension-line': 80,
    'existing-annotation': 200,
    'generated-callout': 1000,
  },
  leaderPenalties: {
    'text': 20,
    'pipe-line': 10,  // tolerated for single crossing
    'symbol': 30,
    'dimension-line': 60,
    'title-block': 1000,
    'generated-callout': 200,
    'generated-leader': 150,
  },
  autoApproveThreshold: 80,
  reviewThreshold: 40,
  allowMarginRail: true,
  minimumClearance: 6,
};
