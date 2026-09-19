import type { PageId } from '@/core/pages/types';
import {
  createSimpleHeaderFooterTextTemplate,
} from '@/core/header-footer/simpleTextTemplate';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import type { MacroStep } from '../types';

export type LegacyHeaderFooterTextStep = Extract<
  MacroStep,
  { op: 'header_footer_text' }
>;

export interface LegacyHeaderFooterCompatCompilation {
  template: HeaderFooterTemplate;
  variables: Record<string, string>;
  dateText: string;
}

const GENERATED_PHYSICAL_PAGE = '\u0000legacy-hf-physical-page\u0000';
const GENERATED_PAGE_COUNT = '\u0000legacy-hf-page-count\u0000';
const GENERATED_FILE_NAME = '\u0000legacy-hf-file-name\u0000';
const GENERATED_DATE = '\u0000legacy-hf-date\u0000';

export function compileLegacyHeaderFooterTextStep(
  step: LegacyHeaderFooterTextStep,
  pageIds: readonly PageId[],
  now: Date,
): LegacyHeaderFooterCompatCompilation {
  if (pageIds.length === 0) {
    throw new Error(
      'Legacy header/footer compatibility requires at least one target PageId.',
    );
  }

  const translated = translateLegacyHeaderFooterText(step);

  return {
    template: createSimpleHeaderFooterTextTemplate({
      name: 'Legacy header/footer compatibility',
      selector: {
        include: {
          mode: 'pageIds',
          pageIds: [...pageIds],
        },
      },
      zone: step.zone,
      text: translated.text,
      align: step.align,
      marginXPt: step.marginX,
      marginYPt: step.marginY,
      fontSizePt: step.fontSize,
      color: normalizeLegacyHexColor(step.color ?? '#374151'),
      opacity: step.opacity ?? 0.9,
    }),
    variables: translated.variables,
    dateText: now.toLocaleDateString(),
  };
}

export function translateLegacyHeaderFooterText(
  step: LegacyHeaderFooterTextStep,
): {
  text: string;
  variables: Record<string, string>;
} {
  let text = step.text;

  if (step.pageNumberToken ?? true) {
    text = replaceAllForms(
      text,
      ['{{page}}', '{page}'],
      GENERATED_PHYSICAL_PAGE,
    );
    text = replaceAllForms(
      text,
      ['{{total_pages}}', '{{pages}}', '{pages}'],
      GENERATED_PAGE_COUNT,
    );
  }

  if (step.fileNameToken ?? false) {
    text = replaceAllForms(
      text,
      ['{{file_name}}', '{{file}}', '{file}'],
      GENERATED_FILE_NAME,
    );
  }

  if (step.dateToken ?? false) {
    text = replaceAllForms(
      text,
      ['{{date}}', '{date}'],
      GENERATED_DATE,
    );
  }

  const variables: Record<string, string> = {};
  let literalIndex = 0;

  text = text.replace(
    /{{\s*[^{}]+?\s*}}/g,
    (literal) => {
      const key = `__legacy_hf_literal_${literalIndex}`;
      literalIndex += 1;
      variables[key] = literal;
      return `{{var:${key}}}`;
    },
  );

  text = text
    .replaceAll(GENERATED_PHYSICAL_PAGE, '{{physicalPage}}')
    .replaceAll(GENERATED_PAGE_COUNT, '{{pageCount}}')
    .replaceAll(GENERATED_FILE_NAME, '{{fileName}}')
    .replaceAll(GENERATED_DATE, '{{date}}');

  return { text, variables };
}

function replaceAllForms(
  value: string,
  forms: readonly string[],
  replacement: string,
): string {
  return forms.reduce(
    (current, form) => current.replaceAll(form, replacement),
    value,
  );
}


function normalizeLegacyHexColor(value: string): string {
  const normalized = value.replace('#', '').trim();
  const expanded =
    normalized.length === 3
      ? normalized
          .split('')
          .map((character) => character + character)
          .join('')
      : normalized.padEnd(6, '0').slice(0, 6);

  return /^[0-9a-f]{6}$/i.test(expanded)
    ? `#${expanded}`
    : value;
}
