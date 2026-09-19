import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { SelectBoxCopyLayer } from './SelectBoxCopyLayer';
import {
  acquireActivePdfDocumentLease,
} from '@/adapters/pdf-renderer/activePdfDocumentLease';
import {
  OperationCancelledError,
} from '@/core/cancellation/operationCancellation';
import { useSessionStore } from '@/core/session/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

vi.mock(
  '@/adapters/pdf-renderer/activePdfDocumentLease',
  () => ({
    acquireActivePdfDocumentLease: vi.fn(),
  }),
);

const viewport = {
  pdfWidth: 200,
  pdfHeight: 300,
  scale: 1,
  rotation: 0 as const,
};

function beginPendingSelection(): {
  signal: () => AbortSignal | null;
  rerender: (nextViewport: typeof viewport) => void;
} {
  let observedSignal: AbortSignal | null = null;

  vi.mocked(
    acquireActivePdfDocumentLease,
  ).mockImplementation((_session, signal) => {
    observedSignal = signal ?? null;

    return new Promise((_resolve, reject) => {
      signal?.addEventListener(
        'abort',
        () => reject(
          new OperationCancelledError(
            'test Select Box renderer acquisition',
            signal.reason,
          ),
        ),
        { once: true },
      );
    });
  });

  const rendered = render(
    <SelectBoxCopyLayer
      pageNumber={1}
      viewport={viewport}
    />,
  );

  const layer = screen.getByLabelText(
    'Select Box Copy layer page 1',
  );

  fireEvent.pointerDown(layer, {
    pointerId: 1,
    clientX: 10,
    clientY: 10,
  });
  fireEvent.pointerMove(layer, {
    pointerId: 1,
    clientX: 40,
    clientY: 40,
  });
  fireEvent.pointerUp(layer, {
    pointerId: 1,
    clientX: 40,
    clientY: 40,
  });

  return {
    signal: () => observedSignal,
    rerender: (nextViewport) => {
      rendered.rerender(
        <SelectBoxCopyLayer
          pageNumber={1}
          viewport={nextViewport}
        />,
      );
    },
  };
}

describe('SelectBoxCopyLayer renderer lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useWriterV2Store.getState().clearWriterV2();
    useWriterV2Store.setState({
      activeWriterTool: 'selectBoxCopy',
    });
    useSessionStore.setState({
      documentKey: 'sha256:A',
      revisionStoreId: 'store-1',
      originalRevisionId: 'sha256:original',
      activeRevisionId: 'sha256:A',
      workingBytes: Uint8Array.from([1, 2, 3]),
      pageCount: 1,
    });
  });

  it('aborts in-flight Select Box renderer work when the active revision changes', async () => {
    const pending = beginPendingSelection();

    await waitFor(() => {
      expect(
        acquireActivePdfDocumentLease,
      ).toHaveBeenCalledTimes(1);
    });
    expect(pending.signal()?.aborted).toBe(false);

    useSessionStore.setState({
      documentKey: 'sha256:B',
      activeRevisionId: 'sha256:B',
      workingBytes: Uint8Array.from([4, 5, 6]),
    });

    await waitFor(() => {
      expect(pending.signal()?.aborted).toBe(true);
    });
  });

  it('aborts in-flight Select Box renderer work when the tool is deactivated', async () => {
    const pending = beginPendingSelection();

    await waitFor(() => {
      expect(
        acquireActivePdfDocumentLease,
      ).toHaveBeenCalledTimes(1);
    });
    expect(pending.signal()?.aborted).toBe(false);

    useWriterV2Store.setState({
      activeWriterTool: 'select',
    });

    await waitFor(() => {
      expect(pending.signal()?.aborted).toBe(true);
    });
  });

  it('aborts in-flight Select Box renderer work when viewport geometry changes', async () => {
    const pending = beginPendingSelection();

    await waitFor(() => {
      expect(
        acquireActivePdfDocumentLease,
      ).toHaveBeenCalledTimes(1);
    });
    expect(pending.signal()?.aborted).toBe(false);

    pending.rerender({
      ...viewport,
      scale: 2,
    });

    await waitFor(() => {
      expect(pending.signal()?.aborted).toBe(true);
    });
  });
});
