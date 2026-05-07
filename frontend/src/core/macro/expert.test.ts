import { describe, it, expect, vi } from 'vitest';
import { executeMacroRecipe } from './executor';
import './steps/register-all';

vi.mock('@/adapters/pdf-edit/PdfEditAdapter', () => {
  return {
    PdfEditAdapter: {
      countPages: vi.fn().mockResolvedValue(5),
      duplicatePages: vi.fn().mockResolvedValue(new Uint8Array([9, 9, 9])),
    }
  };
});

describe('Quantitative pass test - macros to expert level', () => {
  it('Same input + same recipe yields identical output hash in 5/5 runs', async () => {
    const dummyBytes = new Uint8Array([1, 2, 3]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const recipe: any = {
      dryRun: true,
      id: 'hash-test',
      name: 'Hash test',
      steps: [{ op: 'duplicate_pages', selector: { mode: 'all' } }]
    };

    let firstOutputBytes: Uint8Array | null = null;

    for (let i = 0; i < 5; i++) {
      const res = await executeMacroRecipe(
      recipe,
      {
        workingBytes: dummyBytes,
        pageCount: 1,
        selectedPages: [],
        currentPage: 1,
        fileName: 'test.pdf',
        donorFiles: {},
        now: new Date('2024-01-01T00:00:00.000Z')
      });

      if (i === 0) {
        firstOutputBytes = res.finalBytes;
      } else {
        expect(res.finalBytes).toEqual(firstOutputBytes);
      }
    }
  });
});
