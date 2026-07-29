import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MacroExecutionContext } from '../types';
import type { MacroMutableState } from '../registry';
import { macroRegistry } from '../registry';
import { buildVectorCalloutPlan } from '../psIsonote/professional/vectorCalloutPlan';

const mocks = vi.hoisted(() => ({
  drawProfessionalCallout: vi.fn(),
  verifyProfessionalCalloutOutput: vi.fn(),
  addAnnotation: vi.fn(),
}));

vi.mock('../../../adapters/pdf-edit/PdfEditAdapter', () => ({
  PdfEditAdapter: {
    drawProfessionalCallout: mocks.drawProfessionalCallout,
  },
}));

vi.mock('../../annotation-verification/output-verifier', () => ({
  verifyProfessionalCalloutOutput: mocks.verifyProfessionalCalloutOutput,
}));

vi.mock('../../annotations/store', () => ({
  useAnnotationStore: {
    getState: () => ({
      addAnnotation: mocks.addAnnotation,
    }),
  },
}));

import './content-ops';
import './professional-callout-commit-ops';

function context(): MacroExecutionContext {
  return {
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 1,
    selectedPages: [1],
    currentPage: 1,
    fileName: 'single-authority.pdf',
    options: {
      abortOnError: true,
    },
  };
}

function mutableState(): MacroMutableState {
  return {
    workingBytes: new Uint8Array([1, 2, 3]),
    pageCount: 1,
    selectedPages: [1],
    templateVars: {},
    logs: [],
    outputFiles: [],
  };
}

function callout() {
  return buildVectorCalloutPlan(
    'occ-ps-11166-8',
    'PS-11166.8',
    'Tag No. 8, R',
    ':/PS-11166.8 REST',
    'HIGH',
    { x: 140, y: 320 },
    { x: 300, y: 240, width: 220 },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.drawProfessionalCallout.mockResolvedValue(new Uint8Array([9, 9, 9]));
  mocks.verifyProfessionalCalloutOutput.mockResolvedValue({
    passed: true,
    verifiedCount: 1,
    missingMarkerErrors: [],
    duplicateErrors: [],
    mismatchErrors: [],
    missingTextErrors: [],
  });
});

describe('committed professional callout authority', () => {
  it('writes the vector callout once without creating an editable annotation overlay', async () => {
    const result = await macroRegistry.execute(
      {
        op: 'place_professional_callout',
        selector: { mode: 'current' },
        callout: callout(),
      },
      context(),
      mutableState(),
    );

    expect(result.status).toBe('success');
    expect(mocks.drawProfessionalCallout).toHaveBeenCalledTimes(1);
    expect(mocks.drawProfessionalCallout).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      expect.objectContaining({
        pages: [0],
        callout: expect.objectContaining({ id: 'occ-ps-11166-8' }),
      }),
    );
    expect(mocks.addAnnotation).not.toHaveBeenCalled();
    expect(result.sideEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'bytes_updated',
          bytes: new Uint8Array([9, 9, 9]),
        }),
      ]),
    );
  });

  it('preserves candidate PDF bytes when immediate verification returns a warning', async () => {
    mocks.verifyProfessionalCalloutOutput.mockResolvedValueOnce({
      passed: false,
      verifiedCount: 0,
      missingMarkerErrors: [],
      duplicateErrors: [],
      mismatchErrors: [],
      missingTextErrors: ['visible text not found'],
    });

    const result = await macroRegistry.execute(
      {
        op: 'place_professional_callout',
        selector: { mode: 'current' },
        callout: callout(),
      },
      context(),
      mutableState(),
    );

    expect(result.status).toBe('warning');
    expect(mocks.addAnnotation).not.toHaveBeenCalled();
    expect(result.sideEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'bytes_updated',
          bytes: new Uint8Array([9, 9, 9]),
        }),
      ]),
    );
  });
});
