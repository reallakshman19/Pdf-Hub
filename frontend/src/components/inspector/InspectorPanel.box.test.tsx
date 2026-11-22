import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

const shape = (id: string, generated: boolean): PdfAnnotation => ({ id, type: 'shape-rect', pageNumber: 1,
  rect: { x: 10, y: 10, width: 80, height: 30 }, createdAt: 1, updatedAt: 1,
  data: { nativeBoxShapeImported: true, nativeBoxShapeHasAppearance: true, nativeBoxShapeGenerated: generated,
    borderColor: '#123456', borderWidth: 2, nativeBoxShapeSourceHash: 'source-hash' } });

describe('imported rectangle appearance controls', () => {
  beforeEach(() => { useEditorStore.setState({ inspectorTab: 'properties', rightPanelWidth: 18, activeMode: 'annotate' }); });
  it('explains and disables unverified source artwork styles', () => {
    const item = shape('unverified', false);
    useAnnotationStore.setState({ annotations: [item], selectedAnnotationIds: [item.id], activeAnnotationId: item.id });
    render(<InspectorPanel />); fireEvent.click(screen.getByTitle('Style'));
    expect(screen.getByText(/shape's original artwork is preserved/i)).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Border Width' })).toBeDisabled();
  });
  it('retains style editing for verified generated shapes and protects unverified shapes in mixed selection', () => {
    const generated = shape('generated', true); const imported = shape('imported', false);
    useAnnotationStore.setState({ annotations: [generated, imported], selectedAnnotationIds: [generated.id, imported.id], activeAnnotationId: generated.id });
    useAnnotationStore.getState().updateStyleForSelection({ borderColor: '#ff0000' });
    const items = useAnnotationStore.getState().annotations;
    expect(items.find((item) => item.id === generated.id)?.data.borderColor).toBe('#ff0000');
    expect(items.find((item) => item.id === imported.id)?.data.borderColor).toBe('#123456');
  });
});
