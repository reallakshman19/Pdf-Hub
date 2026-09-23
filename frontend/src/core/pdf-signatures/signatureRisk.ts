import { pdfLib } from '@/core/pdf/lazyPdfLib';

export type PdfSignatureRiskStatus = 'SIGNED' | 'UNSIGNED' | 'UNKNOWN';

export type PdfSignatureRiskEvidence = 'BYTE_RANGE_AND_CONTENTS';

export interface PdfSignatureRiskResult {
  status: PdfSignatureRiskStatus;
  signatureCount: number;
  evidence: PdfSignatureRiskEvidence[];
  reason?: 'PDF_PARSE_FAILED';
}

/**
 * Detects applied PDF signatures on the structural surface exposed by pdf-lib.
 *
 * This is deliberately not cryptographic signature validation. A signature is
 * considered applied only when a current signature field/certification entry
 * resolves to a signature dictionary with both a meaningful /ByteRange and
 * non-zero /Contents. An empty /Sig form field alone is not enough to classify
 * a document as signed.
 */
export async function inspectPdfSignatureRisk(
  bytes: Uint8Array,
): Promise<PdfSignatureRiskResult> {
  try {
    const {
      PDFArray,
      PDFDict,
      PDFDocument,
      PDFName,
      PDFNumber,
    } = await pdfLib();

    const document = await PDFDocument.load(bytes, {
      updateMetadata: false,
    });

    const signatures = new Set<string>();
    const visitedFields = new Set<string>();

    const acroForm = document.catalog.lookup(PDFName.of('AcroForm'));
    if (acroForm instanceof PDFDict) {
      const fields = acroForm.lookup(PDFName.of('Fields'));
      if (fields instanceof PDFArray) {
        inspectSignatureFields(
          fields,
          null,
          'AcroForm.Fields',
          signatures,
          visitedFields,
          {
            PDFArray,
            PDFDict,
            PDFName,
            PDFNumber,
          },
        );
      }
    }

    const perms = document.catalog.lookup(PDFName.of('Perms'));
    if (perms instanceof PDFDict) {
      for (const name of ['DocMDP', 'UR', 'UR3']) {
        const key = PDFName.of(name);
        const rawValue = perms.get(key);
        const value = perms.lookup(key);
        if (
          value instanceof PDFDict
          && isAppliedSignatureDictionary(value, {
            PDFArray,
            PDFName,
            PDFNumber,
          })
        ) {
          signatures.add(signatureKey(rawValue, value, `Perms.${name}`));
        }
      }
    }

    if (signatures.size === 0) {
      return {
        status: 'UNSIGNED',
        signatureCount: 0,
        evidence: [],
      };
    }

    return {
      status: 'SIGNED',
      signatureCount: signatures.size,
      evidence: ['BYTE_RANGE_AND_CONTENTS'],
    };
  } catch {
    return {
      status: 'UNKNOWN',
      signatureCount: 0,
      evidence: [],
      reason: 'PDF_PARSE_FAILED',
    };
  }
}

function inspectSignatureFields(
  fields: import('pdf-lib').PDFArray,
  inheritedFieldType: string | null,
  path: string,
  signatures: Set<string>,
  visitedFields: Set<string>,
  lib: {
    PDFArray: typeof import('pdf-lib').PDFArray;
    PDFDict: typeof import('pdf-lib').PDFDict;
    PDFName: typeof import('pdf-lib').PDFName;
    PDFNumber: typeof import('pdf-lib').PDFNumber;
  },
): void {
  const {
    PDFArray,
    PDFDict,
    PDFName,
    PDFNumber,
  } = lib;

  for (let index = 0; index < fields.size(); index += 1) {
    const rawField = fields.get(index);
    const field = fields.lookup(index);
    if (!(field instanceof PDFDict)) {
      continue;
    }

    const fieldPath = `${path}[${index}]`;
    const fieldKey = signatureKey(rawField, field, fieldPath);
    if (visitedFields.has(fieldKey)) {
      continue;
    }
    visitedFields.add(fieldKey);

    const ownFieldType = field.get(PDFName.of('FT'))?.toString() ?? null;
    const fieldType = ownFieldType ?? inheritedFieldType;

    if (fieldType === '/Sig') {
      const rawValue = field.get(PDFName.of('V'));
      const value = field.lookup(PDFName.of('V'));
      if (
        value instanceof PDFDict
        && isAppliedSignatureDictionary(value, {
          PDFArray,
          PDFName,
          PDFNumber,
        })
      ) {
        signatures.add(signatureKey(rawValue, value, `${fieldPath}.V`));
      }
    }

    const kids = field.lookup(PDFName.of('Kids'));
    if (kids instanceof PDFArray) {
      inspectSignatureFields(
        kids,
        fieldType,
        `${fieldPath}.Kids`,
        signatures,
        visitedFields,
        lib,
      );
    }
  }
}

function signatureKey(
  rawValue: unknown,
  resolvedValue: unknown,
  fallback: string,
): string {
  if (rawValue && rawValue !== resolvedValue) {
    return String(rawValue);
  }
  return fallback;
}

function isAppliedSignatureDictionary(
  dict: import('pdf-lib').PDFDict,
  lib: {
    PDFArray: typeof import('pdf-lib').PDFArray;
    PDFName: typeof import('pdf-lib').PDFName;
    PDFNumber: typeof import('pdf-lib').PDFNumber;
  },
): boolean {
  const { PDFArray, PDFName, PDFNumber } = lib;

  const byteRange = dict.lookup(PDFName.of('ByteRange'));
  if (!(byteRange instanceof PDFArray) || byteRange.size() < 4) {
    return false;
  }

  const ranges: number[] = [];
  for (let index = 0; index < byteRange.size(); index += 1) {
    const value = byteRange.lookup(index);
    if (!(value instanceof PDFNumber)) {
      return false;
    }
    ranges.push(value.asNumber());
  }

  const meaningfulRange = ranges.every(
    (value) => Number.isFinite(value) && value >= 0,
  ) && ranges.some(
    (value, index) => index % 2 === 1 && value > 0,
  );

  if (!meaningfulRange) {
    return false;
  }

  const contents = dict.lookup(PDFName.of('Contents'));
  if (!contents) {
    return false;
  }

  const binary = contents as unknown as {
    asBytes?: () => Uint8Array;
  };

  try {
    const contentBytes = binary.asBytes?.();
    if (contentBytes) {
      return contentBytes.some((value) => value !== 0);
    }
  } catch {
    // Fall through to a conservative serialized-content check.
  }

  const serialized = contents
    .toString()
    .replace(/[\s<>()]/g, '');

  return serialized.length > 0 && /[1-9a-f]/i.test(serialized);
}
