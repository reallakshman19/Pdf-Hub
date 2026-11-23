import { describe, expect, it } from 'vitest';
import { parsePageContentStreams } from '../parser';
import {
  serializeContentStreamAST,
  serializeOperation,
} from '../serializer';
import { bytesToLatin1 } from '../lexer';
import type { DecodedPageContentStreamInput, PdfContentOperation } from '../types';

function makeStream(content: string): DecodedPageContentStreamInput {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    bytes[i] = content.charCodeAt(i) & 0xff;
  }
  return {
    streamIndex: 0,
    streamRef: '5 0 R',
    decodedBytes: bytes,
  };
}

describe('PDF Content Stream Serializer', () => {
  it('serializes simple text operations accurately', () => {
    const op: PdfContentOperation = {
      type: 'operation',
      id: 'op1',
      operator: 'Tf',
      operands: [
        { kind: 'name', name: 'F1', raw: '/F1' },
        { kind: 'number', value: 12, raw: '12' },
      ],
      streamIndex: 0,
    };

    expect(serializeOperation(op)).toBe('/F1 12 Tf');
  });

  it('escapes special characters in literal string serialization', () => {
    const text = 'Hello (World) \n \r \t \\';
    const bytes = new Uint8Array(Array.from(text).map((c) => c.charCodeAt(0)));
    const op: PdfContentOperation = {
      type: 'operation',
      id: 'op2',
      operator: 'Tj',
      operands: [
        {
          kind: 'literal-string',
          bytes,
          raw: `(${text})`,
        },
      ],
      streamIndex: 0,
    };

    const serialized = serializeOperation(op);
    expect(serialized).toBe('(Hello \\(World\\) \\n \\r \\t \\\\) Tj');
  });

  it('serializes hex strings in uppercase uppercase format', () => {
    const hex = '48656C6C6F';
    const bytes = new Uint8Array([0x48, 0x65, 0x6c, 0x6c, 0x6f]);
    const op: PdfContentOperation = {
      type: 'operation',
      id: 'op3',
      operator: 'Tj',
      operands: [
        {
          kind: 'hex-string',
          hex,
          bytes,
          raw: `<${hex}>`,
        },
      ],
      streamIndex: 0,
    };

    expect(serializeOperation(op)).toBe('<48656C6C6F> Tj');
  });

  it('serializes TJ kerning arrays', () => {
    const op: PdfContentOperation = {
      type: 'operation',
      id: 'op4',
      operator: 'TJ',
      operands: [
        {
          kind: 'array',
          items: [
            {
              kind: 'literal-string',
              bytes: new Uint8Array([0x41]),
              raw: '(A)',
            },
            {
              kind: 'number',
              value: -15.5,
              raw: '-15.5',
            },
            {
              kind: 'literal-string',
              bytes: new Uint8Array([0x42]),
              raw: '(B)',
            },
          ],
        },
      ],
      streamIndex: 0,
    };

    expect(serializeOperation(op)).toBe('[(A) -15.5 (B)] TJ');
  });

  it('normalizes unclosed q and BT blocks when normalize: true', () => {
    const source = 'q 1 0 0 1 0 0 cm BT /F1 12 Tf (Unclosed) Tj';
    const ast = parsePageContentStreams([makeStream(source)]);

    const normalizedBytes = serializeContentStreamAST(ast, { normalize: true });
    const normalizedStr = bytesToLatin1(normalizedBytes);

    // Verifies that ET and Q were automatically appended to balance the stream
    expect(normalizedStr).toContain('ET');
    expect(normalizedStr).toContain('Q');

    // Re-parsing the normalized stream must result in zero unclosed blocks
    const reParsed = parsePageContentStreams([makeStream(normalizedStr)]);
    expect(reParsed.complete).toBe(true);
    const unclosedDiag = reParsed.diagnostics.find(
      (d) => d.code === 'PAGE_BOUNDARY_UNCLOSED_Q' || d.code === 'UNTERMINATED_TEXT_OBJECT',
    );
    expect(unclosedDiag).toBeUndefined();
  });
});
