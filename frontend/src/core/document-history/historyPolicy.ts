/**
 * Document history policy constants.
 * All undo/redo behaviour is governed by this file.
 * Do not hardcode these values elsewhere.
 */
export const HISTORY_POLICY = {
  /**
   * Maximum number of undo steps retained in memory.
   * Each step stores before + after full PDF bytes.
   * At 25 MB per PDF: 15 steps × 2 × 25 MB = 750 MB worst case.
   * For larger PDFs, consider IndexedDB offloading in a future phase.
   */
  maxUndoDepth: 15,

  /**
   * Documents above this size (bytes) are candidates for off-heap history.
   * Currently informational — used for telemetry only.
   */
  largeDocumentThresholdBytes: 25 * 1024 * 1024,

  /**
   * History storage strategy.
   * 'full-snapshot-capped' = full before/after bytes, capped at maxUndoDepth.
   * Future: 'diff' = store binary diffs, unlimited depth.
   */
  strategy: 'full-snapshot-capped' as const,
} as const;
