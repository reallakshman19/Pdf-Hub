export type OcrStatus = 
  | 'queued' 
  | 'running' 
  | 'complete' 
  | 'equation-failed' 
  | 'low-confidence' 
  | 'cancelled' 
  | 'timeout';

export interface OcrJob {
  id: string;
  status: OcrStatus;
  startedAt: string;
  totalPages: number;
  completedPages: number;
}

export interface TextBlock {
  id: string;
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  confidence: number;
  type: 'text';
}

export interface EquationBlock {
  id: string;
  latex: string | null;
  rawImageRegion?: string;
  rect: { x: number; y: number; width: number; height: number };
  confidence: number | null;
  type: 'equation';
  renderStatus: 'pending' | 'success' | 'failed';
  failureReason?: string;
}

export interface OcrPageResult {
  pageNumber: number;
  status: OcrStatus;
  textBlocks: TextBlock[];
  equationBlocks: EquationBlock[];
  processingTimeMs: number;
  lowConfidenceReason?: string;
}

export interface OcrResult {
  jobId: string;
  status: OcrStatus;
  pages: OcrPageResult[];
}
