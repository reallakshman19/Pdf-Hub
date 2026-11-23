import { describe, expect, it } from 'vitest';
import { parsePageContentStreams } from '../parser';
import { serializeContentStreamAST } from '../serializer';
import {
  extractAllText,
  findTextObjects,
  findTextOperations,
  replaceTextById,
  replaceTextInOperation,
} from '../transformer';
import { bytesToLatin1 } from '../lexer';
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
    streamRef: `${streamIndex + 10} 0 R`,
    decodedBytes: bytes,
  };
}

describe('PDF Content Stream AST Round-Trip & Transformation', () => {
  it('achieves 100% round-trip fidelity on complex streams', () => {
    const complexStream = [
      'q',
      '1 0 0 1 0 0 cm',
      '0.2 0.4 0.6 rg',
      '10 10 100 200 re',
      'f',
      'BT',
      '/F1 14 Tf',
      '1 0 0 1 50 720 Tm',
      '(Document Heading) Tj',
      '0 -20 Td',
      '/F2 10 Tf',
      '[(Subheading with ) -15 (Kerning)] TJ',
      'ET',
      'Q',
    ].join('\n');

    const originalAst = parsePageContentStreams([makeStream(complexStream)]);
    expect(originalAst.complete).toBe(true);

    const serializedBytes = serializeContentStreamAST(originalAst);
    const serializedStr = bytesToLatin1(serializedBytes);

    const roundTripAst = parsePageContentStreams([makeStream(serializedStr)]);
    expect(roundTripAst.complete).toBe(true);

    // Verify operations count and operators match exactly
    expect(roundTripAst.operations.length).toBe(originalAst.operations.length);
    for (let i = 0; i < originalAst.operations.length; i++) {
      expect(roundTripAst.operations[i].operator).toBe(
        originalAst.operations[i].operator,
      );
    }

    // Verify extracted text matches exactly
    expect(extractAllText(roundTripAst)).toEqual([
      'Document Heading',
      'Subheading with Kerning',
    ]);
  });

  it('mutates text in AST without byte-offset slicing', () => {
    const source = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Hello Original) Tj ET';
    const ast = parsePageContentStreams([makeStream(source)]);

    const textOps = findTextOperations(ast);
    expect(textOps).toHaveLength(1);

    const success = replaceTextInOperation(textOps[0], 'Brand New Text');
    expect(success).toBe(true);

    // Serialize mutated AST
    const updatedBytes = serializeContentStreamAST(ast);
    const updatedStr = bytesToLatin1(updatedBytes);

    expect(updatedStr).toContain('(Brand New Text) Tj');
    expect(updatedStr).not.toContain('Hello Original');

    // Re-parse to verify AST integrity after mutation
    const reParsedAst = parsePageContentStreams([makeStream(updatedStr)]);
    expect(reParsedAst.complete).toBe(true);
    expect(extractAllText(reParsedAst)).toEqual(['Brand New Text']);
  });

  it('mutates single-string or kerning TJ arrays via AST', () => {
    const source = 'BT /F1 12 Tf [(Old Kerning Text)] TJ ET';
    const ast = parsePageContentStreams([makeStream(source)]);

    const tjOp = ast.operations.find((op) => op.operator === 'TJ');
    expect(tjOp).toBeDefined();

    if (tjOp) {
      const success = replaceTextInOperation(tjOp, 'Updated Kerning Text');
      expect(success).toBe(true);
    }

    const updatedStr = bytesToLatin1(serializeContentStreamAST(ast));
    expect(updatedStr).toContain('[(Updated Kerning Text)] TJ');

    const reParsed = parsePageContentStreams([makeStream(updatedStr)]);
    expect(extractAllText(reParsed)).toEqual(['Updated Kerning Text']);
  });

  it('replaces text by operation ID and supports hex mode', () => {
    const source = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Secret) Tj ET';
    const ast = parsePageContentStreams([makeStream(source)]);
    const targetId = ast.operations.find((op) => op.operator === 'Tj')?.id;

    expect(targetId).toBeDefined();
    if (targetId) {
      replaceTextById(ast, targetId, 'Confidential', { preferHex: true });
    }

    const updatedStr = bytesToLatin1(serializeContentStreamAST(ast));
    // Confidential in hex is 436F6E666964656E7469616C
    expect(updatedStr).toContain('<436F6E666964656E7469616C> Tj');
  });

  it('locates text objects in structured hierarchy', () => {
    const source = [
      'q',
      'BT /F1 12 Tf (Inside Block) Tj ET',
      'Q',
      'BT /F2 10 Tf (Outside Block) Tj ET',
    ].join('\n');

    const ast = parsePageContentStreams([makeStream(source)]);
    const textObjects = findTextObjects(ast);

    expect(textObjects).toHaveLength(2);
    expect(textObjects[0].fontResourceName).toBe('F1');
    expect(textObjects[1].fontResourceName).toBe('F2');
  });

  it('fails closed with a typed error on non-ASCII replacement without silent truncation', () => {
    const source = 'BT /F1 12 Tf 1 0 0 1 72 700 Tm (Ascii) Tj ET';
    const ast = parsePageContentStreams([makeStream(source)]);
    const op = ast.operations.find((candidate) => candidate.operator === 'Tj');

    expect(op).toBeDefined();
    if (op) {
      // '—' is em-dash U+2014, outside ASCII range
      expect(() => replaceTextInOperation(op, 'Hello—World')).toThrow(
        /outside the printable ASCII range/,
      );
    }
  });

  it('preserves and round-trips inline images with raw binary data', () => {
    const binaryData = '(\x00\xff<%/binary_data';
    const source = `q\nBI /W 10 /H 10 /BPC 8 ID ${binaryData} EI\nQ`;
    const ast = parsePageContentStreams([makeStream(source)]);

    expect(ast.complete).toBe(true);
    const serialized = bytesToLatin1(serializeContentStreamAST(ast));
    expect(serialized).toContain(binaryData);
    expect(serialized).toContain('BI');
    expect(serialized).toContain('EI');

    const reParsed = parsePageContentStreams([makeStream(serialized)]);
    expect(reParsed.complete).toBe(true);
  });
});
