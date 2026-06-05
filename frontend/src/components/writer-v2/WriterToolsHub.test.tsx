import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterToolsHub } from './WriterToolsHub';

function element(
  id: string,
  patch: Partial<WriterElementV2> = {},
): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: { x: 10, y: 20, width: 100, height: 40 },
    plainText: 'Writer object',
    editorStateJson: '{"root":{"children":[]}}',
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#111827',
      borderWidth: 1,
      padding: 8,
      opacity: 1,
    },
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
    ...patch,
  };
}

describe('WriterToolsHub', () => {
  beforeEach(() => {
    localStorage.clear();
    useWriterV2Store.getState().clearWriterV2();
    useSessionStore.getState().openDocument({
      documentKey: 'doc-1',
      fileName: 'sample.pdf',
      bytes: new Uint8Array([37, 80, 68, 70]),
      pageCount: 1,
    });
  });

  it('renders one consolidated Writer tools hub', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    render(<WriterToolsHub />);

    expect(screen.getByLabelText('Writer tools')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Objects' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Templates' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Convert page objects to Rich Box' })).toBeTruthy();
  });

  it('switches tabs', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    render(<WriterToolsHub />);

    fireEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(screen.getByLabelText('Writer V2 quick templates')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(screen.getByLabelText('Writer V2 object search')).toBeTruthy();
  });

  it('collapses and expands', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    render(<WriterToolsHub />);

    fireEvent.click(screen.getByLabelText('Collapse Writer tools'));
    expect(screen.getByLabelText('Expand Writer tools')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Expand Writer tools'));
    expect(screen.getByLabelText('Writer tools')).toBeTruthy();
  });
});
