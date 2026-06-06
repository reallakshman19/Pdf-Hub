import { describe, expect, it } from 'vitest';
import { getOcrProfile } from '../ocrProfiles';
import { mockOcrEngine } from '../engines/mockOcrEngine';
import { createOcrEngineRegistry } from '../engines/ocrEngineRegistry';
import { validateOcrDocumentResult } from '../types';

describe('mockOcrEngine', () => {
  it('produces deterministic OCR output for clean scan profile', async () => {
    const result = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-1',
      profile: getOcrProfile('clean-scan'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    expect(result.documentFingerprint).toBe('doc-1');
    expect(result.engineId).toBe('mock');
    expect(result.profileId).toBe('clean-scan');
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]!.words!.length).toBeGreaterThan(0);
    expect(result.pages[0]!.blocks.some((block) => block.type === 'heading')).toBe(true);
    expect(result.pages[0]!.blocks.some((block) => block.type === 'paragraph')).toBe(true);

    const validation = validateOcrDocumentResult(result);

    expect(validation.valid).toBe(true);
  });

  it('produces table block when table-heavy profile enables table detection', async () => {
    const result = await mockOcrEngine.recognize({
      documentFingerprint: 'doc-2',
      profile: getOcrProfile('table-heavy'),
      pages: [
        {
          pageIndex: 0,
          imageBytes: new Uint8Array([1, 2, 3]),
          width: 595,
          height: 842,
        },
      ],
    });

    const table = result.pages[0]!.blocks.find((block) => block.type === 'table');

    expect(table).toBeTruthy();

    if (table?.type === 'table') {
      expect(table.rows!).toHaveLength(3);
      expect(table.rows![0].cells).toHaveLength(2);
      expect(table.rows![1].cells[0].text).toBe('Pipe');
    }

    const validation = validateOcrDocumentResult(result);

    expect(validation.valid).toBe(true);
  });

  it('registers mock OCR engine in registry', () => {
    const registry = createOcrEngineRegistry();

    expect(registry.getEngine('mock')).toBe(mockOcrEngine);
    expect(registry.getEngine('missing')).toBeNull();
    expect(registry.listEngines().map((engine) => engine.id)).toContain('mock');
  });
});
