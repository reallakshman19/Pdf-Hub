import { describe, expect, it } from 'vitest';
import {
  buildPdfAXmpPacket,
  escapeXmlText,
  formatPdfInfoDate,
  parsePdfAXmpSummary,
  parsePdfInfoDateToIso,
} from '../xmpMetadata';
import { createDefaultPdfAMetadata } from '../types';

describe('xmpMetadata', () => {
  it('builds parseable UTF-8 XMP packets with PDF/A identification and escaped text', () => {
    const meta = createDefaultPdfAMetadata('Report & Plan.pdf', {
      title: 'Structural Drawing <A&B>',
      author: 'Jane "QA" Doe',
      subject: "Notes & Specs '2026'",
      keywords: 'cad, archival',
      language: 'en-US',
      createDateIso: '2026-06-15T12:30:00.500Z',
      modifyDateIso: '2026-06-15T14:45:10.900Z',
    });

    const bytes = buildPdfAXmpPacket('PDFA_2U', meta);
    const xml = new TextDecoder('utf-8').decode(bytes);
    expect(xml).toContain('<?xpacket begin="');
    expect(xml).toContain('xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"');
    expect(xml).toContain('<pdfaid:part>2</pdfaid:part>');
    expect(xml).toContain('<pdfaid:conformance>U</pdfaid:conformance>');
    expect(xml).not.toContain('<A&B>');

    const parsed = parsePdfAXmpSummary(xml);
    expect(parsed.hasXmpPacket).toBe(true);
    expect(parsed.pdfaPart).toBe(2);
    expect(parsed.pdfaConformance).toBe('U');
    expect(parsed.title).toBe('Structural Drawing <A&B>');
    expect(parsed.author).toBe('Jane "QA" Doe');
    expect(parsed.subject).toBe("Notes & Specs '2026'");
    expect(parsed.keywords).toBe('cad, archival');
    expect(parsed.createDateIso).toBe('2026-06-15T12:30:00Z');
    expect(parsed.modifyDateIso).toBe('2026-06-15T14:45:10Z');
  });

  it('strips invalid XML control chars and round-trips PDF /Info dates', () => {
    expect(escapeXmlText('Hello\u0000\u0007World')).toBe('HelloWorld');
    const formatted = formatPdfInfoDate('2026-11-25T05:06:07Z');
    expect(formatted).toBe('D:20261125050607Z');
    expect(parsePdfInfoDateToIso(formatted)).toBe('2026-11-25T05:06:07Z');
    expect(parsePdfInfoDateToIso("D:20261125070607+02'00'")).toBe('2026-11-25T05:06:07Z');
  });
});
