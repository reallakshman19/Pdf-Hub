import { v4 as uuidv4 } from 'uuid';
import type { LogLevel, LogSource, AppLogEntry } from './types';
import { useLoggerStore } from './store';

const createEntry = (level: LogLevel, source: LogSource, message: string, data?: Record<string, unknown>): AppLogEntry => ({
  id: uuidv4(),
  timestamp: new Date().toISOString(),
  level,
  source,
  message,
  data,
});

export const log = (source: LogSource, message: string, data?: Record<string, unknown>) => {
  useLoggerStore.getState().addEntry(createEntry('info', source, message, data));
};

export const debug = (source: LogSource, message: string, data?: Record<string, unknown>) => {
  useLoggerStore.getState().addEntry(createEntry('debug', source, message, data));
};

export const warn = (source: LogSource, message: string, data?: Record<string, unknown>) => {
  useLoggerStore.getState().addEntry(createEntry('warn', source, message, data));
};

export const error = (source: LogSource, message: string, data?: Record<string, unknown>) => {
  useLoggerStore.getState().addEntry(createEntry('error', source, message, data));
};

export const emitStartupLog = (mode: string, version: string, userAgent: string) => {
  log('system', 'App startup', { mode, version, userAgent });
};
