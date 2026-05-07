export type PageSelector =
  | { mode: 'all' }
  | { mode: 'current' }
  | { mode: 'selected' }
  | { mode: 'range'; from: number; to: number }
  | { mode: 'list'; pages: number[] }
  | { mode: 'odd' }
  | { mode: 'even' };

export type InsertPosition =
  | { mode: 'before'; page: number }
  | { mode: 'after'; page: number }
  | { mode: 'start' }
  | { mode: 'end' };

import type { ContentBlock } from './layout/LayoutEngine';

export type MacroStep =
  | {
      op: 'add_content_page';
      position: InsertPosition;
      size?: 'a4' | 'letter';
      background?: string;
      blocks: ContentBlock[];
    }
  | {
      op: 'add_image_header_page';
      position: InsertPosition;
      imageSrc: string;
      headerHeight?: number;
      title: string;
      subtitle?: string;
      bodyMarkdown?: string;
      size?: 'a4' | 'letter';
    }
  | { op: 'select_pages'; selector: PageSelector }
  | { op: 'merge_files'; donorFileIds: string[] }
  | { op: 'insert_pdf'; donorFileId: string; atIndex: number }
  | { op: 'extract_pages'; selector: PageSelector; outputName?: string }
  | { op: 'split_pages'; selector: PageSelector; outputName?: string }
  | { op: 'duplicate_pages'; selector: PageSelector }
  | { op: 'rotate_pages'; selector: PageSelector; degrees: 90 | 180 | 270 }
  | { op: 'remove_pages'; selector: PageSelector }
  | {
      op: 'insert_blank_page';
      position: InsertPosition;
      size: 'match-current' | 'a4' | 'letter' | { width: number; height: number };
      count?: number;
    }
  | {
      op: 'replace_page';
      targetPage: number;
      donorFileId: string;
      donorPage: number;
    }
  | {
      op: 'reorder_pages';
      order: number[];
    }
  | {
      op: 'draw_text_on_pages';
      selector: PageSelector;
      text: string;
      x: number;
      y: number;
      fontSize: number;
      color?: string;
      opacity?: number;
      align?: 'left' | 'center' | 'right';
      fontFamily?: string;
      pageNumberToken?: boolean;
      fileNameToken?: boolean;
      dateToken?: boolean;
    }
  | {
      op: 'header_footer_text';
      selector: PageSelector;
      zone: 'header' | 'footer';
      text: string;
      align: 'left' | 'center' | 'right';
      marginX: number;
      marginY: number;
      fontSize: number;
      color?: string;
      opacity?: number;
      excludeFirstPage?: boolean;
      excludeLastPage?: boolean;
      pageNumberToken?: boolean;
      fileNameToken?: boolean;
      dateToken?: boolean;
    }
  | {
      op: 'insert_image';
      selector: PageSelector;
      x: number;
      y: number;
      width?: number;
      height?: number;
      scale?: number;
      base64Image?: string;
      donorFileId?: string;
    }
  | {
      op: 'inject_rich_text';
      selector: PageSelector;
      x: number;
      y: number;
      width?: number;
      height?: number;
      text: string;
      fontSize: number;
      fontFamily?: string;
      fontWeight?: string;
      fontStyle?: string;
      color?: string;
      opacity?: number;
      textAlign?: 'left' | 'center' | 'right' | 'justify';
      pageNumberToken?: boolean;
      fileNameToken?: boolean;
      dateToken?: boolean;
    }
  | {
      op: 'place_rich_textbox';
      selector?: PageSelector;
      x: number;
      y: number;
      width: number;
      height?: number;
      content: string; // HTML string
      styles: import('../writer/types').WriterStyles;
    }
  | {
      op: 'place_table';
      selector?: PageSelector;
      x: number;
      y: number;
      width: number;
      tableData: import('../writer/types').WriterTableData;
    }
  | {
      op: 'adjust_image';
      selector?: PageSelector;
      x: number;
      y: number;
      width: number;
      height: number;
      opacity?: number;
      borderWidth?: number;
      borderColor?: string;
      rotation?: number;
      base64Image?: string;
      donorFileId?: string;
    }
  | { op: 'conditional'; condition: MacroCondition; then: MacroStep[]; else?: MacroStep[] }
  | { op: 'apply_template_vars'; vars: Record<string, string> };

export type MacroCondition =
  | { type: 'page_count_gt';     value: number }
  | { type: 'page_count_lt';     value: number }
  | { type: 'filename_contains'; value: string }
  | { type: 'custom_var_equals'; key: string; value: string };

export interface MacroRecipe {
  id: string;
  name: string;
  dryRun?: boolean;
  steps: MacroStep[];
}

export interface MacroExecutionContext {
  workingBytes: Uint8Array;
  pageCount: number;
  selectedPages: number[];
  currentPage?: number;
  fileName: string;
  fileId?: string;
  donorFiles?: Record<string, Uint8Array>;
  now?: Date;
  options?: {
    abortOnError?: boolean;
  };
}

export interface MacroOutputFile {
  name: string;
  bytes: Uint8Array;
}

export interface MacroRunResult {
  workingBytes: Uint8Array;
  pageCount: number;
  selectedPages: number[];
  logs: string[];
  extractedOutputs: MacroOutputFile[];
}
