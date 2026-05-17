import { test, expect } from 'vitest';
import { getState, addRegion, clearRegions, exportPlan } from '../../frontend/src/core/redaction/store';
import { validateCommand } from '../../frontend/src/core/commands/validators';

test('redaction store initialises with empty regions', () => {
  clearRegions();
  expect(getState().regions).toHaveLength(0);
});

test('addRegion creates a region with preview status', () => {
  clearRegions();
  const region = addRegion(1, { x: 10, y: 20, width: 100, height: 30 }, 'PII');
  expect(region.status).toBe('preview');
  expect(region.pageNumber).toBe(1);
  expect(region.reason).toBe('PII');
  clearRegions();
});

test('exportPlan groups regions by page with no applied/complete status', () => {
  clearRegions();
  addRegion(1, { x: 0, y: 0, width: 50, height: 10 });
  addRegion(2, { x: 0, y: 0, width: 50, height: 10 });
  const plan = exportPlan();
  expect(plan.pages).toHaveLength(2);
  expect(JSON.stringify(plan)).not.toMatch(/applied|complete|redaction_apply/i);
  clearRegions();
});

test('validateCommand rejects command with missing required fields', () => {
  const result = validateCommand({} as Parameters<typeof validateCommand>[0]);
  expect(result.ok).toBe(false);
  expect(result.errors.length).toBeGreaterThan(0);
});

test('validateCommand accepts REDACTION_APPLY only as destructive risk', () => {
  const base = { id: 'r1', type: 'REDACTION_APPLY' as const, documentKey: 'doc1', createdAt: Date.now(), payload: {} };
  expect(validateCommand({ ...base, risk: 'destructive' } as Parameters<typeof validateCommand>[0]).ok).toBe(true);
  expect(validateCommand({ ...base, risk: 'safe' } as Parameters<typeof validateCommand>[0]).ok).toBe(false);
});
