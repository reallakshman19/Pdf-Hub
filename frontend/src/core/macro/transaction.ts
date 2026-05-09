// @ts-nocheck
import { useAnnotationStore } from '@/core/annotations/store';
import { useWriterStore } from '@/core/writer/store';
import type { MacroMutableState, SideEffect } from './registry';

export interface MacroTransactionSnapshot {
  workingBytes: Uint8Array;
  pageCount: number;
  selectedPages: number[];
  outputFiles: { name: string; bytes: Uint8Array }[];
  annotations: ReturnType<typeof useAnnotationStore.getState>['annotations'];
  writerElements: ReturnType<typeof useWriterStore.getState>['elements'];
}

export function beginMacroTransaction(state: MacroMutableState): MacroTransactionSnapshot {
  return {
    workingBytes: new Uint8Array(state.workingBytes),
    pageCount: state.pageCount,
    selectedPages: [...state.selectedPages],
    outputFiles: state.outputFiles.map((file) => ({
      name: file.name,
      bytes: new Uint8Array(file.bytes),
    })),
    annotations: useAnnotationStore.getState().annotations.map((annotation) => ({
      ...annotation,
      rect: { ...annotation.rect },
      data: { ...annotation.data },
    })),
    writerElements: useWriterStore.getState().elements.map((element) => ({
      ...element,
      styles: { ...(element.styles ?? {}) },
    })),
  };
}

export function rollbackMacroTransaction(
  state: MacroMutableState,
  snapshot: MacroTransactionSnapshot,
): void {
  state.workingBytes = new Uint8Array(snapshot.workingBytes);
  state.pageCount = snapshot.pageCount;
  state.selectedPages = [...snapshot.selectedPages];
  state.outputFiles = snapshot.outputFiles.map((file) => ({
    name: file.name,
    bytes: new Uint8Array(file.bytes),
  }));

  useAnnotationStore.setState({
    annotations: snapshot.annotations,
    selectedAnnotationIds: [],
    activeAnnotationId: null,
  });

  useWriterStore.setState({
    elements: snapshot.writerElements,
    selectedIds: [],
    activeId: null,
    activeTool: 'select',
  });
}

export function applyMacroSideEffects(
  sideEffects: SideEffect[],
  state: MacroMutableState,
): void {
  for (const effect of sideEffects) {
    if (effect.type === 'bytes_updated') state.workingBytes = effect.bytes;

    if (effect.type === 'page_count_changed') {
      state.pageCount = effect.newCount;
      state.selectedPages = state.selectedPages.filter(
        (page) => page >= 1 && page <= effect.newCount,
      );
    }

    if (effect.type === 'output_file') {
      state.outputFiles.push({
        name: effect.name,
        bytes: effect.bytes,
      });
    }
  }
}

export function buildMacroRollbackMessage(
  ctx: { fileName: string },
  stepIndex: number,
  op: string,
  message?: string,
): string {
  return [
    `Macro rolled back for ${ctx.fileName}`,
    `at step ${stepIndex + 1}`,
    `(${op})`,
    message ? `: ${message}` : '',
  ].join(' ');
}
