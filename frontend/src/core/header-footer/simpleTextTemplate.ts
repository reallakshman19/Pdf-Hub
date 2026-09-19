import type {
  HeaderFooterHorizontalSlot,
  HeaderFooterPageSelector,
  HeaderFooterTemplate,
} from './types';

export interface SimpleHeaderFooterTextTemplateInput {
  name: string;
  selector: HeaderFooterPageSelector;
  zone: 'header' | 'footer';
  text: string;
  align: HeaderFooterHorizontalSlot;
  marginXPt: number;
  marginYPt: number;
  fontSizePt: number;
  color: string;
  opacity?: number;
  fontFamily?: string;
}

export function createSimpleHeaderFooterTextTemplate(
  input: SimpleHeaderFooterTextTemplateInput,
): HeaderFooterTemplate {
  const text = input.text.trim();
  if (!text) {
    throw new Error('Header/footer text must not be empty.');
  }

  const band = {
    [input.align]: {
      kind: 'text' as const,
      template: input.text,
    },
  };

  return {
    schemaVersion: 1,
    name: input.name,
    layout: {
      leftMarginPt: input.marginXPt,
      rightMarginPt: input.marginXPt,
      headerOffsetFromTopPt: input.marginYPt,
      footerOffsetFromBottomPt: input.marginYPt,
    },
    defaultTextStyle: {
      fontFamily: input.fontFamily ?? 'Helvetica',
      fontSizePt: input.fontSizePt,
      fontWeight: 'normal',
      fontStyle: 'normal',
      color: input.color,
      opacity: input.opacity ?? 1,
    },
    rules: [
      {
        id: 'simple-text',
        selector: input.selector,
        ...(input.zone === 'header'
          ? { header: band }
          : { footer: band }),
      },
    ],
  };
}
