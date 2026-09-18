import { dispatchPdfCommand } from './dispatch';
import { validateCommand } from './validators';
import type {
  CommandExecutionInput,
  CommandResult,
} from './types';

let executionTail: Promise<unknown> = Promise.resolve();

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
): Promise<CommandResult> {
  const validation = validateCommand(input.command);
  if (!validation.ok) {
    return validationFailure(
      input,
      validation.errors.join(' '),
    );
  }
  return dispatchPdfCommand(input);
}

export const commandBus = {
  execute(input: CommandExecutionInput): Promise<CommandResult> {
    const run = executionTail.then(() => executeNow(input));
    executionTail = run.catch(() => undefined);
    return run;
  },
};

export function resetCommandBusForTests(): void {
  executionTail = Promise.resolve();
}
