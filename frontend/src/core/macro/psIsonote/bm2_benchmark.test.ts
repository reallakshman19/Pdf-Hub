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
      console.warn('Benchmark input files not found - check paths');
      return;
    }

    const csvText = fs.readFileSync(csvPath, 'utf8');
    const parsed = parsePsIsonoteTable(csvText);
    console.log(`[BM2 Audit] Parsed ${parsed.mappings.length} mappings from Navis CSV. Delimiter detected: "${parsed.delimiter}"`);
    if (parsed.mappings.length > 0) {
      console.log(`[BM2 Audit] Sample mapping 0: PS No = "${parsed.mappings[0].psNo}", Tag No = "${parsed.mappings[0].tagNo}", Family = "${parsed.mappings[0].family}", Note = "${parsed.mappings[0].isonote.slice(0, 50)}..."`);
    }

    const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
    const lease = await PdfRendererAdapter.acquireDocument(pdfBytes);
    const pageCount = lease.doc.numPages;
    console.log(`[BM2 Audit] Loaded PDF document with ${pageCount} pages.`);
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

    console.log(`[BM2 Audit] Tolerant ('stem') scan matched ${scanResult.references.length} PS occurrences.`);
    console.log(`[BM2 Audit] Strict ('exact') scan matched ${scanExact.references.length} PS occurrences.`);
    expect(scanExact.references.length).toBeLessThan(scanResult.references.length);

    console.log(`[BM2 Audit] Page dimensions in scan:`, JSON.stringify(scanResult.pageDimensions));
    console.log(`[BM2 Audit] Page scenes captured in scan:`, Object.keys(scanResult.pageScenes || {}).length, 'pages');

    if (scanResult.references.length === 0) {
      throw new Error('Zero references matched in BM2 scan.');
    }

    const callouts = planPsIsonoteCallouts(scanResult);
    console.log(`[BM2 Audit] Planned ${callouts.length} total callouts.`);
    if (callouts.length > 0 && callouts[0].professionalModel) {
      console.log(`[BM2 Audit] Sample callout header line: "${callouts[0].professionalModel.tag}"`);
      expect(callouts[0].professionalModel.tag).toMatch(/^Tag No\. \d+, .+/);
    }

    const placedCount = callouts.filter(c => c.layoutStatus === 'placed').length;
    const unplaceableCount = callouts.filter(c => c.layoutStatus === 'unplaceable').length;
    console.log(`[BM2 Audit] Layout performance: ${placedCount}/${callouts.length} placed without blocker collisions. (${unplaceableCount} fallback/unplaceable)`);

    const missingProfessionalModel = callouts.filter(c => !c.professionalModel);
    if (missingProfessionalModel.length > 0) {
      console.error(`[BM2 Audit] WARNING: ${missingProfessionalModel.length} callouts lack professionalModel!`);
    } else {
      console.log(`[BM2 Audit] 100% of planned callouts have a professional vector callout model attached.`);
    }

    const builtRecipe = buildPsIsonoteAnnotationRecipe(scanResult);
    // Definitive cyclic graph check — must not throw
    inspectMacroRecipeBudget(builtRecipe.recipe);
    const profSteps = builtRecipe.recipe.steps.filter(s => s.op === 'place_professional_callout');
    const richSteps = builtRecipe.recipe.steps.filter(s => s.op === 'place_rich_textbox');
    console.log(`[BM2 Audit] Recipe generation: emitted ${profSteps.length} place_professional_callout steps and ${richSteps.length} place_rich_textbox steps.`);

    // Inspect callout coordinates against page dimensions
    const { PdfRendererAdapter: Renderer2 } = await import('@/adapters/pdf-renderer/PdfRendererAdapter');
    const inspectLease = await Renderer2.acquireDocument(pdfBytes);
    const inspectPage = await inspectLease.doc.getPage(1);
    const viewport = inspectPage.getViewport({ scale: 1 });
    console.log(`[BM2 Audit] Page viewport: width=${viewport.width.toFixed(1)}, height=${viewport.height.toFixed(1)}`);
    await inspectLease.release();

    console.log('[BM2 Audit] --- First 3 callout models ---');
    for (const callout of callouts.slice(0, 3)) {
      if (!callout.professionalModel) continue;
      const m = callout.professionalModel;
      console.log(`  psNo=${m.psNo} box={x:${m.box.x.toFixed(1)}, y:${m.box.y.toFixed(1)}, w:${m.box.width.toFixed(1)}} target={x:${m.targetPoint.x.toFixed(1)}, y:${m.targetPoint.y.toFixed(1)}} primitives=${m.primitives.length}`);
    }

    const { PDFDocument: PDFDoc2 } = await import('pdf-lib');
    const pdfLibForInspect = await PDFDoc2.load(pdfBytes);
    const pdfLibPage = pdfLibForInspect.getPage(0);
    console.log(`[BM2 Audit] pdf-lib page size: width=${pdfLibPage.getWidth().toFixed(1)}, height=${pdfLibPage.getHeight().toFixed(1)}`);
    const rotation = pdfLibPage.getRotation();
    // Log the actual primitive data of the first callout
    if (callouts[0]?.professionalModel) {
      const m = callouts[0].professionalModel;
      console.log(`[BM2 Audit] First callout primitive types: ${m.primitives.map(p => p.type).join(', ')}`);
      for (const p of m.primitives.slice(0, 2)) {
        console.log(`  [${p.type}] ${JSON.stringify(p).slice(0, 120)}`);
      }
    }

    // Draw ALL callouts in a single batch (single load/save cycle — prevents OOM and blank output)
    const calloutOps = callouts
      .filter(c => c.professionalModel !== undefined)
      .map(c => ({ pages: [c.pageNumber - 1], callout: c.professionalModel! }));
    const outputBytes = await PdfEditAdapter.drawProfessionalCallouts(pdfBytes, calloutOps);
    console.log(`[BM2 Audit] Batch drew ${calloutOps.length} callouts in single load/save. Output: ${outputBytes.length} bytes (+${outputBytes.length - pdfBytes.length})`);

    const bmOutPath = 'D:/Code3/Tag to PDF/BM2/AML-88-PDFEED-MP-2343-00010-0315-001_BENCHMARKED.pdf';
    fs.writeFileSync(bmOutPath, outputBytes);
    console.log(`[BM2 Audit] Successfully saved verified benchmark PDF to: ${bmOutPath}`);

    const repoOutPath = 'F:/CODE-6/Pdf-Hub/bm2_benchmark_annotated.pdf';
    fs.writeFileSync(repoOutPath, outputBytes);
    console.log(`[BM2 Audit] Saved copy to repository root: ${repoOutPath}`);

    expect(callouts.length).toBeGreaterThan(0);
  }, 30000);
});
