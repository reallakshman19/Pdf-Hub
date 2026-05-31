import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useWriterStore } from '@/core/writer/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

/**
 * Resets all active tool state across every store to a neutral "select" baseline.
 * Call this from Escape handlers, Select buttons, and annotation click handlers.
 */
export function resetInteractionState(): void {
  useEditorStore.getState().setActiveTool('select');
  useAnnotationStore.getState().clearSelection();
  useAnnotationStore.getState().setActiveAnnotationId(null);
  useWriterStore.getState().setActiveTool('select');
  useWriterStore.getState().clearSelection();
  useWriterV2Store.getState().setActiveWriterTool('select');
  useWriterV2Store.getState().dispatchWriterCommand({ type: 'CLEAR_WRITER_SELECTION' });
}
