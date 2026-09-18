import { describe, expect, it } from 'vitest';

import type { MacroRecipe } from './types';
import {
  applyOverridesToRecipe,
  createDefaultOverrides,
} from './presetOverrides';

describe('presetOverrides', () => {
  it('derives editable defaults from an existing recipe', () => {
    const recipe: MacroRecipe = {
      id: 'header-footer',
      name: 'Header Footer',
      steps: [
        {
          op: 'header_footer_text',
          selector: { mode: 'all' },
          zone: 'footer',
          text: 'Page {page}',
          align: 'right',
          marginX: 30,
          marginY: 18,
          fontSize: 11,
          color: '#111111',
          opacity: 0.75,
          pageNumberToken: true,
          fileNameToken: true,
          dateToken: false,
        },
      ],
    };

    expect(createDefaultOverrides(recipe, 12)).toMatchObject({
      selectorMode: 'all',
      rangeFrom: 1,
      rangeTo: 12,
      headerFooterText: 'Page {page}',
      headerFooterAlign: 'right',
      headerFooterMarginX: 30,
      headerFooterMarginY: 18,
      headerFooterFontSize: 11,
      headerFooterColor: '#111111',
      headerFooterOpacity: 0.75,
      headerFooterPageToken: true,
      headerFooterFileToken: true,
      headerFooterDateToken: false,
    });
  });

  it('applies range and rotate overrides to the runtime recipe', () => {
    const recipe: MacroRecipe = {
      id: 'rotate',
      name: 'Rotate',
      steps: [
        {
          op: 'rotate_pages',
          selector: { mode: 'selected' },
          degrees: 90,
        },
      ],
    };
    const overrides = createDefaultOverrides(recipe, 10);

    const updated = applyOverridesToRecipe(
      recipe,
      {
        ...overrides,
        selectorMode: 'range',
        rangeFrom: 3,
        rangeTo: 7,
        rotateDegrees: 270,
      },
      4,
      10,
    );

    expect(updated.steps[0]).toEqual({
      op: 'rotate_pages',
      selector: { mode: 'range', from: 3, to: 7 },
      degrees: 270,
    });
  });

  it('clamps range selectors to the active document', () => {
    const recipe: MacroRecipe = {
      id: 'extract',
      name: 'Extract',
      steps: [
        {
          op: 'extract_pages',
          selector: { mode: 'selected' },
          outputName: 'old.pdf',
        },
      ],
    };
    const overrides = createDefaultOverrides(recipe, 5);

    const updated = applyOverridesToRecipe(
      recipe,
      {
        ...overrides,
        selectorMode: 'range',
        rangeFrom: -10,
        rangeTo: 99,
        outputName: 'new.pdf',
      },
      1,
      5,
    );

    expect(updated.steps[0]).toEqual({
      op: 'extract_pages',
      selector: { mode: 'range', from: 1, to: 5 },
      outputName: 'new.pdf',
    });
  });

  it('applies header/footer presentation parameters and clamps opacity', () => {
    const recipe: MacroRecipe = {
      id: 'footer',
      name: 'Footer',
      steps: [
        {
          op: 'header_footer_text',
          selector: { mode: 'selected' },
          zone: 'footer',
          text: 'Old',
          align: 'left',
          marginX: 10,
          marginY: 10,
          fontSize: 9,
        },
      ],
    };
    const overrides = createDefaultOverrides(recipe, 3);

    const updated = applyOverridesToRecipe(
      recipe,
      {
        ...overrides,
        headerFooterText: 'New {file}',
        headerFooterAlign: 'center',
        headerFooterMarginX: 20,
        headerFooterMarginY: 22,
        headerFooterFontSize: 12,
        headerFooterColor: '#abcdef',
        headerFooterOpacity: 2,
        headerFooterPageToken: false,
        headerFooterFileToken: true,
        headerFooterDateToken: true,
      },
      2,
      3,
    );

    expect(updated.steps[0]).toMatchObject({
      op: 'header_footer_text',
      text: 'New {file}',
      align: 'center',
      marginX: 20,
      marginY: 22,
      fontSize: 12,
      color: '#abcdef',
      opacity: 1,
      pageNumberToken: false,
      fileNameToken: true,
      dateToken: true,
    });
  });

  it('applies blank-page placement relative to the current page', () => {
    const recipe: MacroRecipe = {
      id: 'blank',
      name: 'Blank',
      steps: [
        {
          op: 'insert_blank_page',
          position: { mode: 'after', page: 1 },
          size: 'match-current',
          count: 1,
        },
      ],
    };
    const overrides = createDefaultOverrides(recipe, 8);

    const updated = applyOverridesToRecipe(
      recipe,
      {
        ...overrides,
        blankPlacement: 'before',
        blankSize: 'letter',
        blankCount: 3,
      },
      6,
      8,
    );

    expect(updated.steps[0]).toEqual({
      op: 'insert_blank_page',
      position: { mode: 'before', page: 6 },
      size: 'letter',
      count: 3,
    });
  });
});
