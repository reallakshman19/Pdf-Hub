import { describe, expect, it } from 'vitest';

import type { ProfessionalCalloutModel, Rect } from './model';
import { estimateTextWidth, wrapTextMetric } from './typography';
import { buildVectorCalloutPlan } from './vectorCalloutPlan';

import type {
  LayoutDiagnostic,
  LayoutResultItem,
  Obstacle,
  OccurrenceInput,
} from './layoutTypes';
import { linesIntersect } from './layoutGeometry';
import { solvePageLayout } from './layoutEngine';

import {
  approveReviewItem,
  initReviewState,
  moveReviewItem,
  verifyCommitGate,
} from './reviewState';

import {
  computeLayoutHash,
  generateV3Marker,
  verifyWrittenPage,
  type VerificationReport,
} from './verificationCore';

import { buildReviewAuditManifest } from './auditManifestBinding';

const NORMAL_DIAGNOSTICS: LayoutDiagnostic[] = [];

function makeCallout(
  id: string,
  overrides: {
    psNo?: string;
    tag?: string;
    note?: string;
    confidence?: string;
    target?: { x: number; y: number };
    box?: Rect;
  } = {},
): ProfessionalCalloutModel {
  return buildVectorCalloutPlan(
    id,
    overrides.psNo ?? 'PS-11168.8',
    overrides.tag ?? 'Remove Guide',
    overrides.note ?? ':/PS-11168.8 Remove Guide',
    overrides.confidence ?? 'HIGH',
    overrides.target ?? { x: 100, y: 100 },
    overrides.box ?? { x: 160, y: 80, width: 180, height: 60 },
    {
      width: overrides.box?.width ?? 180,
      isReview: false,
    },
  );
}

function placedResult(
  callout: ProfessionalCalloutModel,
  diagnostics: LayoutDiagnostic[] = NORMAL_DIAGNOSTICS,
): LayoutResultItem {
  return {
    occurrenceId: callout.id,
    status: 'placed',
    placementClass: 'right',
    callout,
    diagnostics,
  } as any;
}

function visibleTextFor(callout: ProfessionalCalloutModel): string[] {
  return [
    `Tag: ${callout.tag}`,
    `ISO Note: ${callout.note}`,
  ];
}

describe('PR #148 — professional vector callout acceptance', () => {
  it('never emits a text line wider than the available width', () => {
    const token =
      'PS-11168.8/THIS_IS_A_SINGLE_UNBROKEN_ENGINEERING_IDENTIFIER_' +
      'WITH_A_VERY_LONG_SUFFIX_12345678901234567890';

    const maxWidth = 90;
    const fontSize = 9;
    const lines = wrapTextMetric(token, maxWidth, fontSize);

    expect(lines.length).toBeGreaterThan(1);

    for (const line of lines) {
      expect(
        estimateTextWidth(line, fontSize),
        `Overflowing line: "${line}"`,
      ).toBeLessThanOrEqual(maxWidth);
    }

    expect(lines.join('')).toBe(token);
  });

  it('renders a diagonal relationship using orthogonal vector segments', () => {
    const callout = makeCallout('orthogonal-leader', {
      target: { x: 80, y: 60 },
      box: { x: 220, y: 180, width: 160, height: 60 },
    });

    const leaderSegments = callout.primitives.filter(
      (primitive) => primitive.type === 'line',
    );

    // An elbow leader requires at least two segments.
    expect(leaderSegments.length).toBeGreaterThanOrEqual(2);

    for (const segment of leaderSegments) {
      if (segment.type !== 'line') {
        throw new Error('Unexpected non-line primitive.');
      }

      const isHorizontal = segment.start.y === segment.end.y;
      const isVertical = segment.start.x === segment.end.x;

      expect(
        isHorizontal || isVertical,
        `Diagonal leader segment detected: ${JSON.stringify(segment)}`,
      ).toBe(true);
    }
  });

  it('contains no raster or image primitive', () => {
    const callout = makeCallout('vector-only');

    for (const primitive of callout.primitives) {
      expect(['rectangle', 'line', 'circle', 'text']).toContain(
        primitive.type,
      );
    }
  });
});

