import { describe, expect, it, vi } from 'vitest';
import { getDocument } from 'pdfjs-dist';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFNumber,
  degrees,
} from 'pdf-lib';

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

  it('reuses one input parse across structural page mutations', async () => {
    const source = await PDFDocument.create();
    for (const [width, height] of [
      [100, 200],
      [110, 210],
      [120, 220],
      [130, 230],
    ]) {
      source.addPage([width, height]);
    }
    const bytes = new Uint8Array(await source.save());
    const loadSpy = vi.spyOn(PDFDocument, 'load');

    const engine = new PdfLibMutationEngine();
    const session = await engine.open({ bytes });

    await session.reorderPages([3, 1, 0, 2]);
    await session.duplicatePages([1]);
    await session.removePages([3]);
    session.insertBlankPage(2, {
      width: 300,
      height: 400,
    });

    expect(session.pageCount).toBe(5);
    expect(session.getPageMetrics(0)).toMatchObject({
      width: 130,
      height: 230,
    });
    expect(session.getPageMetrics(1)).toMatchObject({
      width: 110,
      height: 210,
    });
    expect(session.getPageMetrics(2)).toMatchObject({
      width: 300,
      height: 400,
    });
    expect(session.getPageMetrics(3)).toMatchObject({
      width: 110,
      height: 210,
    });
    expect(session.getPageMetrics(4)).toMatchObject({
      width: 120,
      height: 220,
    });

    const committed = await session.commit();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(committed.pageCount).toBe(5);

    loadSpy.mockRestore();
    session.dispose();
  });

  it('validates structural mutations before committing', async () => {
    const engine = new PdfLibMutationEngine();
    const session = await engine.open({
      bytes: await createPdf(),
    });

    await expect(
      session.reorderPages([0, 0, 2]),
    ).rejects.toThrow(/valid page permutation/i);

    await expect(
      session.removePages([0, 1, 2]),
    ).rejects.toThrow(/cannot remove all pages/i);

    session.dispose();
  });


  it('reuses the active parse while donor PDFs are parsed only when consumed', async () => {
    const active = await PDFDocument.create();
    active.addPage([100, 200]);
    active.addPage([110, 210]);
    const activeBytes = new Uint8Array(await active.save());

    const insertDonor = await PDFDocument.create();
    insertDonor.addPage([200, 300]);
    insertDonor.addPage([210, 310]);
    const insertBytes = new Uint8Array(
      await insertDonor.save(),
    );

    const mergeDonor = await PDFDocument.create();
    mergeDonor.addPage([300, 400]);
    const mergeBytes = new Uint8Array(
      await mergeDonor.save(),
    );

    const replaceDonor = await PDFDocument.create();
    replaceDonor.addPage([400, 500]);
    const replaceBytes = new Uint8Array(
      await replaceDonor.save(),
    );

    const loadSpy = vi.spyOn(PDFDocument, 'load');

    const engine = new PdfLibMutationEngine();
    const session = await engine.open({
      bytes: activeBytes,
    });

    await session.insertPdf(1, insertBytes);
    await session.appendPdfs([mergeBytes]);
    await session.replacePage(
      0,
      replaceBytes,
      0,
    );

    expect(session.pageCount).toBe(5);
    expect(session.getPageMetrics(0)).toMatchObject({
      width: 400,
      height: 500,
    });
    expect(session.getPageMetrics(1)).toMatchObject({
      width: 200,
      height: 300,
    });
    expect(session.getPageMetrics(2)).toMatchObject({
      width: 210,
      height: 310,
    });
    expect(session.getPageMetrics(3)).toMatchObject({
      width: 110,
      height: 210,
    });
    expect(session.getPageMetrics(4)).toMatchObject({
      width: 300,
      height: 400,
    });

    const committed = await session.commit();

    expect(committed.pageCount).toBe(5);
    expect(loadSpy).toHaveBeenCalledTimes(4);

    loadSpy.mockRestore();
    session.dispose();
  });

  it('validates donor replacement page indices inside the session', async () => {
    const donor = await PDFDocument.create();
    donor.addPage([200, 300]);

    const engine = new PdfLibMutationEngine();
    const session = await engine.open({
      bytes: await createPdf(),
    });

    await expect(
      session.replacePage(
        0,
        new Uint8Array(await donor.save()),
        9,
      ),
    ).rejects.toThrow(/

  it('writes PageLabels inside the active session before its single commit', async () => {
    const bytes = await createPdf();
    const loadSpy = vi.spyOn(PDFDocument, 'load');

    const engine = new PdfLibMutationEngine();
    const session = await engine.open({ bytes });

    session.setPageLabels([
      {
        startPageIndex: 0,
        prefix: 'Cover',
      },
      {
        startPageIndex: 1,
        style: 'roman-lower',
      },
    ]);

    const committed = await session.commit();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    loadSpy.mockRestore();

    const reopened = await PDFDocument.load(
      committed.bytes,
    );
    const labels = reopened.catalog.lookupMaybe(
      PDFName.of('PageLabels'),
      PDFDict,
    );
    const nums = labels?.lookupMaybe(
      PDFName.of('Nums'),
      PDFArray,
    );

    expect(nums?.size()).toBe(4);
    expect(
      nums?.lookupMaybe(0, PDFNumber)?.asNumber(),
    ).toBe(0);
    expect(
      nums?.lookupMaybe(2, PDFNumber)?.asNumber(),
    ).toBe(1);

    session.dispose();
  });
Donor page index 9/);

    session.dispose();
  });


  it('draws text and visual masks without reparsing the active revision', async () => {
    const bytes = await createPdf();
    const loadSpy = vi.spyOn(PDFDocument, 'load');

    const engine = new PdfLibMutationEngine();
    const session = await engine.open({ bytes });

    await session.drawText([
      {
        pageIndex: 0,
        text: 'SESSION TEXT',
        xPt: 40,
        yPt: 100,
        fontSizePt: 12,
        color: '#112233',
        opacity: 0.9,
        align: 'left',
      },
      {
        pageIndex: 1,
        text: 'CENTERED',
        xPt: 20,
        yPt: 80,
        fontSizePt: 10,
        color: '#000000',
        opacity: 1,
        align: 'center',
        rotationDegrees: 90,
      },
    ]);
    session.drawVisualMasks([
      {
        pageIndex: 0,
        xPt: 30,
        yFromTopPt: 40,
        widthPt: 90,
        heightPt: 20,
        fillColor: '#ffffff',
      },
    ]);

    const committed = await session.commit();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(committed.pageCount).toBe(3);
    loadSpy.mockRestore();
    session.dispose();

    const pdf = await getDocument({
      data: committed.bytes.slice(),
    }).promise;
    try {
      const first = await pdf.getPage(1);
      const firstText = await first.getTextContent();
      expect(
        firstText.items
          .flatMap((item) =>
            'str' in item && typeof item.str === 'string'
              ? [item.str]
              : [],
          )
          .join(' '),
      ).toContain('SESSION TEXT');

      const second = await pdf.getPage(2);
      const secondText = await second.getTextContent();
      expect(
        secondText.items
          .flatMap((item) =>
            'str' in item && typeof item.str === 'string'
              ? [item.str]
              : [],
          )
          .join(' '),
      ).toContain('CENTERED');

      first.cleanup();
      second.cleanup();
    } finally {
      await pdf.destroy();
    }
  });

});
