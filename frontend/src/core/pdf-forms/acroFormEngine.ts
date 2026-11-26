import { pdfLib } from '@/core/pdf/lazyPdfLib';
import {
  createMarkupSpace,
  pdfRectToViewRect,
  type MarkupSpace,
} from '@/core/pdf-annotations/markupGeometry';
import type {
  AcroFormExtractionResult,
  AcroFormFieldDescriptor,
  AcroFormFieldValue,
  AcroFormWidgetDescriptor,
} from './types';

type PDFDocument = import('pdf-lib').PDFDocument;
type PDFDict = import('pdf-lib').PDFDict;
type PDFPage = import('pdf-lib').PDFPage;
type PDFRef = import('pdf-lib').PDFRef;
type PdfLibModule = typeof import('pdf-lib');

interface PageGeometryEntry {
  pageNumber: number;
  space: MarkupSpace;
}

function buildPageLookup(
  doc: PDFDocument,
  lib: PdfLibModule,
): {
  byPageRef: Map<string, PageGeometryEntry>;
  byAnnotDict: Map<PDFDict, PageGeometryEntry>;
  byAnnotRef: Map<string, PageGeometryEntry>;
} {
  const byPageRef = new Map<string, PageGeometryEntry>();
  const byAnnotDict = new Map<PDFDict, PageGeometryEntry>();
  const byAnnotRef = new Map<string, PageGeometryEntry>();

  const pages: PDFPage[] = doc.getPages();
  pages.forEach((page, index) => {
    const cropBox = page.getCropBox();
    const angle = page.getRotation().angle;
    const entry: PageGeometryEntry = {
      pageNumber: index + 1,
      space: createMarkupSpace(cropBox, angle),
    };
    byPageRef.set(page.ref.toString(), entry);

    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i += 1) {
      const item = annots.get(i);
      if (item instanceof lib.PDFRef) {
        byAnnotRef.set(item.toString(), entry);
      }
      const dict = doc.context.lookupMaybe(item, lib.PDFDict);
      if (dict) {
        byAnnotDict.set(dict, entry);
      }
    }
  });

  return { byPageRef, byAnnotDict, byAnnotRef };
}

function resolveWidgetPage(
  pageRef: PDFRef | undefined,
  widgetDict: PDFDict,
  widgetRefKey: string | null,
  lookup: ReturnType<typeof buildPageLookup>,
): PageGeometryEntry | null {
  if (pageRef) {
    const byP = lookup.byPageRef.get(pageRef.toString());
    if (byP) return byP;
  }
  if (widgetRefKey) {
    const byRef = lookup.byAnnotRef.get(widgetRefKey);
    if (byRef) return byRef;
  }
  return lookup.byAnnotDict.get(widgetDict) ?? null;
}

function extractWidgetRectangles(
  doc: PDFDocument,
  fieldName: string,
  widgets: ReturnType<import('pdf-lib').PDFField['acroField']['getWidgets']>,
  lookup: ReturnType<typeof buildPageLookup>,
  radioOptions?: readonly string[],
): AcroFormWidgetDescriptor[] {
  const descriptors: AcroFormWidgetDescriptor[] = [];

  widgets.forEach((widget, widgetIndex) => {
    const widgetRef = doc.context.getObjectRef(widget.dict);
    const widgetRefKey = widgetRef ? widgetRef.toString() : null;
    const pageEntry = resolveWidgetPage(widget.P(), widget.dict, widgetRefKey, lookup);
    if (!pageEntry) return;

    const rawRect = widget.getRectangle();
    if (
      !Number.isFinite(rawRect.x)
      || !Number.isFinite(rawRect.y)
      || !Number.isFinite(rawRect.width)
      || !Number.isFinite(rawRect.height)
      || rawRect.width <= 0
      || rawRect.height <= 0
    ) {
      return;
    }

    const viewRect = pdfRectToViewRect(
      [rawRect.x, rawRect.y, rawRect.x + rawRect.width, rawRect.y + rawRect.height],
      pageEntry.space,
    );

    const onValueName = widget.getOnValue();
    const resolvedOnValue =
      radioOptions?.[widgetIndex]
      ?? onValueName?.decodeText()
      ?? undefined;

    descriptors.push({
      widgetId: `${fieldName}::${widgetIndex}`,
      pageNumber: pageEntry.pageNumber,
      rect: viewRect,
      ...(resolvedOnValue !== undefined ? { onValue: resolvedOnValue } : {}),
    });
  });

  return descriptors;
}

