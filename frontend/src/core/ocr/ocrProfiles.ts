export type OcrProfileId =
  | 'clean-scan'
  | 'low-quality-scan'
  | 'table-heavy'
  | 'engineering-drawing'
  | 'region-only'
  | 'force-ocr';

export interface OcrProfile {
  id: OcrProfileId;
  label: string;
  description: string;
  dpi: number;
  deskew: boolean;
  denoise: boolean;
  detectTables: boolean;
  detectLayout: boolean;
  preservePdfText: boolean;
  languageHints: string[];
}

export const OCR_PROFILES: Record<OcrProfileId, OcrProfile> = {
  'clean-scan': {
    id: 'clean-scan',
    label: 'Clean scan',
    description: 'General OCR profile for clean scanned documents.',
    dpi: 300,
    deskew: true,
    denoise: false,
    detectTables: false,
    detectLayout: true,
    preservePdfText: true,
    languageHints: ['eng'],
  },

  'low-quality-scan': {
    id: 'low-quality-scan',
    label: 'Low-quality scan',
    description: 'Higher DPI and cleanup profile for weak scans.',
    dpi: 400,
    deskew: true,
    denoise: true,
    detectTables: false,
    detectLayout: true,
    preservePdfText: true,
    languageHints: ['eng'],
  },

  'table-heavy': {
    id: 'table-heavy',
    label: 'Table-heavy document',
    description: 'OCR profile optimized for tables and grid-like content.',
    dpi: 300,
    deskew: true,
    denoise: false,
    detectTables: true,
    detectLayout: true,
    preservePdfText: true,
    languageHints: ['eng'],
  },

  'engineering-drawing': {
    id: 'engineering-drawing',
    label: 'Engineering drawing',
    description: 'OCR profile for title blocks, tags, notes, and drawing metadata.',
    dpi: 400,
    deskew: true,
    denoise: true,
    detectTables: true,
    detectLayout: true,
    preservePdfText: true,
    languageHints: ['eng'],
  },

  'region-only': {
    id: 'region-only',
    label: 'Selected region only',
    description: 'OCR only a user-selected rectangle.',
    dpi: 300,
    deskew: true,
    denoise: false,
    detectTables: false,
    detectLayout: false,
    preservePdfText: true,
    languageHints: ['eng'],
  },

  'force-ocr': {
    id: 'force-ocr',
    label: 'Force OCR',
    description: 'Run OCR even if embedded PDF text exists.',
    dpi: 300,
    deskew: true,
    denoise: false,
    detectTables: false,
    detectLayout: true,
    preservePdfText: false,
    languageHints: ['eng'],
  },
};

export function getOcrProfile(profileId: OcrProfileId): OcrProfile {
  return OCR_PROFILES[profileId];
}

export function listOcrProfiles(): OcrProfile[] {
  return Object.values(OCR_PROFILES);
}
