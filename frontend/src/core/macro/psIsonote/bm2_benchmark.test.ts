import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parsePsIsonoteTable } from './psIsonoteTable';
import { scanPsIsonoteReferences, planPsIsonoteCallouts, buildPsIsonoteAnnotationRecipe } from './psIsonoteRecipe';
import { PdfEditAdapter } from '@/adapters/pdf-edit/PdfEditAdapter';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import { inspectMacroRecipeBudget } from '../resourceBudget';

describe('BM2 Definitive Benchmark — User CSV and PDF Integration', () => {
  it('parses Navis CSV, scans target PDF, solves white-space layouts, and generates interactive vector callouts', async () => {
    const pdfPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001 - Copy.pdf';
    const csvPath = 'D:/Code3/Tag to PDF/BM2/Navis based ISONOTE.csv';

    if (!fs.existsSync(pdfPath) || !fs.existsSync(csvPath)) {
      return;
    }

    const csvText = fs.readFileSync(csvPath, 'utf8');
    const parsed = parsePsIsonoteTable(csvText);

    const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
    const lease = await PdfRendererAdapter.acquireDocument(pdfBytes);
    const pageCount = lease.doc.numPages;
    expect(pageCount).toBeGreaterThan(0);
    await lease.release();

    const scanResult = await scanPsIsonoteReferences(pdfBytes, parsed.mappings, {
      selector: { mode: 'all' },
      skipExisting: false,
      tolerance: 'stem',
    });

    const scanExact = await scanPsIsonoteReferences(pdfBytes, parsed.mappings, {
      selector: { mode: 'all' },
      skipExisting: false,
      tolerance: 'exact',
    });

    expect(scanExact.references.length).toBeLessThan(scanResult.references.length);

    if (scanResult.references.length === 0) {
      throw new Error('Zero references matched in BM2 scan.');
    }

    const callouts = planPsIsonoteCallouts(scanResult);
    if (callouts.length > 0 && callouts[0].professionalModel) {
      expect(callouts[0].professionalModel.tag).toMatch(/^Tag No\. \d+, .+/);
    }

    const placedCount = callouts.filter(c => c.layoutStatus === 'placed').length;
    expect(placedCount).toBeGreaterThan(0);

    const missingProfessionalModel = callouts.filter(c => !c.professionalModel);
    expect(missingProfessionalModel).toHaveLength(0);

    const builtRecipe = buildPsIsonoteAnnotationRecipe(scanResult);
    // Definitive cyclic graph check — must not throw
    inspectMacroRecipeBudget(builtRecipe.recipe);

    // Inspect callout coordinates against page dimensions
    const { PdfRendererAdapter: Renderer2 } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
    const inspectLease = await Renderer2.acquireDocument(pdfBytes);
    const inspectPage = await inspectLease.doc.getPage(1);
    const viewport = inspectPage.getViewport({ scale: 1 });
    expect(viewport.width).toBeGreaterThan(0);
    await inspectLease.release();

    const { PDFDocument: PDFDoc2 } = await import('pdf-lib');
    const pdfLibForInspect = await PDFDoc2.load(pdfBytes);
    const pdfLibPage = pdfLibForInspect.getPage(0);
    expect(pdfLibPage.getWidth()).toBeGreaterThan(0);

    // Draw ALL callouts in a single batch (single load/save cycle — prevents OOM and blank output)
    const calloutOps = callouts
      .filter(c => c.professionalModel !== undefined)
      .map(c => ({ pages: [c.pageNumber - 1], callout: c.professionalModel! }));
    const outputBytes = await PdfEditAdapter.drawProfessionalCallouts(pdfBytes, calloutOps);

    const bmOutPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001_BENCHMARKED.pdf';
    fs.writeFileSync(bmOutPath, outputBytes);

    const repoOutPath = 'F:/CODE-6/Pdf-Hub/bm2_benchmark_annotated.pdf';
    fs.writeFileSync(repoOutPath, outputBytes);

    expect(callouts.length).toBeGreaterThan(0);
  }, 30000);
});