export async function extractPdfFormFields(
  pdfBytes: Uint8Array,
): Promise<AcroFormExtractionResult> {
  if (pdfBytes.byteLength === 0) {
    return { hasForm: false, fields: [] };
  }

  try {
    const lib = await pdfLib();
    const doc = await lib.PDFDocument.load(pdfBytes, { updateMetadata: false });
    const rawAcroForm = doc.catalog.lookupMaybe(lib.PDFName.of('AcroForm'), lib.PDFDict);
    if (!rawAcroForm) {
      return { hasForm: false, fields: [] };
    }

    const form = doc.getForm();
    const rawFields = form.getFields();
    if (rawFields.length === 0) {
      return { hasForm: false, fields: [] };
    }

    const pageLookup = buildPageLookup(doc, lib);
    const fields: AcroFormFieldDescriptor[] = [];

    for (const field of rawFields) {
      const name = field.getName();
      if (!name) continue;
      const readOnly = field.isReadOnly();
      const required = field.isRequired();
      const rawWidgets = field.acroField.getWidgets();

      if (field instanceof lib.PDFTextField) {
        const widgets = extractWidgetRectangles(doc, name, rawWidgets, pageLookup);
        if (widgets.length === 0) continue;
        fields.push({
          name,
          kind: 'text',
          readOnly,
          required,
          multiline: field.isMultiline(),
          ...(field.getMaxLength() !== undefined ? { maxLength: field.getMaxLength() } : {}),
          value: field.getText() ?? '',
          widgets,
        });
      } else if (field instanceof lib.PDFCheckBox) {
        const widgets = extractWidgetRectangles(doc, name, rawWidgets, pageLookup);
        if (widgets.length === 0) continue;
        fields.push({
          name,
          kind: 'checkbox',
          readOnly,
          required,
          value: field.isChecked(),
          widgets,
        });
      } else if (field instanceof lib.PDFDropdown) {
        const widgets = extractWidgetRectangles(doc, name, rawWidgets, pageLookup);
        if (widgets.length === 0) continue;
        const selected = field.getSelected();
        fields.push({
          name,
          kind: 'dropdown',
          readOnly,
          required,
          options: field.getOptions(),
          value: selected[0] ?? '',
          widgets,
        });
      } else if (field instanceof lib.PDFOptionList) {
        const widgets = extractWidgetRectangles(doc, name, rawWidgets, pageLookup);
        if (widgets.length === 0) continue;
        fields.push({
          name,
          kind: 'option-list',
          readOnly,
          required,
          options: field.getOptions(),
          value: field.getSelected(),
          widgets,
        });
      } else if (field instanceof lib.PDFRadioGroup) {
        const options = field.getOptions();
        const widgets = extractWidgetRectangles(
          doc,
          name,
          rawWidgets,
          pageLookup,
          options,
        );
        if (widgets.length === 0) continue;
        fields.push({
          name,
          kind: 'radio',
          readOnly,
          required,
          options,
          value: field.getSelected() ?? '',
          widgets,
        });
      }
    }

    return {
      hasForm: fields.length > 0,
      fields,
    };
  } catch {
    return { hasForm: false, fields: [] };
  }
}

export async function applyAcroFormUpdatesToPdf(
  pdfBytes: Uint8Array,
  values: Readonly<Record<string, AcroFormFieldValue>>,
  options: { flatten?: boolean } = {},
): Promise<Uint8Array> {
  const entries = Object.entries(values);
  if (entries.length === 0 && !options.flatten) {
    return pdfBytes;
  }

  const lib = await pdfLib();
  const doc = await lib.PDFDocument.load(pdfBytes, { updateMetadata: false });
  const rawAcroForm = doc.catalog.lookupMaybe(lib.PDFName.of('AcroForm'), lib.PDFDict);
  if (!rawAcroForm) {
    return pdfBytes;
  }

  const form = doc.getForm();
  for (const [fieldName, value] of entries) {
    const field = form.getFieldMaybe(fieldName);
    if (!field || field.isReadOnly()) continue;

    if (field instanceof lib.PDFTextField) {
      field.setText(typeof value === 'string' ? value : String(value ?? ''));
    } else if (field instanceof lib.PDFCheckBox) {
      if (value === true || value === 'true') {
        field.check();
      } else {
        field.uncheck();
      }
    } else if (field instanceof lib.PDFDropdown) {
      const selected = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
        : typeof value === 'string' && value.length > 0
          ? [value]
          : [];
      if (selected.length === 0) {
        field.clear();
      } else {
        field.select(selected);
      }
    } else if (field instanceof lib.PDFOptionList) {
      const selected = Array.isArray(value)
        ? value.filter((item): item is string => typeof item === 'string')
        : typeof value === 'string' && value.length > 0
          ? [value]
          : [];
      if (selected.length === 0) {
        field.clear();
      } else {
        field.select(selected);
      }
    } else if (field instanceof lib.PDFRadioGroup) {
      if (typeof value === 'string' && value.length > 0) {
        field.select(value);
      } else {
        field.clear();
      }
    }
  }

  try {
    form.updateFieldAppearances();
  } catch {
    // Non-WinAnsi glyphs in custom user text still preserve /V state in the form field.
  }

  if (options.flatten) {
    try {
      form.flatten({ updateFieldAppearances: true });
    } catch {
      form.flatten({ updateFieldAppearances: false });
    }
  }

  return doc.save({
    useObjectStreams: false,
    updateFieldAppearances: false,
  });
}
