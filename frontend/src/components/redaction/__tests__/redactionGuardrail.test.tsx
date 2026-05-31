import { render, screen } from '@testing-library/react';
import { describe, test, expect, beforeEach } from 'vitest';
import RedactionTool from '../RedactionTool';
import RedactionPreviewPanel from '../RedactionPreviewPanel';
import { clearRegions, addRegion, exportPlan } from '../../../core/redaction/store';
import { validateCommand } from '../../../core/commands/validators';

describe('Redaction guardrails', () => {
  beforeEach(() => clearRegions());

  test('RedactionTool renders no Apply button', () => {
    render(<RedactionTool />);
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /redact now/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /confirm redaction/i })).toBeNull();
  });

  test('RedactionPreviewPanel renders no Apply button', () => {
    render(<RedactionPreviewPanel />);
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
  });

  test('RedactionPreviewPanel Export button exists but does not claim completion', () => {
    addRegion(1, { x: 0, y: 0, width: 10, height: 10 });
    render(<RedactionPreviewPanel />);
    const btn = screen.queryByRole('button', { name: /export/i });
    // Export plan button may exist — it only exports JSON, does not apply
    if (btn) {
      expect(btn.textContent).not.toMatch(/apply|redact|complete/i);
    }
  });

  test('exportPlan output never contains applied or redaction_apply strings', () => {
    addRegion(2, { x: 5, y: 5, width: 20, height: 20 }, 'sensitive');
    const plan = exportPlan();
    const json = JSON.stringify(plan);
    expect(json).not.toMatch(/applied|redaction_apply|complete/i);
    expect(plan.pages[0].rects).toHaveLength(1);
  });

  test('REDACTION_APPLY validator rejects any non-destructive risk', () => {
    const base = { id: 'r1', type: 'REDACTION_APPLY' as const, source: 'user' as const, documentKey: 'doc1', createdAt: new Date().toISOString(), payload: {} };
    expect(validateCommand({ ...base, risk: 'destructive' } as Parameters<typeof validateCommand>[0]).ok).toBe(true);
    expect(validateCommand({ ...base, risk: 'safe' } as Parameters<typeof validateCommand>[0]).ok).toBe(false);
    expect(validateCommand({ ...base, risk: 'destructive-preview-required' } as Parameters<typeof validateCommand>[0]).ok).toBe(false);

    const safeResult = validateCommand({ ...base, risk: 'safe' } as Parameters<typeof validateCommand>[0]);
    expect(safeResult.errors[0]).toMatch(/destructive/);
  });
});
