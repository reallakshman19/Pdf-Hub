import { describe, expect, it } from 'vitest';
import {
  assertToolAllowed,
  getToolDisabledReason,
  isToolDisabled,
  normalizeActiveTool,
} from './disabledTools';
import type { ActiveTool } from '@/core/editor/types';

describe('disabled tool policy', () => {
  // Only two V2-replaced legacy tools remain disabled (callout re-enabled for annotate mode)
  it.each([
    'textbox',
    'stamp',
  ] as ActiveTool[])('disables V2-replaced legacy tool %s', (tool) => {
    expect(isToolDisabled(tool)).toBe(true);
    expect(getToolDisabledReason(tool)).toBeTruthy();
    expect(normalizeActiveTool(tool)).toBe('select');
    expect(() => assertToolAllowed(tool)).toThrow(/disabled/);
  });

  // All annotation tools including callout are enabled
  it.each([
    'select',
    'hand',
    'highlight',
    'underline',
    'strikeout',
    'squiggly',
    'ink',
    'comment',
    'callout',
    'sticky-note',
    'shape-rect',
    'shape-ellipse',
    'shape-cloud',
    'shape-polygon',
    'line',
    'arrow',
    'redaction',
  ] as ActiveTool[])('keeps tool %s enabled', (tool) => {
    expect(isToolDisabled(tool)).toBe(false);
    expect(getToolDisabledReason(tool)).toBeNull();
    expect(normalizeActiveTool(tool)).toBe(tool);
    expect(() => assertToolAllowed(tool)).not.toThrow();
  });
});
