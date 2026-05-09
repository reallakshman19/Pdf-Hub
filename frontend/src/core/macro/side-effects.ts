import type {
  MacroMutableState,
  SideEffect,
} from './registry';

export function applySideEffectToState(
  state: MacroMutableState,
  effect: SideEffect,
): void {
  if (effect.type === 'bytes_updated') {
    state.workingBytes = effect.bytes;
    return;
  }

  if (effect.type === 'page_count_changed') {
    state.pageCount = effect.newCount;
    return;
  }

  if (effect.type === 'output_file') {
    state.outputFiles.push({
      name: effect.name,
      bytes: effect.bytes,
    });
    return;
  }

  if (effect.type === 'selection_changed') {
    state.selectedPages = effect.selectedPages;
    return;
  }

  if (effect.type === 'log') {
    state.logs.push(effect.message);
  }
}
