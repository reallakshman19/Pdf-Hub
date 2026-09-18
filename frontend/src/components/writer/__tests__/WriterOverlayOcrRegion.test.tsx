import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { WriterOverlay } from '../WriterOverlay';
import { useEditorStore } from '@/core/editor/store';
import { useOcrStore } from '@/core/ocr/ocrStore';
import { useSessionStore } from '@/core/session/store';
import { useWriterStore } from '@/core/writer/store';

describe('WriterOverlay OCR area selection', () => {
  beforeEach(() => {
    useOcrStore.getState().clearOcr();
    useWriterStore.setState({
      elements: [],
      activeTool: 'ocr-region',
      selectedIds: [],
      activeId: null,
      undoStack: [],
      redoStack: [],
    });
    useEditorStore.setState({
      sidebarTab: 'thumbnails',
    });
    useSessionStore.setState({
      documentKey: 'doc-region',
    });
  });

  it('creates an OCR review region from a drag on the real page after mode choice', () => {
    render(
      <WriterOverlay
        pageNumber={1}
        scale={1}
        pageDimensions={{ width: 300, height: 400 }}
      />,
    );

    const capture = screen.getByTestId('writer-overlay-capture');

    fireEvent.pointerDown(capture, {
      pointerId: 1,
      clientX: 20,
      clientY: 30,
    });
    fireEvent.pointerMove(capture, {
      pointerId: 1,
      clientX: 140,
      clientY: 90,
    });
    fireEvent.pointerUp(capture, {
      pointerId: 1,
      clientX: 140,
      clientY: 90,
    });

    expect(screen.getByTestId('ocr-document-region-pending')).toBeTruthy();
    expect(screen.getByTestId('ocr-document-region-mode-picker')).toBeTruthy();
    expect(useOcrStore.getState().regions).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Text' }));

    const [region] = useOcrStore.getState().regions;

    expect(region).toMatchObject({
      documentFingerprint: 'doc-region',
      pageIndex: 0,
      mode: 'text',
      bbox: {
        x: 20,
        y: 30,
        width: 120,
        height: 60,
      },
    });
    expect(useOcrStore.getState().reviewFocus).toMatchObject({
      documentFingerprint: 'doc-region',
      pageIndex: 0,
      targetId: region.id,
      source: 'region',
    });
    expect(useEditorStore.getState().sidebarTab).toBe('ocr');
    expect(screen.queryByTestId('ocr-document-region-mode-picker')).toBeNull();
  });

  it('does not create a region when the mode picker is cancelled', () => {
    render(
      <WriterOverlay
        pageNumber={2}
        scale={1}
        pageDimensions={{ width: 300, height: 400 }}
      />,
    );

    const capture = screen.getByTestId('writer-overlay-capture');

    fireEvent.pointerDown(capture, {
      pointerId: 2,
      clientX: 10,
      clientY: 10,
    });
    fireEvent.pointerMove(capture, {
      pointerId: 2,
      clientX: 80,
      clientY: 60,
    });
    fireEvent.pointerUp(capture, {
      pointerId: 2,
      clientX: 80,
      clientY: 60,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useOcrStore.getState().regions).toHaveLength(0);
    expect(screen.queryByTestId('ocr-document-region-pending')).toBeNull();
  });
});
