import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import RedactionTool from '../RedactionTool';
import RedactionPreviewPanel from '../RedactionPreviewPanel';
import { clearRegions, addRegion, exportPlan } from '../../../core/redaction/store';
import { validateCommand } from '../../../core/commands/validators';
import {
  REDACTION_CAPABILITY,
  supportsSecureRedaction,
} from '../../../core/redaction/capability';

describe('Redaction guardrails', () => {
  beforeEach(() => clearRegions());

  test('browser build explicitly exposes visual-mask-only capability', () => {
    expect(REDACTION_CAPABILITY).toBe('visual-mask-only');
    expect(supportsSecureRedaction()).toBe(false);
  });

  test('RedactionTool renders no Apply button and warns about extractable content', () => {
    render(<RedactionTool />);
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /redact now/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /confirm redaction/i })).toBeNull();
    expect(screen.getByText(/visual mask \(not secure redaction\)/i)).toBeInTheDocument();
    expect(screen.getByText(/searchable or extractable/i)).toBeInTheDocument();
  });

  test('RedactionPreviewPanel renders no Apply button', () => {
    render(<RedactionPreviewPanel />);
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.getByText(/do not permanently remove/i)).toBeInTheDocument();
  });

  test('RedactionPreviewPanel export button claims only a visual mask plan', () => {
    addRegion(1, { x: 0, y: 0, width: 10, height: 10 });
    render(<RedactionPreviewPanel />);
    const button = screen.getByRole('button', { name: /export visual mask plan/i });
    expect(button.textContent).not.toMatch(/apply|complete|secure redaction/i);
  });

  test('exportPlan output never contains applied or redaction_apply strings', () => {
    addRegion(2, { x: 5, y: 5, width: 20, height: 20 }, 'sensitive');
    const plan = exportPlan();
    const json = JSON.stringify(plan);
    expect(json).not.toMatch(/applied|redaction_apply|complete/i);
    expect(plan.pages[0].rects).toHaveLength(1);
  });

  test('REDACTION_APPLY validator rejects any non-destructive risk', () => {
    const base = {
      id: 'r1',
      type: 'REDACTION_APPLY' as const,
      source: 'user' as const,
      documentKey: 'doc1',
      createdAt: new Date().toISOString(),
      payload: {},
    };
    expect(validateCommand({ ...base, risk: 'destructive' } as Parameters<typeof validateCommand>[0]).ok).toBe(true);
    expect(validateCommand({ ...base, risk: 'safe' } as Parameters<typeof validateCommand>[0]).ok).toBe(false);
    expect(validateCommand({ ...base, risk: 'destructive-preview-required' } as Parameters<typeof validateCommand>[0]).ok).toBe(false);

    const safeResult = validateCommand({ ...base, risk: 'safe' } as Parameters<typeof validateCommand>[0]);
    expect(safeResult.errors[0]).toMatch(/destructive/);
  });
});