describe('PR #149 — obstacle-aware layout acceptance', () => {
  it('detects collinear and endpoint-touching line intersections', () => {
    expect(
      linesIntersect(
        { x: 0, y: 10 },
        { x: 100, y: 10 },
        { x: 50, y: 10 },
        { x: 150, y: 10 },
      ),
    ).toBe(true);

    expect(
      linesIntersect(
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 80 },
      ),
    ).toBe(true);
  });

  it('uses real beam branching instead of committing the first greedy choice', () => {
    /*
     * Trap:
     *
     * - The first occurrence prefers its right-side candidate.
     * - That candidate blocks the only viable location for occurrence two.
     * - A lower-scoring top-left candidate for occurrence one allows both.
     *
     * A greedy implementation returns one unplaceable item.
     * A real beam search with width > 1 finds the zero-unplaceable solution.
     */

    const occurrences: OccurrenceInput[] = [
      {
        id: 'first',
        psNo: 'PS-100',
        tag: 'A',
        note: 'NOTE A',
        confidence: 'HIGH',
        targetPoint: { x: 155, y: 150 },
        pageNumber: 1,
        preferredWidth: 100,
      },
      {
        id: 'second',
        psNo: 'PS-200',
        tag: 'B',
        note: 'NOTE B',
        confidence: 'HIGH',
        targetPoint: { x: 350, y: 150 },
        pageNumber: 1,
        preferredWidth: 100,
      },
    ];

    const obstacles: Obstacle[] = [
      {
        id: 'block-second-top',
        type: 'hard',
        source: 'reserved-region',
        rect: { x: 285, y: 0, width: 150, height: 110 },
      },
      {
        id: 'block-second-bottom',
        type: 'hard',
        source: 'reserved-region',
        rect: { x: 285, y: 190, width: 150, height: 110 },
      },
      {
        id: 'block-second-left-margin',
        type: 'hard',
        source: 'reserved-region',
        rect: { x: 20, y: 120, width: 60, height: 60 },
      },
      {
        id: 'block-second-right-margin',
        type: 'hard',
        source: 'reserved-region',
        rect: { x: 380, y: 120, width: 80, height: 60 },
      },
    ];

    const result = solvePageLayout(occurrences, {
      pageWidth: 460,
      pageHeight: 300,
      pageMargin: 20,
      obstacles,
      beamWidth: 8,
    });

    expect(
      result.unplaceableCount,
      JSON.stringify(result.results, null, 2),
    ).toBe(0);

    expect(result.results).toHaveLength(2);
    expect(result.results.every((item) => item.status === 'placed')).toBe(
      true,
    );
  });

  it('marks soft-overlap placements as review-required', () => {
    const occurrence: OccurrenceInput = {
      id: 'soft-overlap',
      psNo: 'PS-300',
      tag: 'Guide',
      note: 'REST, GUIDE',
      confidence: 'HIGH',
      targetPoint: { x: 300, y: 300 },
      pageNumber: 1,
      preferredWidth: 150,
    };

    const result = solvePageLayout([occurrence], {
      pageWidth: 600,
      pageHeight: 600,
      pageMargin: 20,
      beamWidth: 4,
      obstacles: [
        {
          id: 'dense-page',
          type: 'soft',
          source: 'drawing-density',
          rect: { x: 0, y: 0, width: 600, height: 600 },
          weight: 25,
        },
      ],
    });

    const item = result.results[0];

    expect(item.status).toBe('placed');
    expect(item.diagnostics.length).toBeGreaterThan(0);
    expect((item as any).callout?.style.isReview).toBe(true);
  });

  it('never returns overlapping accepted callout rectangles', () => {
    const occurrences: OccurrenceInput[] = [
      {
        id: 'near-1',
        psNo: 'PS-401',
        tag: 'Guide',
        note: 'NOTE 1',
        confidence: 'HIGH',
        targetPoint: { x: 260, y: 260 },
        pageNumber: 1,
        preferredWidth: 130,
      },
      {
        id: 'near-2',
        psNo: 'PS-402',
        tag: 'Guide',
        note: 'NOTE 2',
        confidence: 'HIGH',
        targetPoint: { x: 270, y: 270 },
        pageNumber: 1,
        preferredWidth: 130,
      },
    ];

    const result = solvePageLayout(occurrences, {
      pageWidth: 700,
      pageHeight: 700,
      pageMargin: 20,
      beamWidth: 12,
    });

    const boxes = result.results
      .map((item) => (item as any).callout?.box)
      .filter((box): box is Rect => box !== undefined);

    expect(boxes).toHaveLength(2);

    const [a, b] = boxes;
    const overlap =
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y;

    expect(overlap).toBe(false);
  });
});

