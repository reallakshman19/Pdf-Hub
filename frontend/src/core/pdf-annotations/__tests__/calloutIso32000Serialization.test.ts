import { describe, it, expect } from 'vitest';
import * as pdfLib from 'pdf-lib';
import type { PdfAnnotation } from '@/core/annotations/types';
import { writeNativePdfAnnotations } from '../nativeAnnotationWriter';
import { readNativePdfAnnotations } from '../nativeAnnotationReader';
import { createExportWorkerMessageHandler } from '@/core/export/exportWorkerEntrypoint';
import { ExportWorkerClient, type ExportWorkerLike } from '@/core/export/exportWorkerClient';
import type { ExportWorkerRequest, ExportWorkerResponse } from '@/core/export/exportWorkerTypes';

class FakeExportWorker implements ExportWorkerLike {
  public messages: ExportWorkerRequest[] = [];
  private readonly listeners = new Map<string, Set<(event: MessageEvent | ErrorEvent) => void>>();

  postMessage(message: ExportWorkerRequest): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.messages = [];
  }

  addEventListener(type: 'message' | 'error', listener: (event: MessageEvent | ErrorEvent) => void): void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: 'message' | 'error', listener: (event: MessageEvent | ErrorEvent) => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(response: ExportWorkerResponse): void {
    const messageEvent = { data: response } as MessageEvent<ExportWorkerResponse>;
    this.listeners.get('message')?.forEach((l) => l(messageEvent));
  }
}

async function createBasePdfBytes(): Promise<Uint8Array> {
  const doc = await pdfLib.PDFDocument.create();
  doc.addPage([600, 400]);
  return new Uint8Array(await doc.save());
}

function createMultiLeaderCallout(id = 'callout-cad-1'): PdfAnnotation {
  return {
    id,
    type: 'callout',
    pageNumber: 1,
    rect: { x: 200, y: 150, width: 150, height: 40 },
    createdAt: 1000,
    updatedAt: 1000,
    data: {
      text: 'W12x26 BEAM',
      backgroundColor: '#ffffff',
      borderColor: '#2563eb',
      borderWidth: 1.5,
      textColor: '#0f172a',
      fontSize: 12,
      shelfStyle: 'underline',
      shelfLength: 16,
      anchor: { x: 80, y: 300 },
      knee: { x: 150, y: 220 },
      arrowHead: 'open',
      leaderStyle: 'elbow',
      leaders: [
        {
          id: 'branch-primary',
          anchor: { x: 80, y: 300 },
          knee: { x: 150, y: 220 },
          leaderStyle: 'elbow',
          arrowHead: 'open',
        },
        {
          id: 'branch-secondary',
          anchor: { x: 60, y: 100 },
          knee: { x: 140, y: 160 },
          leaderStyle: 'straight',
          arrowHead: 'filled',
        },
      ],
    },
  };
}

