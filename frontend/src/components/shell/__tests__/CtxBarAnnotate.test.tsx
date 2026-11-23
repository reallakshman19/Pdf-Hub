import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CtxBar } from '../CtxBar';
import { useEditorStore } from '@/core/editor/store';
import { useWriterStore } from '@/core/writer/store';
import { useReviewStore } from '@/core/review/store';
import { useAnnotationStore } from '@/core/annotations/store';

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

describe('CtxBar annotate mode', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeMode: 'annotate',
      activeTool: 'select',
    });
    useWriterStore.setState({
      activeTool: 'select',
    });
    useReviewStore.setState({
      hideResolved: false,
      filterStatus: 'all',
    });
  });

  it('keeps the primary annotate surface compact and moves secondary tools under More', () => {
    render(<CtxBar />);

    expect(screen.getByRole('button', { name: 'Highlight' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Comment' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'More' })).toBeTruthy();

    expect(screen.queryByRole('button', { name: 'Underline' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sticky Note' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));

    expect(screen.getByRole('menu', { name: 'More annotation tools' })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Underline/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Sticky Note/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Visual Mask/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /OCR Area/ })).toBeTruthy();
    expect(screen.queryByText(/^Redact$/)).toBeNull();
  });

  it('activates a secondary annotation tool from More', () => {
    render(<CtxBar />);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Sticky Note/ }));

    expect(useEditorStore.getState().activeTool).toBe('sticky-note');
    expect(screen.queryByRole('menu', { name: 'More annotation tools' })).toBeNull();
  });

  it('routes OCR Area to the writer OCR-region tool', () => {
    render(<CtxBar />);

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /OCR Area/ }));

    expect(useEditorStore.getState().activeTool).toBe('select');
    expect(useWriterStore.getState().activeTool).toBe('ocr-region');
  });

  it('renders quick fill buttons (Solid, Translucent, No BG) when an annotation is selected', () => {
    useAnnotationStore.setState({
      selectedAnnotationIds: ['annot-1'],
      annotations: [{
        id: 'annot-1',
        type: 'callout',
        pageNumber: 1,
        rect: { x: 10, y: 10, width: 100, height: 40 },
        createdAt: 1,
        updatedAt: 1,
        data: { text: 'Rest', backgroundColor: '#ffffff', opacity: 1 },
      }],
    });

    render(<CtxBar />);

    expect(screen.getByRole('button', { name: 'Solid' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Translucent' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'No BG' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Translucent' }));
    let annot = useAnnotationStore.getState().annotations.find((a) => a.id === 'annot-1');
    expect(annot?.data.opacity).toBe(0.5);

    fireEvent.click(screen.getByRole('button', { name: 'No BG' }));
    annot = useAnnotationStore.getState().annotations.find((a) => a.id === 'annot-1');
    expect(annot?.data.backgroundColor).toBe('transparent');
  });

  it('opens ScaleCalibrationDialog when Scale button is clicked', () => {
    render(<CtxBar />);
    const scaleBtn = screen.getByRole('button', { name: 'Scale' });
    expect(scaleBtn).toBeTruthy();
    fireEvent.click(scaleBtn);
    expect(screen.getByText('Drawing Scale Calibration')).toBeTruthy();
  });
});
