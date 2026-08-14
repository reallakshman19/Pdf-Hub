import { describe, expect, it } from 'vitest';
import { canonicalHash, canonicalJson } from './canonical';
import { DocumentEvidenceContractError, parseTableExtraction } from './guards';
import type { JsonValue } from './types';

const H = `sha256:${'a'.repeat(64)}` as const;
const B = `sha256:${'b'.repeat(64)}` as const;

function extraction(): Record<string, unknown> {
  return {
    schema: 'DocumentEvidenceTableExtraction.v1',
    sourceHash: H,
    source: {
      schema: 'SourceIdentity.v1', sourceId: 'source:a', sha256: H,
      mediaType: 'application/pdf', sizeBytes: 10, logicalPath: 'fixture.pdf',
    },
    pages: [1],
    tables: [{
      candidate: { candidateId: 'c1', page: 1, strategy: 'ruled', bbox: [0, 0, 10, 10], rowCount: 1, columnCount: 1 },
      observations: [{
        schema: 'Observation.v1', observationId: 'o1', observationHash: B,
        kind: 'native-text', sourceHash: H, surfaceId: 's1', surfaceHash: B,
        provider: 'fixture', providerVersion: '1', rawText: '10', normalizedText: '10',
        documentGeometry: { type: 'Quad', coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] },
      }],
      tablePass: {
        schema: 'TablePass.v1', tablePassId: 'p1', tablePassHash: B,
        tableCandidateId: 'c1', passId: 'native:ruled', sourceHash: H,
        surfaceId: 's1', surfaceHash: B,
        cells: [{ cellId: 'cell1', rowIndex: 0, columnIndex: 0,
          geometry: { type: 'Quad', coordinates: [[0, 0], [10, 0], [10, 10], [0, 10]] },
          observationHashes: [B] }],
      },
      cellDecisions: [{
        schema: 'EvidenceDecision.v1', decisionId: 'd1', decisionHash: B,
        state: 'accepted', observationHashes: [B], selectedObservationHash: B,
        effectiveText: '10', diagnosticCodes: [],
      }],
    }],
    diagnostics: [],
    options: { ocr: 'never', ocrLanguage: 'eng' },
  };
}

describe('DocumentEvidence v1 conformance', () => {
  it('matches RFC 8785 number and string canonicalization', () => {
    const value: JsonValue = {
      numbers: [333333333.33333329, 1e30, 4.50, 2e-3, 1e-27],
      string: "€$\u000f\nA'B\"\\\"/",
      literals: [null, true, false],
    };
    expect(canonicalJson(value)).toBe('{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":"€$\\u000f\\nA\'B\\\"\\\\\\\"/"}');
    expect(canonicalJson([1e-6, 1e-7, 1e20, 1e21, -0])).toBe('[0.000001,1e-7,100000000000000000000,1e+21,0]');
  });

  it('matches RFC 8785 large IEEE-754 integer vectors', () => {
    expect(canonicalJson(9_007_199_254_740_992)).toBe('9007199254740992');
    expect(canonicalJson(295_147_905_179_352_830_000)).toBe('295147905179352830000');
  });

  it('uses UTF-16 ordering and schema-domain hashing', async () => {
    expect(canonicalJson({ '\ue000': 2, '😀': 1 })).toBe('{"😀":1,"":2}');
    await expect(canonicalHash({ schema: 'Example.v1', value: 1 })).resolves.toBe(
      'sha256:4f50bb99646b461857e57838973a0636a3c8a947e0769dec1c826885a92b53f8',
    );
  });

  it('rejects non-finite numbers and lone surrogates', () => {
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow('JCS_NUMBER_NONFINITE');
    expect(() => canonicalJson('\ud800')).toThrow('JCS_LONE_SURROGATE');
  });

  it('keeps accepted evidence extraction-only', () => {
    const parsed = parseTableExtraction(extraction(), { sourceHash: H, pages: [1] });
    expect(parsed.tables[0].cellDecisions[0].state).toBe('accepted');
    expect(parsed.tables[0].cellDecisions[0].effectiveText).toBe('10');
    expect('engineeringAuthority' in parsed).toBe(false);
  });

  it('fails closed on authority leakage or invalid decisions', () => {
    const leaked = { ...extraction(), engineeringAuthority: 'SCREENING' };
    expect(() => parseTableExtraction(leaked)).toThrowError(DocumentEvidenceContractError);
    const invalid = extraction();
    const table = (invalid.tables as Record<string, unknown>[])[0];
    const decisions = table.cellDecisions as Record<string, unknown>[];
    delete decisions[0].selectedObservationHash;
    expect(() => parseTableExtraction(invalid)).toThrowError(/selectedObservationHash/);
  });
});
