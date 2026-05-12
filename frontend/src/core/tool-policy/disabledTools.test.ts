import { describe, expect, it } from 'vitest';
import {
  assertToolAllowed,
  getToolDisabledReason,
  isToolDisabled,
  normalizeActiveTool,
} from './disabledTools';
import type { ActiveTool } from '@/core/editor/types';

describe('disabled tool policy', () => {
  it.each([
    'textbox',
    'ink',
    'comment',
    'sticky-note',
    'callout',
    'shape-rect',
    'shape-ellipse',
    'shape-cloud',
    'shape-polygon',
    'stamp',
    'line',
    'arrow',
    'redaction',
    'squiggly',
  ] as ActiveTool[])('disables unsafe tool %s', (tool) => {
    expect(isToolDisabled(tool)).toBe(true);
    expect(getToolDisabledReason(tool)).toBeTruthy();
    expect(normalizeActiveTool(tool)).toBe('select');
    expect(() => assertToolAllowed(tool)).toThrow(/disabled/);
  });

  it.each([
    'select',
    'hand',
    'highlight',
    'underline',
    'strikeout',
  ] as ActiveTool[])('keeps safe tool %s enabled', (tool) => {
    expect(isToolDisabled(tool)).toBe(false);
    expect(getToolDisabledReason(tool)).toBeNull();
    expect(normalizeActiveTool(tool)).toBe(tool);
    expect(() => assertToolAllowed(tool)).not.toThrow();
  });
});
