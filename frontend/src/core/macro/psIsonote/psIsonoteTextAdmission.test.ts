import { describe, expect, it, vi } from 'vitest';
import {
  admitPsIsonoteTextCandidateForTest,
  admitPsIsonoteTextFileForTest,
  PsIsonoteTextAdmissionError,
  type PsIsonoteTextAdmissionDependencies,
} from './psIsonoteTextAdmission';
import { createPsIsonoteTextAdmissionPolicyForTest } from './psIsonoteTextAdmissionPolicy';
import type { PsIsonoteParseResult } from './psIsonoteTable';

const VALID_CSV = 'PS No.,ISONOTE\nPS-1000.1,GUIDE';

function policy(overrides: Parameters<typeof createPsIsonoteTextAdmissionPolicyForTest>[0] = {}) {
  return createPsIsonoteTextAdmissionPolicyForTest(overrides);
}

function parsedFixture(mappingCount = 1, warningCount = 0): PsIsonoteParseResult {
  return {
    delimiter: ',',
    psColumn: 'PS No.',
    isonoteColumn: 'ISONOTE',
    mappings: Array.from({ length: mappingCount }, (_, index) => ({
      psNo: `PS-${1000 + index}.1`,
      isonote: 'GUIDE',
      sourceRow: index + 2,
    })),
    warnings: Array.from({ length: warningCount }, (_, index) => `warning-${index + 1}`),
  };
}

function fakeFile(options: {
  readonly name?: string;
  readonly type?: string;
  readonly size: number;
  readonly bytes: Uint8Array;
}) {
  const arrayBuffer = vi.fn(async () => options.bytes.buffer.slice(
    options.bytes.byteOffset,
    options.bytes.byteOffset + options.bytes.byteLength,
  ));
  const text = vi.fn(async () => 'must-not-be-used');
  return {
    file: {
      name: options.name ?? 'mapping.csv',
      type: options.type ?? 'text/csv',
      size: options.size,
      arrayBuffer,
      text,
    } as unknown as File,
    arrayBuffer,
    text,
  };
}

async function expectFileRejection(
  promise: Promise<unknown>,
  outcome: PsIsonoteTextAdmissionError['outcome'],
): Promise<PsIsonoteTextAdmissionError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PsIsonoteTextAdmissionError);
    const admissionError = error as PsIsonoteTextAdmissionError;
    expect(admissionError.outcome).toBe(outcome);
    return admissionError;
  }
  throw new Error(`Expected ${outcome}.`);
}

