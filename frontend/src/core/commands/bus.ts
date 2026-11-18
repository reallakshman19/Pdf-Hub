import { dispatchPdfCommand } from './dispatch';
import { captureDocumentMutationOwner, type DocumentMutationOwner } from '@/core/session/mutationOwner';
import {
  enqueueDocumentOperation,
  resetDocumentOperationQueueForTests,
} from './documentOperationQueue';
import { validateCommand } from './validators';
import type {
  CommandExecutionInput,
  CommandResult,
} from './types';

function validationFailure(
  input: CommandExecutionInput,
  message: string,
): CommandResult {
  return {
    success: false,
    commandId: input.command.id,
    commandType: input.command.type,
    source: input.command.source,
    mutated: false,
    message,
    error: {
      code: 'VALIDATION_FAILED',
      message,
    },
  };
}

async function executeNow(
  input: CommandExecutionInput,
  owner: DocumentMutationOwner,
): Promise<CommandResult> {
  const validation = validateCommand(input.command);
  if (!validation.ok) {
    return validationFailure(
      input,
      validation.errors.join(' '),
    );
  }
  return dispatchPdfCommand(input, owner);
}

export const commandBus = {
  execute(input: CommandExecutionInput): Promise<CommandResult> {
    const owner = captureDocumentMutationOwner();
    return enqueueDocumentOperation(() => executeNow(input, owner));
  },
};

export function resetCommandBusForTests(): void {
  resetDocumentOperationQueueForTests();
}
