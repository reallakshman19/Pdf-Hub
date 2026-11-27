import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const mocks = vi.hoisted(() => ({
  execute: vi.fn(),
}));

vi.mock('@/core/commands/bus', () => ({
  commandBus: {
    execute: mocks.execute,
  },
}));

import {
  executeBatesNumbering,
  executeCropPdfMargins,
  executeNormalizePageDimensions,
} from './organizeWorkflowActions';

async function makePdfBytes(pages = 2): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) {
    doc.addPage([400, 600]).drawText(`Page ${i + 1}`, { x: 40, y: 500, size: 14 });
  }
  return doc.save();
}

describe('organizeWorkflowActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.execute.mockResolvedValue({ success: true, mutated: true, message: 'ok' });
  });

  it('commits Bates numbering via APPLY_WORKING_COPY and shows success toast', async () => {
    const bytes = await makePdfBytes(2);
    const addToast = vi.fn();

    const ok = await executeBatesNumbering({
      workingBytes: bytes,
      documentKey: 'sha256:doc',
      pageCount: 2,
      options: { prefix: 'DOC-', startNumber: 1, digits: 3 },
      addToast,
    });

    expect(ok).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    const arg = mocks.execute.mock.calls[0]![0];
    expect(arg.command.type).toBe('APPLY_WORKING_COPY');
    expect(arg.resources.binaries['binary:bates']).toBeInstanceOf(Uint8Array);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: 'Bates Numbering Complete',
    }));
  });

  it('commits margin cropping (uniform) via APPLY_WORKING_COPY', async () => {
    const bytes = await makePdfBytes(1);
    const addToast = vi.fn();

    const ok = await executeCropPdfMargins({
      workingBytes: bytes,
      documentKey: 'sha256:doc',
      pageCount: 1,
      options: {
        mode: 'uniform',
        uniformMargins: { topPt: 10, bottomPt: 10, leftPt: 10, rightPt: 10 },
      },
      addToast,
    });

    expect(ok).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: 'Crop Margins Complete',
    }));
  });

  it('commits page dimension normalization via APPLY_WORKING_COPY', async () => {
    const bytes = await makePdfBytes(2);
    const addToast = vi.fn();

    const ok = await executeNormalizePageDimensions({
      workingBytes: bytes,
      documentKey: 'sha256:doc',
      pageCount: 2,
      options: { preset: 'A4', strategy: 'fit', orientation: 'preserve' },
      addToast,
    });

    expect(ok).toBe(true);
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({
      type: 'success',
      title: 'Normalization Complete',
    }));
  });
});
