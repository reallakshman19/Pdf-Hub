import { describe, it, expect } from 'vitest';
import {
  MACRO_OP_METADATA,
  getAvailableOps,
  getUnavailableReason,
  validateRecipeForMode,
} from './metadata';
import { createTestCapabilities } from '@/hooks/useCapabilities';

describe('MacroOpMetadata', () => {
  it('has metadata for all 22 registered ops', () => {
    const ALL_OPS = [
      'rotate_pages', 'extract_pages', 'split_pages', 'duplicate_pages',
      'remove_pages', 'insert_blank_page', 'replace_page', 'reorder_pages',
      'select_pages', 'merge_files', 'insert_pdf',
      'header_footer_text', 'draw_text_on_pages', 'inject_rich_text',
      'insert_image', 'add_content_page', 'add_image_header_page',
      'place_rich_textbox', 'place_table', 'adjust_image',
      'conditional', 'apply_template_vars',
    ];

    for (const op of ALL_OPS) {
      expect(MACRO_OP_METADATA[op]).toBeDefined();
      expect(MACRO_OP_METADATA[op].op).toBe(op);
    }
  });
});

describe('getAvailableOps', () => {
  it('returns all client ops in static mode', () => {
    const caps = createTestCapabilities('static');
    const available = getAvailableOps(caps);

    expect(available.length).toBe(22); // all current ops are client-mode
    expect(available.every((m) => m.mode === 'client')).toBe(true);
  });

  it('returns all ops in server mode', () => {
    const caps = createTestCapabilities('server');
    const available = getAvailableOps(caps);

    expect(available.length).toBeGreaterThanOrEqual(22);
  });
});

describe('getUnavailableReason', () => {
  it('returns null for client ops in any mode', () => {
    const caps = createTestCapabilities('static');
    expect(getUnavailableReason('rotate_pages', caps)).toBeNull();
    expect(getUnavailableReason('duplicate_pages', caps)).toBeNull();
  });

  it('returns reason for unknown ops', () => {
    const caps = createTestCapabilities('server');
    expect(getUnavailableReason('nonexistent_op', caps)).toContain('Unknown');
  });
});

describe('validateRecipeForMode', () => {
  it('validates a client-only recipe in static mode', () => {
    const caps = createTestCapabilities('static');
    const result = validateRecipeForMode(
      [{ op: 'rotate_pages' }, { op: 'duplicate_pages' }],
      caps,
    );
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});
