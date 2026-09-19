import { error as logError } from '@/core/logger/service';
import type {
  WriterV2CommandResult,
} from './writerCommandStore';
import type {
  WriterCommand,
} from './writerCommands';
import {
  useWriterV2Store,
} from './writerV2Store';

export async function dispatchDurableWriterUiCommand(
  command: WriterCommand,
  context: string,
): Promise<WriterV2CommandResult> {
  try {
    return await useWriterV2Store
      .getState()
      .dispatchWriterCommandDurable(command);
  } catch (error) {
    logError(
      'writer',
      'Durable Writer UI mutation failed',
      {
        context,
        commandType: command.type,
        error:
          error instanceof Error
            ? error.message
            : String(error),
      },
    );
    throw error;
  }
}
