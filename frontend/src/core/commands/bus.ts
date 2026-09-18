import { dispatchPdfCommand } from './dispatch';
import type {
  CommandExecutionInput,
  CommandResult,
} from './types';

let executionTail: Promise<unknown> = Promise.resolve();

async function executeNow(
  input: CommandExecutionInput,
): Promise<CommandResult> {
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
