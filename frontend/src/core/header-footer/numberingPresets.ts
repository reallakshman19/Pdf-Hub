import type {
  HeaderFooterHorizontalSlot,
  HeaderFooterPageSelector,
  HeaderFooterRule,
} from './types';
import type { HeaderFooterEditorDraft } from './editorDraft';

export type PrintedNumberingPresetId =
  | 'page-n'
  | 'page-n-of-m'
  | 'logical-label'
  | 'section-page-of-total'
  | 'appendix-label';

export interface PrintedNumberingPresetDefinition {
  id: PrintedNumberingPresetId;
  label: string;
  description: string;
  slot: HeaderFooterHorizontalSlot;
}

export interface PrintedNumberingPresetOptions {
  appendixTitle?: string;
  ruleId?: string;
}

export const PRINTED_NUMBERING_PRESETS:
  readonly PrintedNumberingPresetDefinition[] = Object.freeze([
    {
      id: 'page-n',
      label: 'Page N',
      description: 'Physical page number.',
      slot: 'center',
    },
    {
      id: 'page-n-of-m',
      label: 'Page N of M',
      description: 'Physical page number and total document pages.',
      slot: 'center',
    },
    {
      id: 'logical-label',
      label: 'Logical label',
      description: 'Resolved PDF PageLabel, such as i, 1, or A-1.',
      slot: 'center',
    },
    {
      id: 'section-page-of-total',
      label: 'Section N of M',
      description: 'One-based page number inside the current PageLabel section.',
      slot: 'center',
    },
    {
      id: 'appendix-label',
      label: 'Appendix label',
      description: 'Appendix title plus the resolved logical PageLabel.',
      slot: 'right',
    },
  ]);

export function printedNumberingPreset(
  presetId: PrintedNumberingPresetId,
): PrintedNumberingPresetDefinition {
  const preset = PRINTED_NUMBERING_PRESETS.find(
    (candidate) => candidate.id === presetId,
  );
  if (!preset) {
    throw new Error(
      `Unknown printed-numbering preset: ${String(presetId)}`,
    );
  }
  return preset;
}

export function printedNumberingText(
  presetId: PrintedNumberingPresetId,
  options: PrintedNumberingPresetOptions = {},
): string {
  switch (presetId) {
    case 'page-n':
      return 'Page {{physicalPage}}';
    case 'page-n-of-m':
      return 'Page {{physicalPage}} of {{pageCount}}';
    case 'logical-label':
      return '{{pageLabel}}';
    case 'section-page-of-total':
      return 'Page {{sectionPage}} of {{sectionPageCount}}';
    case 'appendix-label': {
      const appendixTitle =
        options.appendixTitle?.trim() || 'Appendix A';
      return `${appendixTitle} — {{pageLabel}}`;
    }
  }
}

export function createPrintedNumberingRule(
  presetId: PrintedNumberingPresetId,
  selector: HeaderFooterPageSelector,
  options: PrintedNumberingPresetOptions = {},
): HeaderFooterRule {
  const preset = printedNumberingPreset(presetId);
  const footer: NonNullable<HeaderFooterRule['footer']> = {};
  footer[preset.slot] = {
    kind: 'text',
    template: printedNumberingText(presetId, options),
  };

  return {
    id:
      options.ruleId?.trim()
      || `printed-numbering:${presetId}`,
    selector,
    footer,
  };
}

export function applyPrintedNumberingPresetToDraft(
  draft: HeaderFooterEditorDraft,
  presetId: PrintedNumberingPresetId,
  options: PrintedNumberingPresetOptions = {},
): HeaderFooterEditorDraft {
  const preset = printedNumberingPreset(presetId);
  const footer = {
    left: '',
    center: '',
    right: '',
  };
  footer[preset.slot] = printedNumberingText(presetId, options);

  const imageConflicts =
    draft.image?.band === 'footer'
    && draft.image.slot === preset.slot;

  return {
    ...draft,
    name: `Printed numbering — ${preset.label}`,
    footer,
    image: imageConflicts ? null : draft.image,
  };
}
