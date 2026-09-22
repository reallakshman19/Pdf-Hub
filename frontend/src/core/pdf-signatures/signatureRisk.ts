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
 * considered applied only when a signature dictionary has both a meaningful
 * /ByteRange and non-zero /Contents. An empty /Sig form field alone is not
 * enough to classify a document as signed.
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

    for (const [ref, object] of document.context.enumerateIndirectObjects()) {
      if (!(object instanceof PDFDict)) {
        continue;
      }

      if (isAppliedSignatureDictionary(object, {
        PDFArray,
        PDFName,
        PDFNumber,
      })) {
        signatures.add(ref.toString());
      }

      const fieldType = object.get(PDFName.of('FT'));
      if (fieldType?.toString() !== '/Sig') {
        continue;
      }

      const rawValue = object.get(PDFName.of('V'));
      const value = object.lookup(PDFName.of('V'));
      if (
        value instanceof PDFDict
        && isAppliedSignatureDictionary(value, {
          PDFArray,
          PDFName,
          PDFNumber,
        })
      ) {
        signatures.add(rawValue?.toString() ?? `${ref.toString()}:V`);
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
