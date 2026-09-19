/**
 * Document history policy constants.
 * All undo/redo retention behaviour is governed by this file.
 * Do not hardcode these values elsewhere.
 */
const MEBIBYTE = 1024 * 1024;

export const HISTORY_POLICY = {
  /** Maximum number of contiguous undo transactions retained. */
  maxUndoDepth: 15,

  /**
   * Maximum unique inline PDF snapshot bytes retained across undo and redo
   * history. Revision-aware states retain immutable revision locators instead
   * and therefore do not consume this compatibility byte budget.
   */
  maxRetainedBytes: 256 * MEBIBYTE,

  /** Always retain at least the newest transaction. */
  minimumRetainedTransactions: 1,

  /** Documents above this size should normally retain fewer than 15 steps. */
  largeDocumentThresholdBytes: 25 * MEBIBYTE,

  /** Documents above this size will normally retain only one or two steps. */
  veryLargeDocumentThresholdBytes: 64 * MEBIBYTE,

  /** Prefer immutable revision locators; byte-budget legacy snapshots only. */
  strategy: 'revision-preferred-byte-budgeted' as const,
} as const;
