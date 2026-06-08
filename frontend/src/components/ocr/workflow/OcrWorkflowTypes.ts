import type React from 'react';

export type OcrWorkflowState = 'missing-source' | 'ready' | 'running' | 'complete' | 'error';

export type OcrPillTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export interface OcrHeaderPill {
  label: string;
  value: string | number;
  tone?: OcrPillTone;
}

export interface OcrHeaderSummaryModel {
  fileName: string;
  pageCount: number;
  selectedPageCount: number;
  sourceState: string;
  scopeLabel: string;
  workflowState: OcrWorkflowState;
  averageConfidence?: number | null;
  lowConfidenceCount?: number;
}

export interface OcrPrimaryActionModel {
  state: OcrWorkflowState;
  description: string;
  pageScopeLabel: string;
  profileLabel: string;
  progressLabel?: string | null;
  completedLabel?: string | null;
  errorMessage?: string | null;
  canRun: boolean;
  canClear: boolean;
  canCancel: boolean;
  onRun: () => void;
  onClear: () => void;
  onCancel?: () => void;
}

export interface OcrWorkflowPanel {
  title: string;
  description?: string;
  testId: string;
  content: React.ReactNode;
  tone?: OcrPillTone;
}
