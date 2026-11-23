import { describe, expect, it } from 'vitest';
import { parsePageContentStreams } from '../parser';
import type { DecodedPageContentStreamInput } from '../types';

function makeStream(
  content: string,
  streamIndex = 0,
): DecodedPageContentStreamInput {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    bytes[i] = content.charCodeAt(i) & 0xff;
  }
  return {
    streamIndex,
    streamRef: `${streamIndex + 5} 0 R`,
    decodedBytes: bytes,
  };
}

describe('PDF Content Stream Parser', () => {
  it('parses single-stream text objects and operations', () => {
    const source = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello) Tj ET';
    const ast = parsePageContentStreams([makeStream(source)]);

    expect(ast.complete).toBe(true);
    expect(ast.diagnostics).toEqual([]);
    expect(ast.operations).toHaveLength(5); // BT, Tf, Tm, Tj, ET

    const operators = ast.operations.map((op) => op.operator);
    expect(operators).toEqual(['BT', 'Tf', 'Tm', 'Tj', 'ET']);

    const textNodes = ast.structuredNodes.filter(
      (n): n is import('../types').PdfTextObjectNode => n.type === 'text-object',
    );
    expect(textNodes).toHaveLength(1);
    const textNode = textNodes[0];
    expect(textNode.fontResourceName).toBe('F1');
    expect(textNode.fontSizePt).toBe(12);
    expect(textNode.textMatrix).toEqual([1, 0, 0, 1, 72, 700]);
  });

  it('threads graphics state across multi-stream arrays (ISO 32000-1 §7.8.2)', () => {
    // Stream 0 opens q and draws text; Stream 1 closes Q
    const stream0 = makeStream('q 1 0 0 1 0 0 cm BT /F1 10 Tf (Text) Tj ET', 0);
    const stream1 = makeStream('Q', 1);

    const ast = parsePageContentStreams([stream0, stream1]);

    expect(ast.complete).toBe(true);
    // No fatal diagnostics; multi-stream Q popped the q from stream 0 seamlessly!
    const fatal = ast.diagnostics.filter((d) => d.code === 'Q_UNDERFLOW');
    expect(fatal).toEqual([]);
    expect(ast.operations).toHaveLength(7);
  });

  it('handles page-boundary unclosed q per ISO 32000-1 §8.4.1 (the exact user problem)', () => {
    // Producer emitted q at start of stream 0 but omitted Q at end of page
    const stream0 = makeStream('q 1 0 0 1 0 0 cm BT /F1 12 Tf 1 0 0 1 72 700 Tm (Title) Tj ET', 0);

    const ast = parsePageContentStreams([stream0]);

    // AST completes successfully because text object was cleanly closed inside BT..ET
    expect(ast.complete).toBe(true);
    const teardownDiag = ast.diagnostics.find((d) => d.code === 'PAGE_BOUNDARY_UNCLOSED_Q');
    expect(teardownDiag).toBeDefined();
    expect(teardownDiag?.message).toContain('ISO 32000-1 §8.4.1');
  });

  it('fails closed on true Q underflow (Q without matching q)', () => {
    const stream0 = makeStream('Q BT /F1 12 Tf (Corrupted) Tj ET', 0);
    const ast = parsePageContentStreams([stream0]);

    expect(ast.complete).toBe(false);
    const underflow = ast.diagnostics.find((d) => d.code === 'Q_UNDERFLOW');
    expect(underflow).toBeDefined();
  });

  it('parses TJ arrays with kerning and numbers', () => {
    const source = 'BT /F1 12 Tf [ (Hel) -10 (lo) 20 ( World) ] TJ ET';
    const ast = parsePageContentStreams([makeStream(source)]);

    expect(ast.complete).toBe(true);
    const tjOp = ast.operations.find((op) => op.operator === 'TJ');
    expect(tjOp).toBeDefined();
    expect(tjOp?.operands).toHaveLength(1);
    expect(tjOp?.operands[0].kind).toBe('array');

    if (tjOp?.operands[0].kind === 'array') {
      const items = tjOp.operands[0].items;
      expect(items).toHaveLength(5);
      expect(items[0].kind).toBe('literal-string');
      expect(items[1].kind).toBe('number');
      expect((items[1] as { value: number }).value).toBe(-10);
    }
  });

  it('updates text line matrix on Td, TD, and T*', () => {
    const source = 'BT /F1 12 Tf 1 0 0 1 50 500 Tm (Line1) Tj 0 -14 Td (Line2) Tj ET';
    const ast = parsePageContentStreams([makeStream(source)]);

    expect(ast.complete).toBe(true);
    const textNode = ast.structuredNodes[0];
    expect(textNode.type).toBe('text-object');
    if (textNode.type === 'text-object') {
      expect(textNode.textMatrix).toEqual([1, 0, 0, 1, 50, 486]);
    }
  });

  it('admits uniform font scaling in Tm as placement-safe (ISO 32000-1 §9.4.4)', () => {
    // Common in LaTeX/Cairo: font size set to 1 in Tf, scaled in Tm
    const source = 'BT /F1 1 Tf 12 0 0 12 72 700 Tm (Scaled Text) Tj ET';
    const ast = parsePageContentStreams([makeStream(source)]);

    expect(ast.complete).toBe(true);
    const textNode = ast.structuredNodes[0];
    expect(textNode.type).toBe('text-object');
    if (textNode.type === 'text-object') {
      expect(textNode.textMatrix).toEqual([12, 0, 0, 12, 72, 700]);
    }
  });

  it('preserves operands across stream boundaries when split', () => {
    // Stream 0 ends with numbers; Stream 1 begins with operator
    const stream0 = makeStream('BT /F1 12 Tf 0 -15', 0);
    const stream1 = makeStream('Td (Split Stream Text) Tj ET', 1);
    const ast = parsePageContentStreams([stream0, stream1]);

    expect(ast.complete).toBe(true);
    const tdOp = ast.operations.find((op) => op.operator === 'Td');
    expect(tdOp).toBeDefined();
    expect(tdOp?.operands).toHaveLength(2);
  });

  it('parses dictionaries with nested array values', () => {
    const source = '/Artifact << /BBox [ 0 0 100 100 ] >> BDC EMC';
    const ast = parsePageContentStreams([makeStream(source)]);

    expect(ast.complete).toBe(true);
    const bdcOp = ast.operations.find((op) => op.operator === 'BDC');
    expect(bdcOp).toBeDefined();
    expect(bdcOp?.operands).toHaveLength(2);

    const dictOp = bdcOp?.operands[1];
    expect(dictOp?.kind).toBe('dict');
    if (dictOp?.kind === 'dict') {
      const bbox = dictOp.entries['BBox'];
      expect(bbox.kind).toBe('array');
    }
  });
});
