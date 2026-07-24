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
   * Maximum unique PDF snapshot bytes retained across undo and redo history.
   * Adjacent transactions may share their boundary snapshot, which is counted
   * once. A single newest transaction is retained even when it exceeds this
   * budget so the most recent action remains undoable.
   */
  maxRetainedBytes: 256 * MEBIBYTE,

  /** Always retain at least the newest transaction. */
  minimumRetainedTransactions: 1,

  /** Documents above this size should normally retain fewer than 15 steps. */
  largeDocumentThresholdBytes: 25 * MEBIBYTE,

  /** Documents above this size will normally retain only one or two steps. */
  veryLargeDocumentThresholdBytes: 64 * MEBIBYTE,

  /** Full snapshots with contiguous suffix trimming by depth and unique bytes. */
  strategy: 'full-snapshot-byte-budgeted' as const,
} as const;