describe('PS ISONOTE structured-text admission', () => {
  it.each([
    ['below', 'abc', 4, true],
    ['exact', 'abcd', 4, true],
    ['over', 'abcde', 4, false],
  ] as const)('enforces paste source bytes %s the limit', (_label, sourceText, limit, admitted) => {
    const operation = () => admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText },
      policy({ maxSourceUtf8Bytes: limit }),
    );
    if (admitted) {
      expect(operation().evidence.sourceUtf8Bytes).toBe(sourceText.length);
    } else {
      expect(operation).toThrowError(expect.objectContaining({
        outcome: 'REJECTED_SOURCE_BYTES',
      }));
    }
  });

  it('measures multibyte and supplementary text as exact UTF-8 bytes', () => {
    const multibyte = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText: 'é' },
      policy({ maxSourceUtf8Bytes: 2 }),
    );
    expect(multibyte.evidence.sourceUtf8Bytes).toBe(2);

    const supplementary = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText: '😀' },
      policy({ maxSourceUtf8Bytes: 4 }),
    );
    expect(supplementary.evidence.sourceUtf8Bytes).toBe(4);
    expect(supplementary.evidence.decodedCodeUnits).toBe(2);
  });

  it('admits a leading BOM without removing it from source-byte accounting', () => {
    const admitted = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText: `\uFEFF${VALID_CSV}` },
      policy(),
    );
    expect(admitted.evidence.hadUtf8Bom).toBe(true);
    expect(admitted.evidence.sourceUtf8Bytes).toBe(new TextEncoder().encode(`\uFEFF${VALID_CSV}`).length);
    expect(admitted.parsedResult?.mappings).toHaveLength(1);
  });

  it('rejects file metadata before reading bytes and never calls File.text()', async () => {
    const fixture = fakeFile({ size: 5, bytes: new Uint8Array([1, 2, 3, 4, 5]) });
    const error = await expectFileRejection(
      admitPsIsonoteTextFileForTest(
        fixture.file,
        policy({ maxSourceUtf8Bytes: 4 }),
      ),
      'REJECTED_SOURCE_BYTES',
    );
    expect(error.evidence.sourceUtf8Bytes).toBe(5);
    expect(fixture.arrayBuffer).not.toHaveBeenCalled();
    expect(fixture.text).not.toHaveBeenCalled();
  });

  it('verifies actual byte length after one accepted metadata read', async () => {
    const fixture = fakeFile({ size: 4, bytes: new Uint8Array([1, 2, 3, 4, 5]) });
    await expectFileRejection(
      admitPsIsonoteTextFileForTest(
        fixture.file,
        policy({ maxSourceUtf8Bytes: 4 }),
      ),
      'REJECTED_SOURCE_BYTES',
    );
    expect(fixture.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(fixture.text).not.toHaveBeenCalled();
  });

  it('reads and fatally decodes an accepted file exactly once', async () => {
    const bytes = new TextEncoder().encode(VALID_CSV);
    const fixture = fakeFile({ size: bytes.length, bytes });
    const decodeUtf8 = vi.fn((value: Uint8Array) =>
      new TextDecoder('utf-8', { fatal: true }).decode(value));
    const admitted = await admitPsIsonoteTextFileForTest(
      fixture.file,
      policy(),
      { decodeUtf8 },
    );
    expect(fixture.arrayBuffer).toHaveBeenCalledTimes(1);
    expect(decodeUtf8).toHaveBeenCalledTimes(1);
    expect(fixture.text).not.toHaveBeenCalled();
    expect(admitted.parsedResult?.mappings[0]?.psNo).toBe('PS-1000.1');
  });

  it.each([
    ['ASCII', new TextEncoder().encode(VALID_CSV), true],
    ['multibyte', new TextEncoder().encode(`${VALID_CSV} café`), true],
    ['supplementary', new TextEncoder().encode(`${VALID_CSV} 😀`), true],
    ['BOM', Uint8Array.from([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(VALID_CSV)]), true],
    ['bad continuation', Uint8Array.from([0x50, 0x53, 0x2c, 0x80]), false],
    ['truncated sequence', Uint8Array.from([0x50, 0x53, 0xe2, 0x82]), false],
    ['overlong encoding', Uint8Array.from([0xc0, 0xaf]), false],
    ['UTF-16LE', Uint8Array.from([0xff, 0xfe, 0x50, 0x00]), false],
  ] as const)('performs fatal UTF-8 file admission for %s', async (_label, bytes, admitted) => {
    const fixture = fakeFile({ size: bytes.length, bytes });
    if (admitted) {
      const result = await admitPsIsonoteTextFileForTest(fixture.file, policy());
      expect(result.evidence.admissionOutcome).toBe('ADMITTED');
    } else {
      await expectFileRejection(
        admitPsIsonoteTextFileForTest(fixture.file, policy()),
        'REJECTED_UTF8',
      );
    }
  });

  it('preserves extension-or-MIME compatibility while rejecting unrelated files', async () => {
    const bytes = new TextEncoder().encode(VALID_CSV);

    const extensionOnly = fakeFile({
      name: 'mapping.csv',
      type: 'application/octet-stream',
      size: bytes.length,
      bytes,
    });
    expect((await admitPsIsonoteTextFileForTest(extensionOnly.file, policy())).parsedResult?.mappings)
      .toHaveLength(1);

    const mimeOnly = fakeFile({
      name: 'mapping.data',
      type: 'text/csv',
      size: bytes.length,
      bytes,
    });
    expect((await admitPsIsonoteTextFileForTest(mimeOnly.file, policy())).parsedResult?.mappings)
      .toHaveLength(1);

    const unrelated = fakeFile({
      name: 'mapping.json',
      type: 'application/json',
      size: bytes.length,
      bytes,
    });
    await expectFileRejection(
      admitPsIsonoteTextFileForTest(unrelated.file, policy()),
      'REJECTED_SOURCE_TYPE',
    );
    expect(unrelated.arrayBuffer).not.toHaveBeenCalled();
  });

  it('counts logical rows across LF, CRLF, quoted delimiters, and quoted newlines', () => {
    const sourceText = [
      'PS No.,ISONOTE',
      'PS-1000.1,"GUIDE, REST"',
      'PS-1001.1,"LINE 1\nLINE 2"',
      'PS-1002.1,"A ""quoted"" note"',
    ].join('\r\n');
    const admitted = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText },
      policy(),
    );
    expect(admitted.evidence.logicalRowCount).toBe(4);
    expect(admitted.evidence.maximumObservedColumns).toBe(2);
    expect(admitted.parsedResult?.mappings).toHaveLength(3);
  });

  it('counts leading and trailing pipe cells and Markdown separator rows structurally', () => {
    const sourceText = [
      '| Support Number | Support ISONOTE |',
      '| --- | --- |',
      '| PS-1000.1 | GUIDE |',
    ].join('\n');
    const admitted = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'SAMPLE', sourceName: 'pipe.txt', sourceText },
      policy(),
    );
    expect(admitted.evidence.inputKind).toBe('SAMPLE');
    expect(admitted.evidence.logicalRowCount).toBe(3);
    expect(admitted.evidence.maximumObservedColumns).toBe(4);
    expect(admitted.parsedResult?.mappings).toHaveLength(1);
  });

  it.each([
    ['rows', { maxLogicalRows: 2 }, 'a,b\nc,d\ne,f', 'REJECTED_ROW_COUNT'],
    ['columns', { maxColumnsPerRow: 2 }, 'a,b,c', 'REJECTED_COLUMN_COUNT'],
    ['cell bytes', { maxCellUtf8Bytes: 3 }, 'a,éé', 'REJECTED_CELL_BYTES'],
  ] as const)('rejects structural %s before semantic parsing', (_label, limits, sourceText, outcome) => {
    const parseTable = vi.fn(() => parsedFixture());
    expect(() => admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText },
      policy(limits),
      { parseTable },
    )).toThrowError(expect.objectContaining({ outcome }));
    expect(parseTable).not.toHaveBeenCalled();
  });

  it.each([
    ['below', 1, 2, true],
    ['exact', 2, 2, true],
    ['over', 3, 2, false],
  ] as const)('enforces mapping count %s the limit', (_label, count, limit, admitted) => {
    const dependencies: Partial<PsIsonoteTextAdmissionDependencies> = {
      parseTable: vi.fn(() => parsedFixture(count)),
    };
    const operation = () => admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText: VALID_CSV },
      policy({ maxUniqueMappings: limit }),
      dependencies,
    );
    if (admitted) {
      expect(operation().evidence.uniqueMappingCount).toBe(count);
    } else {
      expect(operation).toThrowError(expect.objectContaining({
        outcome: 'REJECTED_MAPPING_COUNT',
      }));
    }
  });

  it.each([
    [199, 199, false],
    [200, 200, false],
    [201, 200, true],
  ] as const)('retains deterministic warning evidence for %s total warnings', (total, retained, truncated) => {
    const admitted = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText: VALID_CSV },
      policy({ maxRetainedWarnings: 200 }),
      { parseTable: () => parsedFixture(1, total) },
    );
    expect(admitted.evidence.totalWarningCount).toBe(total);
    expect(admitted.evidence.retainedWarningCount).toBe(retained);
    expect(admitted.parsedResult?.warnings).toHaveLength(retained);
    if (truncated) {
      expect(admitted.parsedResult?.warnings.at(-1)).toBe(
        '2 warning(s) suppressed by PS/ISONOTE admission policy.',
      );
      expect(admitted.parsedResult?.warnings[0]).toBe('warning-1');
      expect(admitted.parsedResult?.warnings[198]).toBe('warning-199');
    }
  });

  it('preserves safe semantic parser errors for incremental typed input', () => {
    const admitted = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceText: 'P' },
      policy(),
    );
    expect(admitted.sourceText).toBe('P');
    expect(admitted.parsedResult).toBeNull();
    expect(admitted.parseError).toContain('Could not identify');
    expect(admitted.evidence.admissionOutcome).toBe('ADMITTED');
    expect(admitted.evidence.diagnostics[0]?.code).toBe('SEMANTIC_PARSE_ERROR');
  });

  it('produces deeply immutable metadata-only evidence', () => {
    const admitted = admitPsIsonoteTextCandidateForTest(
      { inputKind: 'PASTE', sourceName: 'mapping.csv', sourceText: VALID_CSV },
      policy(),
    );
    const { evidence } = admitted;
    expect(Object.isFrozen(evidence)).toBe(true);
    expect(Object.isFrozen(evidence.limits)).toBe(true);
    expect(Object.isFrozen(evidence.diagnostics)).toBe(true);
    expect(Object.keys(evidence)).not.toEqual(expect.arrayContaining([
      'sourceText',
      'bytes',
      'mappings',
      'parsedRows',
      'recipe',
      'pdfBytes',
    ]));
    expect(JSON.stringify(evidence)).not.toContain('PS-1000.1');
  });
});
