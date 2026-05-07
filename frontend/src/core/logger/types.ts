export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSource = 'system' | 'capabilities' | 'session' | 'pdf-renderer' | 'ocr' | 'annotation' | 'macro' | 'writer';

export interface AppLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  message: string;
  data?: Record<string, unknown>;
}
