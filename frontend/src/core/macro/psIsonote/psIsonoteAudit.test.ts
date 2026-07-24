import { describe, expect, it } from 'vitest';
import {
  buildPsIsonoteAuditReport,
  scorePsIsonoteReference,
  serializePsIsonoteSummaryCsv,
} from './psIsonoteAudit';
import type { PsIsonoteScanResult, PsIsonoteTextReference } from './psIsonoteRecipe';
import type { PsIsonoteMapping } from './psIsonoteTable';

const guideMapping: PsIsonoteMapping = {
  psNo: 'PS-1234.5',
  family: 'Guide',
  isonote: 'REST(6kN), GUIDE [Gap=10mm] (8kN)',
  sourceRow: 2,
};

const restMapping: PsIsonoteMapping = {
  psNo: 'PS-5678.1',
  family: 'Rest',
  isonote: 'REST (12kN)',
  sourceRow: 3,
};

function reference(
  mapping: PsIsonoteMapping,
  overrides: Partial<PsIsonoteTextReference> = {},
): PsIsonoteTextReference {
  return {
    psNo: mapping.psNo,
    pageNumber: 1,
    rect: { x: 100, y: 200, width: 60, height: 10 },
    mapping,
    rawMatchedText: mapping.psNo,
    matchMethod: 'exact',
    textItemCount: 1,
    ...overrides,
  };
}

function scan(references: PsIsonoteTextReference[]): PsIsonoteScanResult {
  return {
    references,
    detectedReferences: references,
    missingPsNumbers: [restMapping.psNo],
    skippedExisting: [],
    scannedPages: [1],
    pageDimensions: { 1: { width: 595, height: 842 } },
  };
}

describe('psIsonoteAudit', () => {
  it('scores exact matches above joined text-item matches', () => {
    const exact = reference(guideMapping);
    const joined = reference(guideMapping, {
      rawMatchedText: 'PS - 1234 .5',
      matchMethod: 'joined-text-items',
      textItemCount: 4,
    });

    expect(scorePsIsonoteReference(exact).matchConfidence).toBe(100);
    expect(scorePsIsonoteReference(joined).matchConfidence).toBeLessThan(90);
  });

  it('builds one summary row per PS number', () => {
    const report = buildPsIsonoteAuditReport(
      [guideMapping, restMapping],
      scan([reference(guideMapping)]),
      { phase: 'annotated', createdAt: '2026-07-24T00:00:00.000Z' },
    );

    expect(report.summaryRows).toEqual([
      {
        psNo: 'PS-1234.5',
        family: 'Guide',
        mappings: 1,
        foundPs: 1,
        occurrences: 1,
        annotated: 1,
        review: 0,
        missing: 0,
        averageConfidence: 100,
        minimumConfidence: 100,
        errors: 0,
      },
      {
        psNo: 'PS-5678.1',
        family: 'Rest',
        mappings: 1,
        foundPs: 0,
        occurrences: 0,
        annotated: 0,
        review: 0,
        missing: 1,
        averageConfidence: null,
        minimumConfidence: null,
        errors: 0,
      },
    ]);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: 'PS_ISONOTE_NOT_FOUND',
        psNo: 'PS-5678.1',
      }),
    ]));
  });

  it('marks joined matches for review and records conflicts as errors', () => {
    const joined = reference(guideMapping, {
      rawMatchedText: 'PS - 1234 .5',
      matchMethod: 'joined-text-items',
      textItemCount: 4,
    });
    const report = buildPsIsonoteAuditReport(
      [guideMapping],
      {
        ...scan([joined]),
        missingPsNumbers: [],
      },
      {
        parseWarnings: [
          'Row 8: conflicting ISONOTE for PS-1234.5; kept row 2.',
        ],
      },
    );

    expect(report.summaryRows[0]).toMatchObject({
      psNo: 'PS-1234.5',
      review: 1,
      errors: 1,
    });
    expect(report.occurrences[0].status).toBe('review');
  });

  it('serializes the requested PS-wise CSV columns', () => {
    const report = buildPsIsonoteAuditReport(
      [guideMapping, restMapping],
      scan([reference(guideMapping)]),
    );
    const csv = serializePsIsonoteSummaryCsv(report);

    expect(csv.split('\n')[0]).toBe(
      'PS No.,Family,Mappings,Found PS,Occurrences,Annotated,Review,Missing,Average Confidence,Minimum Confidence,Errors',
    );
    expect(csv).toContain('PS-1234.5,Guide,1,1,1,0,0,0,100,100,0');
    expect(csv).toContain('PS-5678.1,Rest,1,0,0,0,0,1,,,0');
  });
});
