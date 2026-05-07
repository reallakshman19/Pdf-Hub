export interface DocumentCommand {
  id: string;
  type: string;
  payload: any;
}

export type CommandSource = 'toolbar' | 'thumbnail_menu' | 'macro_runner' | 'shortcuts' | 'unknown';

export interface CommandResult {
  success: boolean;
  error?: string;
  data?: any;
}

export interface CommandContext {
  source: CommandSource;
  timestamp: number;
}
