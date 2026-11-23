import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test } from 'vitest';
import RedactionTool from '../RedactionTool';
import RedactionPreviewPanel from '../RedactionPreviewPanel';
import { clearRegions, addRegion, exportPlan } from '../../../core/redaction/store';
import { validateCommand } from '../../../core/commands/validators';
import { materializePdfCommand } from '../../../core/commands/types';
import {
  REDACTION_CAPABILITY,
  supportsSecureRedaction,
} from '../../../core/redaction/capability';

describe('Redaction guardrails', () => {
  beforeEach(() => clearRegions());

  test('browser build exposes secure-redaction-supported capability in Phase 9', () => {
    expect(REDACTION_CAPABILITY).toBe('secure-redaction-supported');
    expect(supportsSecureRedaction()).toBe(true);
  });

  test('RedactionTool renders note and indicates secure redaction capability', () => {
    render(<RedactionTool />);
    expect(screen.queryByRole('button', { name: /apply/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /redact now/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /confirm redaction/i })).toBeNull();
    expect(screen.getByText(/visual mask \(not secure redaction\)/i)).toBeInTheDocument();
    expect(screen.getByText(/secure redaction is available in this build/i)).toBeInTheDocument();
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

  test('canonical command model exposes visual masking without a secure redaction apply command', () => {
    const command = materializePdfCommand(
      {
        type: 'DRAW_REDACTION_BOX',
        payload: {
          pageIndices: [0],
          options: {
            x: 0,
            y: 0,
            width: 10,
            height: 10,
            fillColor: '#000000',
          },
        },
      },
      'toolbar',
      'doc1',
    );

    const validation = validateCommand(command);

    expect(command.type).toBe('DRAW_REDACTION_BOX');
    expect(command.risk).toBe('safe');
    expect(validation.ok).toBe(true);
    expect(JSON.stringify(command)).not.toMatch(/REDACTION_APPLY/);
  });
});
