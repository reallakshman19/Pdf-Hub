import { beforeEach, describe, expect, it } from 'vitest';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';
import { WriterV2Inspector } from './WriterV2Inspector';

function tableElement(): WriterElementV2 {
  return {
    id: 'table-1',
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'tableBox',
    rect: {
      x: 10,
      y: 20,
      width: 300,
      height: 140,
    },
    plainText: 'Table 2x1',
    tableData: {
      columns: [
        {
          id: 'col-1',
          label: 'A',
          width: 150,
        },
        {
          id: 'col-2',
          label: 'B',
          width: 150,
        },
      ],
      rows: [{
        id: 'row-1',
        cells: [
          {
            id: 'cell-1',
            text: 'A1',
          },
          {
            id: 'cell-2',
            text: 'B1',
          },
        ],
      }],
    },
    style: {
      zIndex: 1,
      backgroundColor: '#ffffff',
      borderColor: '#94a3b8',
      borderWidth: 1,
      padding: 0,
      opacity: 1,
    },
    createdAt:
      '2026-01-01T00:00:00.000Z',
    updatedAt:
      '2026-01-01T00:00:00.000Z',
    locked: false,
    hidden: false,
  };
}

function element(id: string): WriterElementV2 {
  return {
    id,
    documentFingerprint: 'doc-1',
    pageIndex: 0,
    type: 'richTextBox',
    rect: {
      x: 10,
      y: 20,
      width: 140,
      height: 70,
    },
    plainText: 'Inspector test',
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
  };
}

describe('WriterV2Inspector', () => {
  beforeEach(() => {
    useWriterV2Store.getState().clearWriterV2();
  });

  it('renders nothing without selection', () => {
    const { container } = render(<WriterV2Inspector />);
    // The floating inspector returns null when there is no selection and no hidden elements
    expect(container.firstChild).toBeNull();
  });

  it('shows selected writer element metadata', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterV2Inspector />);

    expect(screen.getByLabelText(/writer v2 inspector/i)).toBeTruthy();
    expect(screen.getByText(/richTextBox/i)).toBeTruthy();
  });

  it('keeps transform edits local until blur, then commits them', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store
      .getState()
      .dispatchWriterCommand({
        type: 'SET_ACTIVE_WRITER_ELEMENT',
        id: 'writer-1',
      });

    render(<WriterV2Inspector />);

    const [xInput] =
      screen.getAllByRole('spinbutton');

    fireEvent.change(xInput, {
      target: { value: '42' },
    });

    expect(
      useWriterV2Store.getState().elements[0].rect.x,
    ).toBe(10);

    fireEvent.blur(xInput);

    await waitFor(() => {
      expect(
        useWriterV2Store
          .getState()
          .elements[0]
          .rect
          .x,
      ).toBe(42);
    });
  });

  it('serializes rapid transform commits against latest canonical Writer state', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store
      .getState()
      .dispatchWriterCommand({
        type: 'SET_ACTIVE_WRITER_ELEMENT',
        id: 'writer-1',
      });

    render(<WriterV2Inspector />);

    const [xInput, yInput] =
      screen.getAllByRole('spinbutton');

    fireEvent.change(xInput, {
      target: { value: '30' },
    });
    fireEvent.blur(xInput);

    fireEvent.change(yInput, {
      target: { value: '55' },
    });
    fireEvent.blur(yInput);

    await waitFor(() => {
      expect(
        useWriterV2Store
          .getState()
          .elements[0]
          .rect,
      ).toMatchObject({
        x: 30,
        y: 55,
        width: 140,
        height: 70,
      });
    });
  });

  it('cancels a numeric draft on Escape without mutating Writer state', () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });
    useWriterV2Store
      .getState()
      .dispatchWriterCommand({
        type: 'SET_ACTIVE_WRITER_ELEMENT',
        id: 'writer-1',
      });

    render(<WriterV2Inspector />);

    const [xInput] =
      screen.getAllByRole('spinbutton');

    fireEvent.change(xInput, {
      target: { value: '99' },
    });
    fireEvent.keyDown(xInput, {
      key: 'Escape',
    });

    expect(
      useWriterV2Store.getState().elements[0].rect.x,
    ).toBe(10);
    expect(
      (xInput as HTMLInputElement).value,
    ).toBe('10');
  });

  it('keeps helper-backed table cell text local until blur', async () => {
    useWriterV2Store
      .getState()
      .hydrateWriterSession({
        documentFingerprint: 'doc-1',
        elements: [tableElement()],
      });
    useWriterV2Store
      .getState()
      .dispatchWriterCommand({
        type: 'SET_ACTIVE_WRITER_ELEMENT',
        id: 'table-1',
      });

    render(<WriterV2Inspector />);

    const input = screen.getByLabelText(
      'Table cell 1-1',
    );

    fireEvent.change(input, {
      target: { value: 'Draft A1' },
    });

    expect(
      useWriterV2Store
        .getState()
        .elements[0]
        .tableData
        ?.rows[0]
        .cells[0]
        .text,
    ).toBe('A1');

    fireEvent.blur(input);

    await waitFor(() => {
      expect(
        useWriterV2Store
          .getState()
          .elements[0]
          .tableData
          ?.rows[0]
          .cells[0]
          .text,
      ).toBe('Draft A1');
    });
  });

  it('duplicates selected writer element', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterV2Inspector />);

    fireEvent.click(screen.getByRole('button', { name: /duplicate/i }));

    await waitFor(() => {
      expect(
        useWriterV2Store.getState().elements,
      ).toHaveLength(2);
    });
  });

  it('locks and deletes selected writer element', async () => {
    useWriterV2Store.getState().hydrateWriterSession({
      documentFingerprint: 'doc-1',
      elements: [element('writer-1')],
    });

    useWriterV2Store.getState().dispatchWriterCommand({
      type: 'SET_ACTIVE_WRITER_ELEMENT',
      id: 'writer-1',
    });

    render(<WriterV2Inspector />);

    fireEvent.click(screen.getByRole('button', { name: /^lock$/i }));

    await waitFor(() => {
      expect(
        useWriterV2Store
          .getState()
          .elements[0]
          .locked,
      ).toBe(true);
    });

    fireEvent.click(
      screen.getByRole('button', {
        name: /delete/i,
      }),
    );

    await waitFor(() => {
      expect(
        useWriterV2Store.getState().elements,
      ).toHaveLength(0);
    });
  });
});
