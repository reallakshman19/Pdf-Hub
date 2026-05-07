export type SaveActionType = 'auto_save' | 'manual_save' | 'save_as';
export type ExportActionType = 'export_pdf' | 'export_png' | 'export_text';

export interface LastOperationMetadata {
  actionId: string;
  timestamp: number;
  status: 'pending' | 'success' | 'error';
  errorMessage?: string;
}
