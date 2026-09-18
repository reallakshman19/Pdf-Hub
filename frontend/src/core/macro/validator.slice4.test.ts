import { describe, expect, it } from 'vitest';
import { macroValidator } from './validator';
import type { MacroRecipe } from './types';

function validate(recipe: MacroRecipe) {
  return macroValidator.validate(recipe);
}

describe('macro validator slice 4', () => {
  it('accepts valid basic recipe without depending on registry import order', () => {
    const result = validate({
      id: 'valid',
      name: 'Valid',
      steps: [
        {
          op: 'select_pages',
          selector: {
            mode: 'current',
          },
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects unknown op', () => {
    const result = validate({
      id: 'bad',
      name: 'Bad',
      steps: [
        {
          op: 'not_registered',
        } as never,
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.field.endsWith('.op'))).toBe(true);
  });

  it('does not require selector for place_rich_textbox, place_table, or adjust_image', () => {
    const result = validate({
      id: 'optional-selector',
      name: 'Optional Selector',
      steps: [
        {
          op: 'place_rich_textbox',
          x: 10,
          y: 10,
          width: 100,
          height: 40,
          content: '<b>Hello</b>',
          styles: {},
        },
        {
          op: 'place_table',
          x: 10,
          y: 60,
          width: 200,
          tableData: {
            columns: [{ id: 'c1' }],
            rows: [
              {
                id: 'r1',
                cells: [{ id: 'cell1', text: 'Pump' }],
              },
            ],
            style: {},
          },
        },
        {
          op: 'adjust_image',
          x: 10,
          y: 120,
          width: 80,
          height: 80,
          base64Image:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid page selector values', () => {
    const result = validate({
      id: 'bad-selector',
      name: 'Bad Selector',
      steps: [
        {
          op: 'rotate_pages',
          selector: {
            mode: 'range',
            from: 0,
            to: 2,
          },
          degrees: 90,
        },
        {
          op: 'extract_pages',
          selector: {
            mode: 'list',
            pages: [1, 0, -1],
          },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.field.includes('selector.from'))).toBe(true);
    expect(result.errors.some((error) => error.field.includes('selector.pages.1'))).toBe(true);
  });

  it('accepts explicit current-page insert positions', () => {
    const result = validate({
      id: 'current-insert',
      name: 'Current Insert',
      steps: [
        {
          op: 'insert_blank_page',
          position: { mode: 'after-current' },
          size: 'match-current',
          count: 1,
        },
        {
          op: 'add_content_page',
          position: { mode: 'before-current' },
          blocks: [],
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects invalid numeric fields', () => {
    const result = validate({
      id: 'bad-numeric',
      name: 'Bad Numeric',
      steps: [
        {
          op: 'draw_text_on_pages',
          selector: { mode: 'current' },
          text: 'Hello',
          x: Number.NaN,
          y: 10,
          fontSize: 0,
          opacity: 2,
        },
        {
          op: 'insert_blank_page',
          position: { mode: 'end' },
          size: { width: -1, height: 100 },
          count: 0,
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.field.includes('x'))).toBe(true);
    expect(result.errors.some((error) => error.field.includes('fontSize'))).toBe(true);
    expect(result.errors.some((error) => error.field.includes('opacity'))).toBe(true);
    expect(result.errors.some((error) => error.field.includes('size.width'))).toBe(true);
    expect(result.errors.some((error) => error.field.includes('count'))).toBe(true);
  });

  it('rejects invalid reorder lists', () => {
    const result = validate({
      id: 'bad-reorder',
      name: 'Bad Reorder',
      steps: [
        {
          op: 'reorder_pages',
          order: [1, 2, 2],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.includes('duplicate page'))).toBe(true);
  });

  it('recursively validates conditional then and else steps', () => {
    const result = validate({
      id: 'bad-nested',
      name: 'Bad Nested',
      steps: [
        {
          op: 'conditional',
          condition: {
            type: 'page_count_gt',
            value: 1,
          },
          then: [
            {
              op: 'rotate_pages',
              selector: {
                mode: 'current',
              },
              degrees: 45,
            } as never,
          ],
          else: [
            {
              op: 'adjust_image',
              x: 10,
              y: 10,
              width: 0,
              height: 50,
              base64Image: 'javascript:alert(1)',
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.field.includes('then.0.degrees'))).toBe(true);
    expect(result.errors.some((error) => error.field.includes('else.0.width'))).toBe(true);
    expect(result.errors.some((error) => error.message.includes('javascript image source'))).toBe(true);
  });

  it('rejects unsafe image source before execution', () => {
    const result = validate({
      id: 'unsafe-image',
      name: 'Unsafe Image',
      steps: [
        {
          op: 'insert_image',
          selector: { mode: 'current' },
          x: 10,
          y: 10,
          width: 40,
          height: 40,
          base64Image: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.message.includes('data:text/html'))).toBe(true);
  });

  it('accepts valid conditional with nested steps', () => {
    const result = validate({
      id: 'good-conditional',
      name: 'Good Conditional',
      steps: [
        {
          op: 'conditional',
          condition: {
            type: 'filename_contains',
            value: 'IFC',
          },
          then: [
            {
              op: 'select_pages',
              selector: {
                mode: 'all',
              },
            },
          ],
          else: [
            {
              op: 'draw_text_on_pages',
              selector: {
                mode: 'current',
              },
              text: 'Reviewed',
              x: 10,
              y: 10,
              fontSize: 12,
            },
          ],
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});