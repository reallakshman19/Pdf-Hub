export interface BatchRunReport {
  recipeId: string;
  startTime: string;
  endTime: string;
  totalFiles: number;
  successCount: number;
  failureCount: number;
  results: {
    fileName: string;
    status: 'success' | 'failure';
    error?: string;
    logs?: string[];
  }[];
}
