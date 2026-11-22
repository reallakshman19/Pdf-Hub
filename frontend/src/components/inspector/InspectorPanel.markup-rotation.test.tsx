import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

const markup = (sourceHash?: string): PdfAnnotation => ({
  id: 'synthetic-markup', type: 'highlight', pageNumber: 1,
  rect: { x: 20, y: 30, width: 100, height: 40 }, createdAt: 1, updatedAt: 1,
  data: { nativeMarkupRotationSourceHash: sourceHash, textMarkupQuads: [0, 0, 1, 0, 0, 1, 1, 1] },
} as PdfAnnotation);

describe('native markup rotation controls', () => {
  beforeEach(() => { useEditorStore.setState({ inspectorTab: 'properties', rightPanelWidth: 18, activeMode: 'annotate' }); });

  it.each([undefined, 'source-hash'])('enables rotation only when the actual source is supported', (sourceHash) => {
    const annotation = markup(sourceHash);
    useAnnotationStore.setState({ annotations: [annotation], selectedAnnotationIds: [annotation.id], activeAnnotationId: annotation.id });
    render(<InspectorPanel />);
    const button = screen.getByRole('button', { name: 'Rotate 90° clockwise' });
    expect(button).toHaveProperty('disabled', !sourceHash);
    if (!sourceHash) return;
    fireEvent.click(button);
    const changed = useAnnotationStore.getState().annotations[0];
    expect(changed.rect).toEqual({ x: 50, y: 0, width: 40, height: 100 });
    expect(changed.data.textMarkupQuads).toEqual([1, 0, 1, 1, 0, 0, 0, 1]);
    expect(changed.data.nativeMarkupTurn).toEqual({ turns: 1, sourceHash });
  });

  it('disables turning an unresolved clipboard copy', () => {
    const annotation = markup('source-hash');
    annotation.data.nativeCopySource = { pageNumber: 1, nativeName: 'source' };
    useAnnotationStore.setState({ annotations: [annotation], selectedAnnotationIds: [annotation.id], activeAnnotationId: annotation.id });
    render(<InspectorPanel />);
    expect(screen.getByRole('button', { name: 'Rotate 90° clockwise' })).toBeDisabled();
  });
});
