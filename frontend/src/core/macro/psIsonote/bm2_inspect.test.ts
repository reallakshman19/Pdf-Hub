// PDF content inspection test - checks the benchmark output for actual callout content
import { describe, it } from 'vitest';
import fs from 'node:fs';
import { PDFDocument } from 'pdf-lib';

describe('BM2 Output Inspection', () => {
  it('inspects the benchmark PDF output to diagnose blank page', async () => {
    const outputPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001_BENCHMARKED.pdf';
    const inputPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001 - Copy.pdf';

    if (!fs.existsSync(outputPath)) {
      console.warn('Run bm2_benchmark.test.ts first to generate the output PDF');
      return;
    }

    const outputBytes = new Uint8Array(fs.readFileSync(outputPath));
    const inputBytes = new Uint8Array(fs.readFileSync(inputPath));

    console.log(`\nInput size:  ${inputBytes.length} bytes`);
    console.log(`Output size: ${outputBytes.length} bytes (delta: +${outputBytes.length - inputBytes.length})`);

    // Load with pdf-lib (auto-decompresses FlateDecode)
    const pdfDoc = await PDFDocument.load(outputBytes, { ignoreEncryption: true });
    const pages = pdfDoc.getPages();
    console.log(`Page count: ${pages.length}`);

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const { width, height } = page.getSize();
      console.log(`\nPage ${i + 1}: ${width.toFixed(1)} x ${height.toFixed(1)} pts`);

      // Access the raw content stream bytes
      const context = pdfDoc.context;
      const pageNode = page.node;

      let allContent = '';

      // Get the Contents ref/array from the page dict
      const contentsRef = pageNode.Contents();
      if (!contentsRef) {
        console.log('  ❌ No Contents entry on page!');
        continue;
      }

      console.log(`  Contents type: ${contentsRef.constructor?.name ?? typeof contentsRef}`);

      // Try resolving via context
      try {
        const resolved = context.lookup(contentsRef);
        console.log(`  Resolved type: ${resolved?.constructor?.name ?? typeof resolved}`);

        if (resolved && 'getContents' in resolved) {
          const bytes = (resolved as any).getContents();
          allContent = new TextDecoder('latin1').decode(bytes);
          console.log(`  Content stream: ${allContent.length} chars (decompressed)`);
        } else if (resolved && 'get' in resolved) {
          // It's a PDFArray of stream refs
          const arr = resolved as any;
          const size = arr.size?.() ?? 0;
          console.log(`  Content is array of ${size} streams`);
          for (let j = 0; j < size; j++) {
            const streamRef = arr.get(j);
            const stream = context.lookup(streamRef);
            if (stream && 'getContents' in stream) {
              const bytes = (stream as any).getContents();
              allContent += new TextDecoder('latin1').decode(bytes);
            }
          }
          console.log(`  Total content after joining ${size} streams: ${allContent.length} chars`);
        }
      } catch (e) {
        console.error(`  Error resolving contents:`, e);
      }

      if (allContent.length > 0) {
        const btCount = (allContent.match(/\bBT\b/g) || []).length;
        const reCount = (allContent.match(/\bre\b/g) || []).length;
        const qCount = (allContent.match(/\bq\b/g) || []).length;
        const pdfhub = (allContent.match(/PDFHUB/g) || []).length;
        const lines = allContent.split('\n').length;

        console.log(`  Lines: ${lines}`);
        console.log(`  BT (text blocks): ${btCount}`);
        console.log(`  re (rectangles): ${reCount}`);
        console.log(`  q (save state): ${qCount}`);
        console.log(`  PDFHUB markers: ${pdfhub}`);

        // Print first 600 chars
        console.log('\n  --- First 600 chars of content stream ---');
        console.log(allContent.slice(0, 600));
        console.log('  --- Last 300 chars ---');
        console.log(allContent.slice(-300));
      } else {
        console.log('  ❌ Empty content — page will appear blank!');
      }
    }
  }, 30000);
});
