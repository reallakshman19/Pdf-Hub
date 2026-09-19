import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, degrees } from 'pdf-lib';

import { PdfLibMutationEngine } from './PdfLibMutationEngine';

async function createPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  const second = doc.addPage([612, 792]);
  second.setRotation(degrees(90));
  doc.addPage([300, 500]);
  return new Uint8Array(await doc.save());
}

describe('PdfLibMutationEngine', () => {
  it('loads once and reuses the parsed document for metrics, rotation and commit', async () => {
    const bytes = await createPdf();
    const loadSpy = vi.spyOn(PDFDocument, 'load');

    const engine = new PdfLibMutationEngine();
    const session = await engine.open({ bytes });

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(session.pageCount).toBe(3);
    expect(session.getPageMetrics(0)).toEqual({
      width: 595,
      height: 842,
      rotation: 0,
    });
    expect(session.getPageMetrics(1)).toEqual({
      width: 612,
      height: 792,
      rotation: 90,
    });

    session.rotatePages([0, 1, 2], 90);
    session.rotatePages([0, 2], 180);

    const committed = await session.commit();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(committed.pageCount).toBe(3);

    loadSpy.mockRestore();

    const reopened = await PDFDocument.load(committed.bytes);
    expect(
      reopened.getPages().map((page) => page.getRotation().angle),
    ).toEqual([270, 180, 270]);

    session.dispose();
  });

  it('fails closed after commit', async () => {
    const engine = new PdfLibMutationEngine();
    const session = await engine.open({
      bytes: await createPdf(),
    });

    await session.commit();

    expect(() => session.getPageMetrics(0)).toThrow(
      /session is committed/i,
    );
    expect(() => session.rotatePages([0], 90)).toThrow(
      /session is committed/i,
    );
    await expect(session.commit()).rejects.toThrow(
      /session is committed/i,
    );

    session.dispose();
    session.dispose();
  });

  it('rejects invalid page indices before mutation', async () => {
    const engine = new PdfLibMutationEngine();
    const session = await engine.open({
      bytes: await createPdf(),
    });

    expect(() => session.getPageMetrics(9)).toThrow(
      /outside 0\.\.2/,
    );
    expect(() => session.rotatePages([-1], 90)).toThrow(
      /outside 0\.\.2/,
    );

    session.dispose();
  });

  it('honors cancellation before session open', async () => {
    const controller = new AbortController();
    controller.abort('test');

    const engine = new PdfLibMutationEngine();

    await expect(
      engine.open({
        bytes: await createPdf(),
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      code: 'OPERATION_CANCELLED',
    });
  });
});
