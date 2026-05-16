import { DocumentCommand, CommandContext, CommandResult } from './types';

export class CommandDispatcher {
  dispatch(command: DocumentCommand, context: CommandContext): Promise<CommandResult> {
    // Stub implementation
    return Promise.resolve({ success: true });
  }
}
