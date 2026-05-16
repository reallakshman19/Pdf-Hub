export type AppMode = 'preview' | 'server';

export interface AppCapabilities {
  mode: AppMode;
  canOpenLocalFile: boolean;
  canMergeFiles: boolean;
  canSplitFile: boolean;
  canRunPreviewOcr: boolean;
  canRunServerOcr: boolean;
  canRunMacroApi: boolean;
  serverVersion: string | null;
  serverLatencyMs: number | null;
}
