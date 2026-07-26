import { describe, expect, it } from 'vitest';
import type { TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PsIsonoteMapping } from './psIsonoteTable';
import {
  buildPsIsonoteAnnotationRecipe,
  findPsIsonoteReferencesInTextItems,
  planPsIsonoteCallouts,
  type PsIsonoteScanResult,
  type PsIsonoteTextReference,
} from './psIsonoteRecipe';

const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const INPUT_HASH = `sha256:${'c'.repeat(64)}`;

const mapping: PsIsonoteMapping = {
  psNo: 'PS-1234.5',
  family: 'Guide',
  isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
  sourceRow: 2,
};

function textItem(id: string, text: string, x: number, y: number, width: number): TextLayerItem {
  return { id, text, x, y, width, height: 10, fontSize: 9 };
}

function reference(
  psNo: string,
  y: number,
  mappingOverride: PsIsonoteMapping = mapping,
  mappingHash = HASH_A,
  occurrenceId = HASH_B,
): PsIsonoteTextReference {
  return {
    psNo,
    pageNumber: 1,
    rect: { x: 100, y, width: 60, height: 12 },
    mapping: mappingOverride,
    mappingHash,
    occurrenceId,
    existingMarkerState: 'none',
    rawMatchedText: psNo,
    matchMethod: 'exact',
    textItemCount: 1,
  };
}

function scan(references: PsIsonoteTextReference[]): PsIsonoteScanResult {
  return {
    inputSha256: INPUT_HASH,
    references,
    detectedReferences: references,
    missingPsNumbers: [],
    skippedExisting: [],
    staleExisting: [],
    legacyExisting: [],
    scannedPages: [1],
    pageDimensions: { 1: { width: 595, height: 842 } },
  };
}

describe('psIsonoteRecipe', () => {
  it('finds a PS number split across PDF text items and retains evidence', () => {
    const items = [
      textItem('a', 'PS', 100, 200, 12),
      textItem('b', '-', 112, 200, 4),
      textItem('c', '1234', 116, 200, 24),
      textItem('d', '.5', 140, 200, 8),
    ];

    const references = findPsIsonoteReferencesInTextItems(
      items,
      [mapping],
      3,
      new Map([[mapping.psNo, HASH_A]]),
    );

    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      psNo: 'PS-1234.5',
      pageNumber: 3,
      rect: { x: 100, y: 200, width: 48, height: 10 },
      mappingHash: HASH_A,
      matchMethod: 'joined-text-items',
      textItemCount: 4,
    });
    expect(references[0].rawMatchedText).toContain('1234');
  });

  it('classifies a canonical single-item PS number as exact', () => {
    const references = findPsIsonoteReferencesInTextItems(
      [textItem('a', 'PS-1234.5', 20, 30, 60)],
      [mapping],
      1,
      new Map([[mapping.psNo, HASH_A]]),
    );

    expect(references[0]).toMatchObject({
      rawMatchedText: 'PS-1234.5',
      matchMethod: 'exact',
      textItemCount: 1,
    });
  });

  it('classifies a Unicode dash variant as normalized rather than exact', () => {
    const references = findPsIsonoteReferencesInTextItems(
      [textItem('a', 'PS–1234.5', 20, 30, 60)],
      [mapping],
      1,
      new Map([[mapping.psNo, HASH_A]]),
    );

    expect(references[0].matchMethod).toBe('normalized');
  });

  it('ignores PS numbers that are absent from the mapping table', () => {
    const items = [textItem('a', 'PS-9999.1', 20, 30, 60)];
    expect(findPsIsonoteReferencesInTextItems(items, [mapping], 1)).toEqual([]);
  });

  it('plans a nearby callout and writes a versioned occurrence marker without a searchable PS prefix', () => {
    const detectedReference = reference(mapping.psNo, 180);
    const result = scan([detectedReference]);

    const planned = planPsIsonoteCallouts(result, { noteWidth: 210, placement: 'right' });
    expect(planned).toHaveLength(1);
    expect(planned[0].box.x).toBeGreaterThan(160);
    expect(planned[0].box.width).toBe(210);

    const { recipe, callouts } = buildPsIsonoteAnnotationRecipe(result, {
      noteWidth: 210,
      includeFamily: true,
    });

    expect(callouts).toHaveLength(1);
    expect(recipe.steps[0]).toMatchObject({
      op: 'place_rich_textbox',
      selector: { mode: 'list', pages: [1] },
      width: 210,
    });
    expect(JSON.stringify(recipe.steps[0])).toContain('REST(6kN)');
    expect(recipe.steps.at(-1)).toMatchObject({
      op: 'draw_text_on_pages',
      text: `PDFHUBISONOTE[v2|1234.5|${HASH_A}|${HASH_B}]`,
    });
    expect(JSON.stringify(recipe.steps.at(-1))).not.toContain('|PS-1234.5|');
  });

  it('moves colliding callouts apart on the same page', () => {
    const first = reference(mapping.psNo, 180);
    const secondMapping = { ...mapping, psNo: 'PS-1234.6' };
    const second = reference(secondMapping.psNo, 182, secondMapping, HASH_B, HASH_A);

    const planned = planPsIsonoteCallouts(scan([first, second]), { noteWidth: 210 });
    expect(planned).toHaveLength(2);
    expect(planned[0].box.y).not.toBe(planned[1].box.y);
  });

  it('formats callout HTML with Tag and ISO Note including confidence shorthand', () => {
    const confMapping: PsIsonoteMapping = {
      psNo: 'PS-11168.8',
      family: 'Remove Guide',
      isonote: ':/PS-11168.8 Remove Guide',
      confidence: 'HIGH',
      sourceRow: 5,
    };
    const detected = reference('PS-11168.8', 200, confMapping);
    const result = scan([detected]);
    const { recipe } = buildPsIsonoteAnnotationRecipe(result, { includeFamily: true });
    const stepContent = (recipe.steps[0] as any).content;
    expect(stepContent).toContain('Tag: Remove Guide');
    expect(stepContent).toContain('ISO Note: :/PS-11168.8 Remove Guide (C=H)');
  });
});