describe('PR #150 — review workflow acceptance', () => {
  it('does not auto-approve a placement carrying review diagnostics', () => {
    const callout = makeCallout('review-required');

    const state = initReviewState(1, [
      placedResult(callout, [
        {
          type: 'text-overlap',
          source: 'existing-text',
          message: 'Callout overlaps existing drawing text.',
          penalty: 35,
        },
      ]),
    ]);

    const item = state.items.get(callout.id);

    expect(item?.isApproved).toBe(false);
    expect(item?.callout?.style.isReview).toBe(true);
  });

  it('does not fabricate identity for an unplaceable result', () => {
    const state = initReviewState(1, [
      {
        occurrenceId: 'missing-metadata',
        status: 'unplaceable',
        occurrence: {} as any,
        diagnostics: [
          {
            type: 'hard-collision',
            source: 'layout-solver',
            message: 'No candidate passed validation.',
            penalty: 1000,
          },
        ],
      },
    ]);

    const item = state.items.get('missing-metadata');

    expect(item).toBeDefined();
    expect(item?.psNo).not.toMatch(/^Occurrence-/);
    expect(item?.tag).not.toBe('Support');
    expect(item?.targetPoint).not.toEqual({ x: 0, y: 0 });
  });

  it('rejects invalid manual geometry before commit approval', () => {
    const callout = makeCallout('invalid-manual-placement');
    let state = initReviewState(1, [placedResult(callout)]);
    let safelyRejected = false;

    try {
      state = moveReviewItem(state, callout.id, {
        x: -50,
        y: 20,
        width: 0,
        height: 40,
      });

      state = approveReviewItem(state, callout.id);

      // Approval may return a state, but the gate must still reject it.
      safelyRejected = !verifyCommitGate(state).allowed;
    } catch {
      // Rejecting during move or approve is also acceptable.
      safelyRejected = true;
    }

    expect(safelyRejected).toBe(true);
  });

  it('requires approval again after every manual movement', () => {
    const callout = makeCallout('move-reapproval');
    let state = initReviewState(1, [placedResult(callout)]);

    state = moveReviewItem(state, callout.id, {
      x: 260,
      y: 180,
      width: 180,
      height: 60,
    });

    const item = state.items.get(callout.id);

    expect(item?.isApproved).toBe(false);
    expect(item?.callout?.style.isReview).toBe(true);
    expect(verifyCommitGate(state).allowed).toBe(false);
  });
});

describe('PR #151 — verification and manifest acceptance', () => {
  it('uses a collision-resistant SHA-256 layout identity', () => {
    const callout = makeCallout('sha-layout');
    const hash = computeLayoutHash(callout);

    expect(hash).toMatch(/^sha256:[a-f0-9]{64}$/i);
  });

  it('rejects markers carrying the wrong mapping identity', () => {
    const callout = makeCallout('mapping-integrity');

    const expectedMapping =
      `sha256:${'a'.repeat(64)}`;

    const wrongMapping =
      `sha256:${'b'.repeat(64)}`;

    const wrongMarker = generateV3Marker(callout, wrongMapping);

    const report = verifyWrittenPage(
      [callout],
      [wrongMarker],
      visibleTextFor(callout),
      expectedMapping,
    );

    expect(report.passed).toBe(false);
    expect(report.mismatchErrors.length).toBeGreaterThan(0);
  });

  it('rejects markers carrying the wrong style version', () => {
    const callout = makeCallout('style-integrity');
    const mappingHash = `sha256:${'c'.repeat(64)}`;

    const validMarker = generateV3Marker(callout, mappingHash);
    const wrongStyleMarker = validMarker.replace('|v1]', '|v999]');

    const report = verifyWrittenPage(
      [callout],
      [wrongStyleMarker],
      visibleTextFor(callout),
      mappingHash,
    );

    expect(report.passed).toBe(false);
    expect(report.mismatchErrors.length).toBeGreaterThan(0);
  });

  it('rejects placeholder or malformed mapping hashes', () => {
    const callout = makeCallout('mapping-format');

    expect(() => generateV3Marker(callout, 'e0000000')).toThrow();
    expect(() => generateV3Marker(callout, 'not-a-hash')).toThrow();
  });

  it('does not trust a caller-supplied passed verification flag', () => {
    const callout = makeCallout('forged-report');
    const state = initReviewState(1, [placedResult(callout)]);

    const internallyInconsistentReport: VerificationReport = {
      passed: true,
      verifiedCount: 0,
      missingMarkerErrors: [],
      duplicateErrors: [],
      mismatchErrors: [],
      missingTextErrors: [],
    };

    expect(() =>
      buildReviewAuditManifest(
        state,
        [callout],
        internallyInconsistentReport,
        `sha256:${'d'.repeat(64)}`,
        1_722_000_000_000,
      ),
    ).toThrow();
  });

  it('rejects a committed callout set that differs from review state', () => {
    const approved = makeCallout('approved-occurrence', {
      psNo: 'PS-500',
      note: 'APPROVED NOTE',
    });

    const substituted = makeCallout('substituted-occurrence', {
      psNo: 'PS-999',
      note: 'SUBSTITUTED NOTE',
      box: { x: 400, y: 400, width: 180, height: 60 },
    });

    const state = initReviewState(1, [placedResult(approved)]);

    const forgedSuccessfulReport: VerificationReport = {
      passed: true,
      verifiedCount: 1,
      missingMarkerErrors: [],
      duplicateErrors: [],
      mismatchErrors: [],
      missingTextErrors: [],
    };

    expect(() =>
      buildReviewAuditManifest(
        state,
        [substituted],
        forgedSuccessfulReport,
        `sha256:${'e'.repeat(64)}`,
        1_722_000_000_000,
      ),
    ).toThrow();
  });
});
