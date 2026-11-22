import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { PdfAnnotation } from '@/core/annotations/types';
import { useAnnotationStore } from '@/core/annotations/store';
import { useEditorStore } from '@/core/editor/store';
import { InspectorPanel } from './InspectorPanel';

const makeAnnotation = (id: string): PdfAnnotation => ({
  id,
  type: 'textbox',
  pageNumber: 1,
  rect: { x: 50, y: 50, width: 120, height: 40 },
  createdAt: 1,
  updatedAt: 1,
  data: {
    text: 'Rest 2200',
    backgroundColor: '#ffffff',
    borderColor: '#3b82f6',
    borderWidth: 1,
    opacity: 1,
  },
});

describe('InspectorPanel style controls: No background and Translucent options', () => {
  beforeEach(() => {
    useEditorStore.setState({ inspectorTab: 'style', rightPanelWidth: 18, activeMode: 'annotate' });
  });

  it('toggles "No background" to transparent and back', () => {
    const item = makeAnnotation('tb-1');
    useAnnotationStore.setState({ annotations: [item], selectedAnnotationIds: [item.id], activeAnnotationId: item.id });

    render(<InspectorPanel />);

    const noBgCheckbox = screen.getByRole('checkbox', { name: /no background/i }) as HTMLInputElement;
    expect(noBgCheckbox.checked).toBe(false);

    // Toggle No background
    fireEvent.click(noBgCheckbox);

    const updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'tb-1');
    expect(updated?.data.backgroundColor).toBe('transparent');
    expect(noBgCheckbox.checked).toBe(true);

    // Toggle back
    fireEvent.click(noBgCheckbox);
    const restored = useAnnotationStore.getState().annotations.find((a) => a.id === 'tb-1');
    expect(restored?.data.backgroundColor).toBe('#ffffff');
  });

  it('adjusts opacity via slider and quick presets (100%, 50% Translucent, 25% Light)', () => {
    const item = makeAnnotation('tb-2');
    useAnnotationStore.setState({ annotations: [item], selectedAnnotationIds: [item.id], activeAnnotationId: item.id });

    render(<InspectorPanel />);

    // Check readout
    expect(screen.getByText('100%')).toBeInTheDocument();

    // Click Translucent (50%) preset
    const translucentBtn = screen.getByRole('button', { name: /translucent \(50%\)/i });
    fireEvent.click(translucentBtn);

    let updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'tb-2');
    expect(updated?.data.opacity).toBe(0.5);
    expect(screen.getByText('50%')).toBeInTheDocument();

    // Click Light (25%) preset
    const lightBtn = screen.getByRole('button', { name: /light \(25%\)/i });
    fireEvent.click(lightBtn);

    updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'tb-2');
    expect(updated?.data.opacity).toBe(0.25);
    expect(screen.getByText('25%')).toBeInTheDocument();

    // Adjust slider directly
    const slider = screen.getByRole('slider') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '0.7' } });

    updated = useAnnotationStore.getState().annotations.find((a) => a.id === 'tb-2');
    expect(updated?.data.opacity).toBe(0.7);
    expect(screen.getByText('70%')).toBeInTheDocument();
  });
});
