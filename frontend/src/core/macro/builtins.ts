import type { MacroRecipe } from './types';

export const BUILTIN_MACROS: Record<string, MacroRecipe> = {
  rotate_selected_90: {
    id: 'rotate_selected_90',
    name: 'Rotate selected pages 90°',
    steps: [
      { op: 'rotate_pages', selector: { mode: 'selected' }, degrees: 90 },
    ],
  },

  extract_selected: {
    id: 'extract_selected',
    name: 'Extract selected pages',
    steps: [
      { op: 'extract_pages', selector: { mode: 'selected' }, outputName: 'extracted-pages.pdf' },
    ],
  },

  split_selected: {
    id: 'split_selected',
    name: 'Split selected pages out',
    steps: [
      { op: 'split_pages', selector: { mode: 'selected' }, outputName: 'split-pages.pdf' },
    ],
  },

  add_page_numbers_footer: {
    id: 'add_page_numbers_footer',
    name: 'Add page numbers in footer',
    steps: [
      {
        op: 'header_footer_text',
        selector: { mode: 'all' },
        zone: 'footer',
        text: 'Page {page} of {pages}',
        align: 'center',
        marginX: 24,
        marginY: 20,
        fontSize: 10,
        color: '#475569',
        opacity: 0.9,
        pageNumberToken: true,
      },
    ],
  },

  add_filename_header_selected: {
    id: 'add_filename_header_selected',
    name: 'Add file name header on selected pages',
    steps: [
      {
        op: 'header_footer_text',
        selector: { mode: 'selected' },
        zone: 'header',
        text: '{file}',
        align: 'right',
        marginX: 24,
        marginY: 20,
        fontSize: 10,
        color: '#374151',
        opacity: 0.85,
        fileNameToken: true,
      },
    ],
  },

  add_file_date_footer_selected: {
    id: 'add_file_date_footer_selected',
    name: 'Add file/date footer to selected pages',
    steps: [
      {
        op: 'header_footer_text',
        selector: { mode: 'selected' },
        zone: 'footer',
        text: '{file} | {date} | Page {page}',
        align: 'center',
        marginX: 24,
        marginY: 18,
        fontSize: 10,
        color: '#334155',
        opacity: 0.9,
        pageNumberToken: true,
        fileNameToken: true,
        dateToken: true,
      },
    ],
  },

  batch_text_selected: {
    id: 'batch_text_selected',
    name: 'Batch text on selected pages',
    steps: [
      {
        op: 'draw_text_on_pages',
        selector: { mode: 'selected' },
        text: 'REVIEW COPY',
        x: 36,
        y: 36,
        fontSize: 16,
        color: '#b91c1c',
        opacity: 0.9,
        align: 'left',
      },
    ],
  },

  review_pack_header_footer: {
    id: 'review_pack_header_footer',
    name: 'Review pack header/footer',
    steps: [
      {
        op: 'header_footer_text',
        selector: { mode: 'all' },
        zone: 'header',
        text: '{file}',
        align: 'left',
        marginX: 24,
        marginY: 18,
        fontSize: 10,
        color: '#334155',
        opacity: 0.85,
        fileNameToken: true,
        excludeFirstPage: false,
      },
      {
        op: 'header_footer_text',
        selector: { mode: 'all' },
        zone: 'footer',
        text: 'Page {page} of {pages}  |  {date}',
        align: 'center',
        marginX: 24,
        marginY: 18,
        fontSize: 10,
        color: '#475569',
        opacity: 0.9,
        pageNumberToken: true,
        dateToken: true,
      },
    ],
  },

  insert_blank_after_current: {
    id: 'insert_blank_after_current',
    name: 'Insert blank page after current',
    steps: [
      {
        op: 'insert_blank_page',
        position: { mode: 'after', page: 1 },
        size: 'match-current',
        count: 1,
      },
    ],
  },
};
