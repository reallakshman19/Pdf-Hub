import { describe, expect, it } from 'vitest';
import {
  assertToolAllowed,
  getToolDisabledReason,
  isToolDisabled,
  normalizeActiveTool,
} from './disabledTools';
import type { ActiveTool } from '@/core/editor/types';

describe('disabled tool policy', () => {
  // All native annotation tools including textbox and stamp are enabled
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
    'textbox',
    'stamp',
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
