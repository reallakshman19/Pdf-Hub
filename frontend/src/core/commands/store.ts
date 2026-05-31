import { getCommandHandler } from './registry';
import { validateCommand } from './validators';
import type { PdfCommand, PdfCommandResult } from './types';

export interface CommandStoreSnapshot {
  past: PdfCommand[];
  future: PdfCommand[];
}

export class CommandStore {
  private past: PdfCommand[] = [];
  private future: PdfCommand[] = [];

  async execute(command: PdfCommand): Promise<PdfCommandResult> {
    const validation = validateCommand(command);

    if (!validation.ok) {
      return {
        commandId: command.id,
        ok: false,
        dirty: false,
        message: validation.errors.join(' '),
        diagnostics: {
          validation,
        },
      };
    }

    const handler = getCommandHandler(command.type);

    if (!handler) {
      return {
        commandId: command.id,
        ok: false,
        dirty: false,
        message: `No command handler registered for ${command.type}.`,
      };
    }

    const result = await handler(command);

    if (result.ok) {
      this.past.push(command);
      this.future = [];
    }

    return result;
  }

  undo(): PdfCommand | undefined {
    const command = this.past.pop();

    if (command) {
      this.future.push(command);
    }

    return command;
  }

  redo(): PdfCommand | undefined {
    const command = this.future.pop();

    if (command) {
      this.past.push(command);
    }

    return command;
  }

  canUndo(): boolean {
    return this.past.length > 0;
  }

  canRedo(): boolean {
    return this.future.length > 0;
  }

  snapshot(): CommandStoreSnapshot {
    return {
      past: [...this.past],
      future: [...this.future],
    };
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }
}
