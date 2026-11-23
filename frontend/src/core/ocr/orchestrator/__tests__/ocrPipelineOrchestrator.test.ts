import { describe, it, expect, vi } from 'vitest';
import { runUnifiedOcrPipeline, type UnifiedPipelineInput } from '../ocrPipelineOrchestrator';
import type { OcrLine, OcrWord } from '../../types';

describe('ocrPipelineOrchestrator', () => {
  const sampleLines: OcrLine[] = [
    {
      id: 'l-1',
      pageIndex: 0,
      text: 'Invoice Number: INV-9021',
      confidence: 0.95,
      bbox: { x: 50, y: 100, width: 200, height: 14 },
      wordIds: ['w-1', 'w-2', 'w-3'],
    },
    {
      id: 'l-2',
      pageIndex: 0,
      text: '[x] Agree to Terms and Conditions',
      confidence: 0.93,
      bbox: { x: 50, y: 120, width: 220, height: 14 },
      wordIds: ['w-4', 'w-5', 'w-6', 'w-7', 'w-8'],
    },
    {
      id: 'l-3',
      pageIndex: 0,
      text: 'Contact: billing@acmecorp.com or 555-123-4567',
      confidence: 0.94,
      bbox: { x: 50, y: 140, width: 280, height: 14 },
      wordIds: ['w-9', 'w-10', 'w-11', 'w-12'],
    },
  ];

  const sampleWords: OcrWord[] = [
    { id: 'w-1', lineId: 'l-1', pageIndex: 0, text: 'Invoice', normalizedText: 'invoice', confidence: 0.95, bbox: { x: 50, y: 100, width: 50, height: 14 } },
    { id: 'w-2', lineId: 'l-1', pageIndex: 0, text: 'Number:', normalizedText: 'number:', confidence: 0.95, bbox: { x: 105, y: 100, width: 55, height: 14 } },
    { id: 'w-3', lineId: 'l-1', pageIndex: 0, text: 'INV-9021', normalizedText: 'inv-9021', confidence: 0.95, bbox: { x: 165, y: 100, width: 65, height: 14 } },
  ];

  it('runs the complete multi-stage pipeline and aggregates results', async () => {
    const progressSpy = vi.fn();

    const input: UnifiedPipelineInput = {
      documentFingerprint: 'doc-orchestrate-1',
      pages: [
        {
          pageIndex: 0,
          widthPt: 612,
          heightPt: 792,
          lines: sampleLines,
          words: sampleWords,
        },
      ],
      detectTables: true,
      detectForms: true,
      detectPii: true,
      buildPdfUaTree: true,
      onProgress: progressSpy,
    };

    const result = await runUnifiedOcrPipeline(input);

    // Document result
    expect(result.ocrDocument.documentFingerprint).toBe('doc-orchestrate-1');
    expect(result.ocrDocument.pages).toHaveLength(1);
    expect(result.ocrDocument.pages[0].pageNumber).toBe(1);

    // Form extraction
    expect(result.forms.keyValuePairs).toHaveLength(2);
    expect(result.forms.keyValuePairs[0].keyText).toBe('Invoice Number');
    expect(result.forms.keyValuePairs[0].valueText).toBe('INV-9021');

    // OMR Checkbox detection
    expect(result.forms.omrMarks).toHaveLength(1);
    expect(result.forms.omrMarks[0].state).toBe('checked');
    expect(result.forms.omrMarks[0].label).toBe('Agree to Terms and Conditions');

    // PII Detection
    expect(result.forms.piiEntities.length).toBeGreaterThanOrEqual(1);
    const emailEntity = result.forms.piiEntities.find((e) => e.category === 'email');
    expect(emailEntity?.rawText).toBe('billing@acmecorp.com');

    // PDF/UA Structure tree
    expect(result.pdfUaTree).toBeDefined();
    expect(result.pdfUaTree?.rootElement.type).toBe('Document');

    // Telemetry summary
    expect(result.telemetry.totalPagesProcessed).toBe(1);
    expect(result.telemetry.peakCanvasMemoryMb).toBeGreaterThan(0);

    // Progress events fired
    expect(progressSpy).toHaveBeenCalled();
  });

  it('aborts cleanly when AbortSignal is signaled', async () => {
    const controller = new AbortController();
    controller.abort();

    const input: UnifiedPipelineInput = {
      documentFingerprint: 'doc-abort-1',
      pages: [{ pageIndex: 0, widthPt: 612, heightPt: 792 }],
      signal: controller.signal,
    };

    await expect(runUnifiedOcrPipeline(input)).rejects.toThrow(/aborted/);
  });
});
