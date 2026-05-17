import type { PdfCommand } from './types';

export interface CommandHistoryEntry {
  command: PdfCommand;
  executedAt: string;
  resultMessage?: string;
}

export class CommandHistory {
  private entries: CommandHistoryEntry[] = [];

  push(command: PdfCommand, resultMessage?: string): void {
    this.entries.push({
      command,
      executedAt: new Date().toISOString(),
      resultMessage,
    });
  }

  all(): CommandHistoryEntry[] {
    return [...this.entries];
  }

  clear(): void {
    this.entries = [];
  }
}
