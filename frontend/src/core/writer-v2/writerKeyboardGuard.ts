const handledWriterKeyboardEvents = new WeakSet<KeyboardEvent>();

export function markWriterKeyboardHandled(event: KeyboardEvent): void {
  handledWriterKeyboardEvents.add(event);
}

export function isWriterKeyboardHandled(event: KeyboardEvent): boolean {
  return handledWriterKeyboardEvents.has(event);
}
