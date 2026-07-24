import { describe, expect, it } from 'vitest';
import type { TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PsIsonoteMapping } from './psIsonoteTable';
import {
  buildPsIsonoteAnnotationRecipe,
  findPsIsonoteReferencesInTextItems,
  planPsIsonoteCallouts,
  type PsIsonoteScanResult,
} from './psIsonoteRecipe';

const mapping: PsIsonoteMapping = {
  psNo: 'PS-1234.5',
  family: 'Guide',
  isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
  sourceRow: 2,
};

function textItem(id: string, text: string, x: number, y: number, width: number): TextLayerItem {
  return { id, text, x, y, width, height: 10, fontSize: 9 };
}

describe('psIsonoteRecipe', () => {
  it('finds a PS number split across PDF text items', () => {
    const items = [
      textItem('a', 'PS', 100, 200, 12),
      textItem('b', '-', 112, 200, 4),
      textItem('c', '1234', 116, 200, 24),
      textItem('d', '.5', 140, 200, 8),
    ];

    const references = findPsIsonoteReferencesInTextItems(items, [mapping], 3);

    expect(references).toHaveLength(1);
    expect(references[0]).toMatchObject({
      psNo: 'PS-1234.5',
      pageNumber: 3,
      rect: { x: 100, y: 200, width: 48, height: 10 },
    });
  });

  it('ignores PS numbers that are absent from the mapping table', () => {
    const items = [textItem('a', 'PS-9999.1', 20, 30, 60)];
    expect(findPsIsonoteReferencesInTextItems(items, [mapping], 1)).toEqual([]);
  });

  it('plans a nearby callout and builds standard macro steps', () => {
    const scan: PsIsonoteScanResult = {
      references: [
        {
          psNo: mapping.psNo,
          pageNumber: 1,
          rect: { x: 100, y: 180, width: 60, height: 12 },
          mapping,
        },
      ],
      missingPsNumbers: [],
      skippedExisting: [],
      scannedPages: [1],
      pageDimensions: { 1: { width: 595, height: 842 } },
    };

    const planned = planPsIsonoteCallouts(scan, { noteWidth: 210, placement: 'right' });
    expect(planned).toHaveLength(1);
    expect(planned[0].box.x).toBeGreaterThan(160);
    expect(planned[0].box.width).toBe(210);

    const { recipe, callouts } = buildPsIsonoteAnnotationRecipe(scan, {
      noteWidth: 210,
      includeFamily: true,
    });

    expect(callouts).toHaveLength(1);
    expect(recipe.steps[0]).toMatchObject({
      op: 'place_rich_textbox',
      selector: { mode: 'list', pages: [1] },
      width: 210,
    });
    expect(recipe.steps[0]).toHaveProperty('content');
    expect(JSON.stringify(recipe.steps[0])).toContain('REST(6kN)');
    expect(recipe.steps.at(-1)).toMatchObject({
      op: 'draw_text_on_pages',
      text: 'PDFHUBISONOTE[1234.5]',
    });
  });

  it('moves colliding callouts apart on the same page', () => {
    const scan: PsIsonoteScanResult = {
      references: [
        { psNo: mapping.psNo, pageNumber: 1, rect: { x: 100, y: 180, width: 60, height: 12 }, mapping },
        { psNo: 'PS-1234.6', pageNumber: 1, rect: { x: 100, y: 182, width: 60, height: 12 }, mapping: { ...mapping, psNo: 'PS-1234.6' } },
      ],
      missingPsNumbers: [],
      skippedExisting: [],
      scannedPages: [1],
      pageDimensions: { 1: { width: 595, height: 842 } },
    };

    const planned = planPsIsonoteCallouts(scan, { noteWidth: 210 });
    expect(planned).toHaveLength(2);
    expect(planned[0].box.y).not.toBe(planned[1].box.y);
  });
});
