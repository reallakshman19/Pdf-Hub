import {
  describe,
  expect,
  it,
} from 'vitest';
import { PDFDocument } from 'pdf-lib';
import {
  createOcrDemoFixture,
  createOcrDemoPageResult,
  createOcrDemoPdfBytes,
  createOcrDemoResult,
  createOcrDemoWriterElement,
  getDemoTextLines,
  getOcrDemoFixtureDescriptor,
  listOcrDemoFixtureDescriptors,
} from '../fixtures/ocrDemoFixtures';
import { validateOcrProjectPayload } from '../ocrProjectCodec';
import { exportSearchableOcrPdf } from '../ocrSearchablePdfExport';
import type { OcrTableBlock } from '../types';

describe('ocrDemoFixtures', () => {
  it('lists demo fixture descriptors', () => {
    const descriptors = listOcrDemoFixtureDescriptors();

    expect(descriptors.length).toBeGreaterThanOrEqual(3);
    expect(descriptors.map((descriptor) => descriptor.id)).toContain('clean-text');
    expect(descriptors.map((descriptor) => descriptor.id)).toContain('simple-table');
  });

  it('gets fixture descriptor by id', () => {
    const descriptor = getOcrDemoFixtureDescriptor('engineering-note');

    expect(descriptor.title).toBe('Engineering Note OCR');
    expect(descriptor.pageCount).toBe(1);
  });

  it('throws for unknown fixture id', () => {
    expect(() =>
      getOcrDemoFixtureDescriptor('bad-fixture' as never),
    ).toThrow('Unknown OCR demo fixture');
  });

  it('creates valid demo PDF bytes', async () => {
    const bytes = await createOcrDemoPdfBytes('clean-text');

    expect(bytes.length).toBeGreaterThan(100);

    const pdf = await PDFDocument.load(bytes);

    expect(pdf.getPageCount()).toBe(1);
  });

  it('creates clean text OCR result', () => {
    const result = createOcrDemoResult('clean-text', 'doc-demo');

    expect(result.documentFingerprint).toBe('doc-demo');
    expect(result.pages).toHaveLength(1);
    
    const page = result.pages[0];
    expect(page).toBeDefined();
    expect(page.words).toBeDefined();
    expect(page.lines).toBeDefined();
    expect(page.words?.length).toBeGreaterThan(0);
    expect(page.lines?.length).toBeGreaterThan(0);
    expect(page.blocks[0].text).toContain('Writer OCR Demo');
  });

  it('creates engineering note OCR result', () => {
    const result = createOcrDemoResult('engineering-note', 'doc-engineering');
    const page = result.pages[0];
    expect(page).toBeDefined();
    expect(page.blocks[0].text).toContain('Line No:');
    expect(page.blocks[0].text).toContain('PS-001');
  });

  it('creates table OCR page result', () => {
    const page = createOcrDemoPageResult('simple-table');

    const table = page.blocks.find((block) => block.type === 'table') as OcrTableBlock;

    expect(table).toBeTruthy();
    expect(table.rows).toHaveLength(3);
    expect(table.rows[0].cells[0].text).toBe('Tag');
    expect(table.rows[1].cells[0].text).toBe('PS-001');
  });

  it('creates demo writer text element', () => {
    const element = createOcrDemoWriterElement('clean-text', 'doc-demo');

    expect(element.documentFingerprint).toBe('doc-demo');
    expect(element.type).toBe('richTextBox');
    expect(element.plainText).toContain('Writer OCR Demo');
  });

  it('creates demo writer table element', () => {
    const element = createOcrDemoWriterElement('simple-table', 'doc-demo');

    expect(element.documentFingerprint).toBe('doc-demo');
    expect(element.type).toBe('tableBox');
    expect(element.plainText).toContain('PS-001');
  });

  it('creates complete demo fixture with valid project payload', async () => {
    const fixture = await createOcrDemoFixture('simple-table');

    expect(fixture.documentFingerprint).toBe('ocr-demo-simple-table');
    expect(fixture.pdfBytes.length).toBeGreaterThan(100);
    expect(fixture.ocrResult.pages).toHaveLength(1);
    expect(fixture.projectPayload.writerInsertionQueue.candidates).toHaveLength(1);

    const validation = validateOcrProjectPayload(fixture.projectPayload);

    expect(validation.valid).toBe(true);
  });

  it('demo fixture can be exported as searchable PDF', async () => {
    const fixture = await createOcrDemoFixture('clean-text');

    const exported = await exportSearchableOcrPdf({
      pdfBytes: fixture.pdfBytes,
      ocrResult: fixture.ocrResult,
      layerMode: 'word',
      visibilityMode: 'invisible',
      disableObjectStreams: true,
    });

    expect(exported.embeddedTextItemCount).toBeGreaterThan(0);
    expect(exported.bytes.length).toBeGreaterThan(fixture.pdfBytes.length);

    const pdf = await PDFDocument.load(exported.bytes);
    expect(pdf.getPageCount()).toBe(1);
  });

  it('returns fixture text lines', () => {
    expect(getDemoTextLines('clean-text').join(' ')).toContain('Writer OCR Demo');
    expect(getDemoTextLines('engineering-note').join(' ')).toContain('Line No');
    expect(getDemoTextLines('simple-table').join(' ')).toContain('table review');
  });
});
