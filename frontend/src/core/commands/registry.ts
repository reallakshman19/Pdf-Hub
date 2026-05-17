import type { PdfCommand, PdfCommandResult } from './types';

export type CommandHandler<T extends PdfCommand = PdfCommand> = (
  command: T,
) => PdfCommandResult | Promise<PdfCommandResult>;

const registry = new Map<PdfCommand['type'], CommandHandler>();

export function registerCommandHandler<T extends PdfCommand>(
  type: T['type'],
  handler: CommandHandler<T>,
): void {
  registry.set(type, handler as CommandHandler);
}

export function getCommandHandler(type: PdfCommand['type']): CommandHandler | undefined {
  return registry.get(type);
}

export function hasCommandHandler(type: PdfCommand['type']): boolean {
  return registry.has(type);
}

export function clearCommandHandlers(): void {
  registry.clear();
}
