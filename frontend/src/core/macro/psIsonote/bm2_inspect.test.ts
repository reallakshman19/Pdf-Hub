// PDF content inspection test - checks the benchmark output for actual callout content
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';

interface StreamLike {
  getContents(): Uint8Array;
}

interface ArrayLikeStreamRefs {
  size?: () => number;
  get: (index: number) => unknown;
}

describe('BM2 Output Inspection', () => {
  it('inspects the benchmark PDF output to diagnose blank page', async () => {
    const outputPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001_BENCHMARKED.pdf';

    if (!fs.existsSync(outputPath)) {
      return;
    }

    const outputBytes = new Uint8Array(fs.readFileSync(outputPath));
    const pdfDoc = await PDFDocument.load(outputBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    expect(pages.length).toBeGreaterThan(0);

    for (const page of pages) {
      const context = pdfDoc.context;
      const pageNode = page.node;
      let allContent = '';

      const contentsRef = pageNode.Contents();
      if (!contentsRef) continue;

      const resolved = context.lookup(contentsRef);
      if (resolved && 'getContents' in resolved && typeof (resolved as StreamLike).getContents === 'function') {
        allContent = new TextDecoder('latin1').decode((resolved as StreamLike).getContents());
      } else if (resolved && 'get' in resolved) {
        const arr = resolved as ArrayLikeStreamRefs;
        const size = arr.size?.() ?? 0;
        for (let j = 0; j < size; j++) {
          const streamRef = arr.get(j) as Parameters<typeof context.lookup>[0];
          const stream = context.lookup(streamRef);
          if (stream && 'getContents' in stream && typeof (stream as StreamLike).getContents === 'function') {
            allContent += new TextDecoder('latin1').decode((stream as StreamLike).getContents());
          }
        }
      }

      expect(allContent.length).toBeGreaterThan(0);
    }
  }, 30000);
});
