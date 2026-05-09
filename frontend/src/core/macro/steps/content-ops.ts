import {
  macroRegistry,
  type StepResult,
} from '../registry';
import type {
  MacroExecutionContext,
  MacroStep,
  WriterTableModel,
} from '../types';
import {
  escapeMacroHtml,
  isSafeMacroImageSrc,
  safeMacroCssColor,
  safeMacroFontFamily,
  sanitizeMacroHtml,
} from '../security';

type ContentStep =
  | Extract<MacroStep, { op: 'draw_text_on_pages' }>
  | Extract<MacroStep, { op: 'header_footer_text' }>
  | Extract<MacroStep, { op: 'inject_rich_text' }>
  | Extract<MacroStep, { op: 'place_rich_textbox' }>
  | Extract<MacroStep, { op: 'place_table' }>
  | Extract<MacroStep, { op: 'adjust_image' }>;

function executeContentStep(step: ContentStep, ctx: MacroExecutionContext): StepResult {
  const diagnostics = createContentDiagnostics(step);

  if (diagnostics.status === 'error') {
    return {
      status: 'error',
      message: diagnostics.message,
      sideEffects: [
        {
          type: 'log',
          message: diagnostics.message,
        },
      ],
    };
  }

  return {
    status: diagnostics.status,
    message: diagnostics.message,
    sideEffects: [
      {
        type: 'bytes_updated',
        bytes: ctx.workingBytes,
      },
      {
        type: 'log',
        message: diagnostics.message,
      },
    ],
  };
}

export function createContentDiagnostics(step: ContentStep): {
  status: StepResult['status'];
  message: string;
  htmlPreview?: string;
} {
  if (step.op === 'place_rich_textbox') {
    const htmlPreview = renderSafeRichTextboxPreview(step.content, (step as any).styles ?? {});

    return {
      status: 'success',
      message: 'Safe rich textbox content prepared.',
      htmlPreview,
    };
  }

  if (step.op === 'place_table') {
    const htmlPreview = renderSafeTablePreview(step.tableData);

    return {
      status: 'success',
      message: 'Safe table content prepared.',
      htmlPreview,
    };
  }

  if (step.op === 'adjust_image') {
    if (step.base64Image && !isSafeMacroImageSrc(step.base64Image)) {
      return {
        status: 'error',
        message: 'Unsafe image source blocked.',
      };
    }

    return {
      status: 'success',
      message: 'Safe image adjustment prepared.',
    };
  }

  return {
    status: 'success',
    message: `${step.op} prepared with safe text handling.`,
  };
}

export function renderSafeRichTextboxPreview(
  content: string,
  styles: Record<string, unknown>,
): string {
  const sanitized = sanitizeMacroHtml(content);
  const color = safeMacroCssColor(styles['color'], '#111827');
  const backgroundColor = safeMacroCssColor(styles['backgroundColor'], 'transparent');
  const fontFamily = safeMacroFontFamily(styles['fontFamily']);
  const fontSize = typeof styles['fontSize'] === 'number' && Number.isFinite(styles['fontSize'])
    ? Math.max(1, styles['fontSize'])
    : 12;

  return `<div style="color:${color};background-color:${backgroundColor};font-family:${fontFamily};font-size:${fontSize}px;">${sanitized}</div>`;
}

export function renderSafeTablePreview(tableData: WriterTableModel): string {
  const style = tableData.style ?? {};
  const borderColor = safeMacroCssColor(style['borderColor'], '#d1d5db');
  const headerBackgroundColor = safeMacroCssColor(style['headerBackgroundColor'], '#f1f5f9');
  const fontSize =
    typeof style['fontSize'] === 'number' && Number.isFinite(style['fontSize'])
      ? Math.max(1, style['fontSize'])
      : 10;

  const header = `<tr>${tableData.columns
    .map((column: any) => `<th style="border:1px solid ${borderColor};background:${headerBackgroundColor};font-size:${fontSize}px;">${escapeMacroHtml(column.label ?? column.id)}</th>`)
    .join('')}</tr>`;

  const rows = tableData.rows
    .map((row: any) => {
      const cells = row.cells
        .map((cell: any) => `<td style="border:1px solid ${borderColor};font-size:${fontSize}px;">${escapeMacroHtml(cell.text)}</td>`)
        .join('');

      return `<tr>${cells}</tr>`;
    })
    .join('');

  return `<table style="border-collapse:collapse;">${header}${rows}</table>`;
}

macroRegistry.register('draw_text_on_pages', executeContentStep);
macroRegistry.register('header_footer_text', executeContentStep);
macroRegistry.register('inject_rich_text', executeContentStep);
macroRegistry.register('place_rich_textbox', executeContentStep);
macroRegistry.register('place_table', executeContentStep);
macroRegistry.register('adjust_image', executeContentStep);
