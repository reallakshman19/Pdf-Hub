import { test, expect } from 'vitest';
import { validateCommand } from '../../frontend/src/core/commands/validators';
import { addRegion, deleteRegions, clearRegions, getState } from '../../frontend/src/core/redaction/store';
import type { PdfCommand } from '../../frontend/src/core/commands/types';

const makeCmd = (risk: 'safe' | 'destructive' = 'destructive'): PdfCommand =>
  ({ id: 'b1', type: 'REDACTION_APPLY', documentKey: 'doc', createdAt: 1, risk, payload: {} }) as unknown as PdfCommand;

test('validateCommand runs 10 000× in under 200 ms', () => {
  const cmd = makeCmd();
  const start = performance.now();
  for (let i = 0; i < 10_000; i++) validateCommand(cmd);
  expect(performance.now() - start).toBeLessThan(200);
});

test('redaction store handles 1 000 addRegion + deleteRegions in under 100 ms', () => {
  clearRegions();
  const start = performance.now();
  const ids: string[] = [];
  for (let i = 0; i < 1_000; i++) {
    ids.push(addRegion(1, { x: i, y: 0, width: 10, height: 10 }).id);
  }
  deleteRegions(ids);
  expect(performance.now() - start).toBeLessThan(100);
  expect(getState().regions).toHaveLength(0);
  clearRegions();
});
