import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CtxBar } from '../CtxBar';
import { useEditorStore } from '@/core/editor/store';
import { useWriterStore } from '@/core/writer/store';
import { useReviewStore } from '@/core/review/store';

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
});
