import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

describe('imported stamp controls', () => {
  beforeEach(() => {
    useEditorStore.setState({ inspectorTab: 'properties', rightPanelWidth: 18, activeMode: 'annotate' });
  });
  it.each([false, true])('only enables rotation for an imported stamp with an AP (AP=%s)', (hasAppearance) => {
    const stamp: PdfAnnotation = { id: 'legacy-stamp', type: 'stamp', pageNumber: 1,
      rect: { x: 10, y: 10, width: 80, height: 30 }, createdAt: 1, updatedAt: 1,
      data: { nativeStampAppearanceKind: 'imported', hasCustomAppearance: hasAppearance } };
    useAnnotationStore.setState({ annotations: [stamp], selectedAnnotationIds: [stamp.id], activeAnnotationId: stamp.id });
    render(<InspectorPanel />);
    const rotation = screen.getByRole('spinbutton', { name: 'Rotation' });
    expect(rotation).toHaveProperty('disabled', !hasAppearance);
    fireEvent.click(screen.getByTitle('Style'));
    expect(screen.getByText(hasAppearance ? /colors and wording cannot yet be edited/i : /viewer-provided appearance/i)).toBeInTheDocument();
  });
  it('explains why an unverified rotated base cannot be copied or rotated further', () => {
    const stamp: PdfAnnotation = { id: 'rotated-stamp', type: 'stamp', pageNumber: 1,
      rect: { x: 10, y: 10, width: 80, height: 30 }, createdAt: 1, updatedAt: 1,
      data: { nativeStampAppearanceKind: 'imported', hasCustomAppearance: true, nativeStampRotationReadOnly: true, rotation: 90 } };
    useAnnotationStore.setState({ annotations: [stamp], selectedAnnotationIds: [stamp.id], activeAnnotationId: stamp.id });
    render(<InspectorPanel />);
    expect(screen.getByRole('spinbutton', { name: 'Rotation' })).toBeDisabled();
    fireEvent.click(screen.getByTitle('Style'));
    expect(screen.getByText(/further rotation and copy are unavailable/i)).toBeInTheDocument();
  });
});
