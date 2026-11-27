/**
 * PDF/A XMP Metadata Packet Builder, Parser & Info-Dictionary Synchronizer.
 *
 * Implements ISO 19005-1/2/3 §6.7 metadata identification & Dublin Core / XMP / PDF
 * namespace synchronization without external XML serializer bloat.
 */

import {
  PDFA_PROFILES,
  normalizeXmpTimestamp,
  type PdfAArchivalMetadata,
  type PdfAConformanceLevel,
} from './types';
import { encodeSameRealmUtf8 } from './pfbParser';

export interface ParsedPdfAXmpSummary {
  hasXmpPacket: boolean;
  pdfaPart: number | null;
  pdfaConformance: string | null;
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  creatorTool: string | null;
  producer: string | null;
  createDateIso: string | null;
  modifyDateIso: string | null;
}

function stripDisallowedXmlChars(text: string): string {
  // Remove ASCII C0 controls disallowed by XML 1.0 (keeping tab 0x09, LF 0x0A, CR 0x0D)
  let out = '';
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (
      code === 0x09 ||
      code === 0x0a ||
      code === 0x0d ||
      (code >= 0x20 && code !== 0xfffe && code !== 0xffff)
    ) {
      out += text[i];
    }
  }
  return out;
}

export function escapeXmlText(value: string): string {
  return stripDisallowedXmlChars(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

export function unescapeXmlText(value: string): string {
  return value
    .replaceAll('&apos;', "'")
    .replaceAll('&quot;', '"')
    .replaceAll('&gt;', '>')
    .replaceAll('&lt;', '<')
    .replaceAll('&amp;', '&');
}

/**
 * Builds an uncompressed UTF-8 XMP packet declaring PDF/A part & conformance and
 * synchronized Dublin Core, XMP Basic, and Adobe PDF schema fields.
 */
export function buildPdfAXmpPacket(
  conformance: PdfAConformanceLevel,
  metadata: PdfAArchivalMetadata,
): Uint8Array {
  const profile = PDFA_PROFILES[conformance];
  const createDate = normalizeXmpTimestamp(metadata.createDateIso);
  const modifyDate = normalizeXmpTimestamp(metadata.modifyDateIso);
  const title = escapeXmlText(metadata.title);
  const author = escapeXmlText(metadata.author);
  const subject = escapeXmlText(metadata.subject);
  const keywords = escapeXmlText(metadata.keywords);
  const creatorTool = escapeXmlText(metadata.creatorTool || 'PDF Hub Archival Engine');
  const producer = escapeXmlText(metadata.producer || 'PDF Hub PDF/A Compliance Pipeline');
  const lang = escapeXmlText(metadata.language || 'x-default');

  const lines: string[] = [
    '<?xpacket begin="\uFEFF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '    <rdf:Description rdf:about=""',
    '      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"',
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '      xmlns:xmp="http://ns.adobe.com/xap/1.0/"',
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/">',
    `      <pdfaid:part>${profile.part}</pdfaid:part>`,
    `      <pdfaid:conformance>${profile.conformance}</pdfaid:conformance>`,
    '      <dc:format>application/pdf</dc:format>',
    '      <dc:title>',
    '        <rdf:Alt>',
    `          <rdf:li xml:lang="x-default">${title}</rdf:li>`,
    ...(lang !== 'x-default' ? [`          <rdf:li xml:lang="${lang}">${title}</rdf:li>`] : []),
    '        </rdf:Alt>',
    '      </dc:title>',
  ];

  if (metadata.author.trim().length > 0) {
    lines.push(
      '      <dc:creator>',
      '        <rdf:Seq>',
      `          <rdf:li>${author}</rdf:li>`,
      '        </rdf:Seq>',
      '      </dc:creator>',
    );
  }

  if (metadata.subject.trim().length > 0) {
    lines.push(
      '      <dc:description>',
      '        <rdf:Alt>',
      `          <rdf:li xml:lang="x-default">${subject}</rdf:li>`,
      '        </rdf:Alt>',
      '      </dc:description>',
    );
  }

  lines.push(
    `      <xmp:CreatorTool>${creatorTool}</xmp:CreatorTool>`,
    `      <xmp:CreateDate>${createDate}</xmp:CreateDate>`,
    `      <xmp:ModifyDate>${modifyDate}</xmp:ModifyDate>`,
    `      <xmp:MetadataDate>${modifyDate}</xmp:MetadataDate>`,
    `      <pdf:Producer>${producer}</pdf:Producer>`,
  );

  if (metadata.keywords.trim().length > 0) {
    lines.push(`      <pdf:Keywords>${keywords}</pdf:Keywords>`);
  }

  lines.push(
    '    </rdf:Description>',
    '  </rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  );

  return encodeSameRealmUtf8(lines.join('\n'));
}

function readTagOrAttr(xml: string, tag: string): string | null {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const elemMatch = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, 'i').exec(xml);
  if (elemMatch) {
    return unescapeXmlText(elemMatch[1].trim());
  }
  const attrMatch = new RegExp(`\\b${escaped}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(xml);
  if (attrMatch) {
    return unescapeXmlText((attrMatch[1] ?? attrMatch[2] ?? '').trim());
  }
  return null;
}

function readRdfContainerFirstLi(xml: string, parentTag: string): string | null {
  const escaped = parentTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockMatch = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)</${escaped}>`, 'i').exec(xml);
  if (!blockMatch) return null;
  const liMatch = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/i.exec(blockMatch[1]);
  return liMatch ? unescapeXmlText(liMatch[1].trim()) : null;
}

/**
 * Extracts PDF/A identification and core metadata fields from a decoded XMP XML packet.
 */
export function parsePdfAXmpSummary(xml: string): ParsedPdfAXmpSummary {
  const trimmed = xml.trim();
  const hasXmpPacket = trimmed.includes('xmpmeta') || trimmed.includes('rdf:RDF');
  if (!hasXmpPacket) {
    return {
      hasXmpPacket: false,
      pdfaPart: null,
      pdfaConformance: null,
      title: null,
      author: null,
      subject: null,
      keywords: null,
      creatorTool: null,
      producer: null,
      createDateIso: null,
      modifyDateIso: null,
    };
  }

  const rawPart = readTagOrAttr(trimmed, 'pdfaid:part');
  const parsedPart = rawPart !== null && /^\d+$/.test(rawPart) ? Number.parseInt(rawPart, 10) : null;
  const rawConformance = readTagOrAttr(trimmed, 'pdfaid:conformance');

  const rawCreate = readTagOrAttr(trimmed, 'xmp:CreateDate');
  const rawModify = readTagOrAttr(trimmed, 'xmp:ModifyDate');

  return {
    hasXmpPacket: true,
    pdfaPart: parsedPart,
    pdfaConformance: rawConformance ? rawConformance.toUpperCase() : null,
    title: readRdfContainerFirstLi(trimmed, 'dc:title'),
    author: readRdfContainerFirstLi(trimmed, 'dc:creator'),
    subject: readRdfContainerFirstLi(trimmed, 'dc:description'),
    keywords: readTagOrAttr(trimmed, 'pdf:Keywords'),
    creatorTool: readTagOrAttr(trimmed, 'xmp:CreatorTool'),
    producer: readTagOrAttr(trimmed, 'pdf:Producer'),
    createDateIso: rawCreate ? normalizeXmpTimestamp(rawCreate) : null,
    modifyDateIso: rawModify ? normalizeXmpTimestamp(rawModify) : null,
  };
}

/**
 * Formats a JavaScript Date into canonical PDF Date syntax (`D:YYYYMMDDHHmmSSZ`)
 * matching ISO UTC whole seconds in XMP.
 */
export function formatPdfInfoDate(isoString: string): string {
  const date = new Date(isoString);
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return (
    `D:${safe.getUTCFullYear()}` +
    `${pad2(safe.getUTCMonth() + 1)}` +
    `${pad2(safe.getUTCDate())}` +
    `${pad2(safe.getUTCHours())}` +
    `${pad2(safe.getUTCMinutes())}` +
    `${pad2(safe.getUTCSeconds())}Z`
  );
}

/**
 * Parses a PDF `/Info` date string (`D:YYYYMMDDHHmmSSOHH'mm'`) into normalized ISO UTC.
 */
export function parsePdfInfoDateToIso(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  const match = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Z+-]\d{2}'?\d{2}'?|Z)?$/.exec(
    cleaned,
  );
  if (!match) {
    const fallback = new Date(cleaned);
    return Number.isNaN(fallback.getTime()) ? null : normalizeXmpTimestamp(fallback);
  }
  const year = Number(match[1]);
  const month = Number(match[2] ?? '01') - 1;
  const day = Number(match[3] ?? '01');
  const hour = Number(match[4] ?? '00');
  const min = Number(match[5] ?? '00');
  const sec = Number(match[6] ?? '00');
  const tz = match[7] ?? 'Z';

  let utcMs = Date.UTC(year, month, day, hour, min, sec);
  if (tz !== 'Z') {
    const tzMatch = /^([+-])(\d{2})'?(\d{2})'?$/.exec(tz);
    if (tzMatch) {
      const sign = tzMatch[1] === '-' ? -1 : 1;
      const offsetMinutes = sign * (Number(tzMatch[2]) * 60 + Number(tzMatch[3]));
      utcMs -= offsetMinutes * 60_000;
    }
  }
  return normalizeXmpTimestamp(new Date(utcMs));
}
