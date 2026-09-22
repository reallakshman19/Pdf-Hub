import { describe, expect, it } from 'vitest';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFString,
} from 'pdf-lib';
import { inspectPdfSignatureRisk } from './signatureRisk';

async function createPdfWithSignatureField(options: {
  populated: boolean;
  zeroContents?: boolean;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();

  let field;
  if (options.populated) {
    const signature = doc.context.obj({
      Type: PDFName.of('Sig'),
      ByteRange: [0, 128, 256, 64],
      Contents: PDFHexString.of(options.zeroContents ? '00000000' : '01020304'),
    });
    const signatureRef = doc.context.register(signature);
    field = doc.context.obj({
      FT: PDFName.of('Sig'),
      T: PDFString.of('Signature1'),
      V: signatureRef,
    });
  } else {
    field = doc.context.obj({
      FT: PDFName.of('Sig'),
      T: PDFString.of('Signature1'),
    });
  }

  const fieldRef = doc.context.register(field);
  const acroFormRef = doc.context.register(doc.context.obj({
    Fields: [fieldRef],
  }));
  doc.catalog.set(PDFName.of('AcroForm'), acroFormRef);

  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

async function createCertifiedPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();

  const signatureRef = doc.context.register(doc.context.obj({
    Type: PDFName.of('Sig'),
    ByteRange: [0, 64, 128, 32],
    Contents: PDFHexString.of('0a0b0c0d'),
  }));
  const permsRef = doc.context.register(doc.context.obj({
    DocMDP: signatureRef,
  }));
  doc.catalog.set(PDFName.of('Perms'), permsRef);

  return new Uint8Array(await doc.save({ useObjectStreams: false }));
}

describe('inspectPdfSignatureRisk', () => {
  it('returns UNKNOWN rather than UNSIGNED when the PDF cannot be parsed', async () => {
    const result = await inspectPdfSignatureRisk(new Uint8Array([1, 2, 3, 4]));

    expect(result).toEqual({
      status: 'UNKNOWN',
      signatureCount: 0,
      evidence: [],
      reason: 'PDF_PARSE_FAILED',
    });
  });

  it('reports an ordinary PDF as unsigned', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();

    const result = await inspectPdfSignatureRisk(
      new Uint8Array(await doc.save({ useObjectStreams: false })),
    );

    expect(result.status).toBe('UNSIGNED');
    expect(result.signatureCount).toBe(0);
  });

  it('does not treat an empty /Sig form field as an applied signature', async () => {
    const result = await inspectPdfSignatureRisk(
      await createPdfWithSignatureField({ populated: false }),
    );

    expect(result.status).toBe('UNSIGNED');
    expect(result.signatureCount).toBe(0);
  });

  it('does not treat an all-zero placeholder signature value as applied', async () => {
    const result = await inspectPdfSignatureRisk(
      await createPdfWithSignatureField({
        populated: true,
        zeroContents: true,
      }),
    );

    expect(result.status).toBe('UNSIGNED');
    expect(result.signatureCount).toBe(0);
  });

  it('detects a catalog certification signature through /Perms /DocMDP', async () => {
    const result = await inspectPdfSignatureRisk(await createCertifiedPdf());

    expect(result.status).toBe('SIGNED');
    expect(result.signatureCount).toBe(1);
    expect(result.evidence).toContain('BYTE_RANGE_AND_CONTENTS');
  });

  it('detects a populated signature dictionary exactly once', async () => {
    const result = await inspectPdfSignatureRisk(
      await createPdfWithSignatureField({ populated: true }),
    );

    expect(result.status).toBe('SIGNED');
    expect(result.signatureCount).toBe(1);
    expect(result.evidence).toContain('BYTE_RANGE_AND_CONTENTS');
  });
});
