import type { ReactNode } from 'react';

export type OcrAssistantPanelState = 'idle' | 'ready' | 'running' | 'complete' | 'error';

export interface OcrAssistantSection {
  id: string;
  title: string;
  content: ReactNode;
}

export interface OcrAssistantValueAddition {
  phase: string;
  item: string;
  userValue: string;
}