describe('Worker-Backed ISO 32000-1 /AP Stream PDF Serialization (Mini-Phase N.4)', () => {
  it('FALSIFY-PDF-01: Export serializes callouts with valid ISO 32000-1 /Subtype /FreeText, /IT /FreeTextCallout, /CL coordinates, and /AP (/N) stream rendering ASME landing shelf', async () => {
    const baseBytes = await createBasePdfBytes();
    const callout = createMultiLeaderCallout('callout-cad-1');

    const result = await writeNativePdfAnnotations(baseBytes, [callout]);
    expect(result.annotationCount).toBe(1);
    expect(result.bytes.byteLength).toBeGreaterThan(0);

    const savedDoc = await pdfLib.PDFDocument.load(result.bytes);
    const page = savedDoc.getPage(0);
    const annotsArray = page.node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray);
    expect(annotsArray).toBeDefined();
    expect(annotsArray?.size()).toBe(1);

    const annotDict = annotsArray?.lookup(0, pdfLib.PDFDict);
    expect(annotDict).toBeDefined();

    // Verify ISO 32000-1 standard keys
    expect(annotDict?.lookup(pdfLib.PDFName.of('Subtype'), pdfLib.PDFName).decodeText()).toBe('FreeText');
    expect(annotDict?.lookup(pdfLib.PDFName.of('IT'), pdfLib.PDFName).decodeText()).toBe('FreeTextCallout');

    // Verify /CL contains 4 or 6 numbers
    const clArray = annotDict?.lookup(pdfLib.PDFName.of('CL'), pdfLib.PDFArray);
    expect(clArray).toBeDefined();
    expect([4, 6]).toContain(clArray?.size());

    // Verify /AP contains a Form XObject (/N)
    const apDict = annotDict?.lookup(pdfLib.PDFName.of('AP'), pdfLib.PDFDict);
    expect(apDict).toBeDefined();
    const normalStream = apDict?.lookup(pdfLib.PDFName.of('N'), pdfLib.PDFStream);
    expect(normalStream).toBeDefined();

    // Decode and inspect appearance stream graphics operators
    const apContent = new TextDecoder().decode(pdfLib.decodePDFRawStream(normalStream as pdfLib.PDFRawStream).decode());

    // 1. Must contain font text operators
    expect(apContent).toContain('BT');
    expect(apContent).toContain('ET');
    expect(apContent).toContain('Tj');

    // 2. Must contain stroke operators for leader and landing shelf
    expect(apContent).toContain(' RG');
    expect(apContent).toContain(' w');
    expect(apContent).toContain(' m');
    expect(apContent).toContain(' l');
    expect(apContent).toContain('S');

    // 3. Must contain arrowhead closed polygon / filled operator ('h B' or 'S')
    expect(apContent).toContain('h B');
  });

  it('FALSIFY-PDF-02: Bounding box /Rect and /RD expand properly to enclose all leader branches and landing shelf without throwing outside-rect errors', async () => {
    const baseBytes = await createBasePdfBytes();
    const callout = createMultiLeaderCallout('callout-cad-wide');

    // Branch 1 points far down-left, Branch 2 points far up-left
    callout.data.leaders = [
      {
        id: 'branch-1',
        anchor: { x: 20, y: 350 },
        knee: { x: 120, y: 250 },
        leaderStyle: 'elbow',
        arrowHead: 'open',
      },
      {
        id: 'branch-2',
        anchor: { x: 10, y: 50 },
        knee: { x: 130, y: 120 },
        leaderStyle: 'straight',
        arrowHead: 'filled',
      },
    ];

    // Must execute cleanly without throwing 'the leader lies outside its annotation rectangle'
    const result = await writeNativePdfAnnotations(baseBytes, [callout]);
    expect(result.annotationCount).toBe(1);

    const savedDoc = await pdfLib.PDFDocument.load(result.bytes);
    const annotDict = savedDoc.getPage(0).node.lookupMaybe(pdfLib.PDFName.of('Annots'), pdfLib.PDFArray)?.lookup(0, pdfLib.PDFDict);

    const rectArray = annotDict?.lookup(pdfLib.PDFName.of('Rect'), pdfLib.PDFArray);
    const rdArray = annotDict?.lookup(pdfLib.PDFName.of('RD'), pdfLib.PDFArray);

    expect(rectArray?.size()).toBe(4);
    expect(rdArray?.size()).toBe(4);

    const rect = [
      (rectArray?.get(0) as pdfLib.PDFNumber).asNumber(),
      (rectArray?.get(1) as pdfLib.PDFNumber).asNumber(),
      (rectArray?.get(2) as pdfLib.PDFNumber).asNumber(),
      (rectArray?.get(3) as pdfLib.PDFNumber).asNumber(),
    ];

    // The bounding box rect must enclose the leftmost anchor (x: 10 or 20) with margin
    expect(rect[0]).toBeLessThanOrEqual(25);
    // And must extend to at least the right side of the text box (x: 200 + 150 = 350)
    expect(rect[2]).toBeGreaterThanOrEqual(350);
  });

  it('FALSIFY-PDF-03: Round-trip parity: PDF exported -> readNativePdfAnnotations retains all leader branches, shelf style, and text frame bounds', async () => {
    const baseBytes = await createBasePdfBytes();
    const originalCallout = createMultiLeaderCallout('callout-roundtrip');
    originalCallout.data.shelfStyle = 'underline';
    originalCallout.data.shelfLength = 20;

    // Export to PDF
    const exported = await writeNativePdfAnnotations(baseBytes, [originalCallout]);

    // Read back exported PDF
    const readResult = await readNativePdfAnnotations(exported.bytes);
    expect(readResult.annotations.length).toBe(1);

    const reimported = readResult.annotations[0];
    expect(reimported.type).toBe('callout');
    expect(reimported.data.text).toBe('W12x26 BEAM');
    expect(reimported.data.shelfStyle).toBe('underline');
    expect(reimported.data.shelfLength).toBe(20);

    // Verify all leader branches preserved
    expect(reimported.data.leaders).toBeDefined();
    expect(reimported.data.leaders?.length).toBe(2);

    const [b1, b2] = reimported.data.leaders!;
    expect(b1.id).toBe('branch-primary');
    expect(b1.anchor).toEqual({ x: 80, y: 300 });
    expect(b1.arrowHead).toBe('open');

    expect(b2.id).toBe('branch-secondary');
    expect(b2.anchor).toEqual({ x: 60, y: 100 });
    expect(b2.arrowHead).toBe('filled');
  });

  it('FALSIFY-PDF-04: Web Worker off-main-thread execution: exportWorkerClient.serializeAnnotations serializes annotations without blocking UI', async () => {
    const baseBytes = await createBasePdfBytes();
    const callout = createMultiLeaderCallout('callout-worker-1');

    const fakeWorker = new FakeExportWorker();
    const workerClient = new ExportWorkerClient({
      workerFactory: () => fakeWorker,
      requestIdFactory: () => 'test-req-worker-serialize',
    });

    // Wire up entrypoint message handler to simulate worker loop
    const workerHandler = createExportWorkerMessageHandler({
      postMessage: (response) => {
        fakeWorker.emit(response);
      },
    });

    // Intercept posted messages and route to worker handler asynchronously
    fakeWorker.postMessage = (message) => {
      fakeWorker.messages.push(message);
      setTimeout(() => {
        void workerHandler(message);
      }, 5);
    };

    const serializePromise = workerClient.serializeAnnotations({
      pdfBytes: baseBytes,
      annotations: [callout],
    });

    const result = await serializePromise;
    expect(result).toBeDefined();
    expect(result.annotationCount).toBe(1);
    expect(result.bytes.byteLength).toBeGreaterThan(0);

    // Verify the serialized PDF bytes produced by the worker are valid and readable
    const reread = await readNativePdfAnnotations(result.bytes);
    expect(reread.annotations.length).toBe(1);
    expect(reread.annotations[0].data.text).toBe('W12x26 BEAM');
    expect(reread.annotations[0].data.leaders?.length).toBe(2);

    workerClient.dispose();
  });
});
