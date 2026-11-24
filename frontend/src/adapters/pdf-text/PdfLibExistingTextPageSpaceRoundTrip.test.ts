import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDocument } from 'pdfjs-dist';
import { describe, expect, it } from 'vitest';
import {
  buildExistingTextSpan,
  createExistingTextEditIntent,
} from '@/core/existing-text/model';
import { matchExistingTextSpanToContentStream } from '@/core/existing-text/provenanceMatcher';
import type { ExistingTextTransform } from '@/core/existing-text/types';
import { readExistingTextPageContentStreams } from './PdfLibExistingTextContentStreams';
import { replaceSimpleExistingTextTj } from './PdfLibExistingTextReplacement';

async function pageItems(bytes: Uint8Array) {
  const pdf = await getDocument({ data: bytes.slice() }).promise;
  try {
    const page = await pdf.getPage(1);
    const text = await page.getTextContent();
    page.cleanup();
    return text.items.flatMap((item) => ('str' in item && item.str.trim() ? [item] : []));
  } finally {
    await pdf.destroy();
  }
}

describe('existing-text page-space provenance on a real fixture', () => {
  it('matches a span the exact subset rejects and replaces it natively', async () => {
    const bytes = new Uint8Array(
      readFileSync(resolve(process.cwd(), 'e2e/fixtures/F01-text-mixed-3p.pdf')),
    );
    const items = await pageItems(bytes);
    const content = await readExistingTextPageContentStreams(bytes, 0);

    let replaced = false;
    for (const [sourceIndex, item] of items.entries()) {
      const span = buildExistingTextSpan(
        { revisionId: 'sha256:f01', pageId: 'p1', pageIndex: 0 },
        {
          sourceIndex,
          text: item.str,
          transform: item.transform as ExistingTextTransform,
          width: item.width,
          height: item.height,
          fontName: item.fontName,
          direction: item.dir,
          hasEol: item.hasEOL,
        },
      );
      const match = matchExistingTextSpanToContentStream({ span, content });
      expect(match.status).toBe('matched');
      if (match.status !== 'matched' || replaced) continue;
      // Page-space matches carry spacing; the legacy exact subset never matched this file.
      expect(match.provenance.spacingPt).toBeDefined();

      const replacementText = item.str.slice(0, Math.max(1, item.str.length - 1));
      const result = await replaceSimpleExistingTextTj({
        pdfBytes: bytes,
        currentRevisionId: 'sha256:f01',
        span,
        intent: createExistingTextEditIntent(span, replacementText),
        provenance: match.provenance,
      });
      const after = await pageItems(result.pdfBytes);
      expect(after.map((entry) => entry.str)).toContain(replacementText);
      expect(after.map((entry) => entry.str)).not.toContain(item.str);
      replaced = true;
    }
    expect(replaced).toBe(true);
  });
});
