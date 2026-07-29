import { pdfLib } from '@/core/pdf/lazyPdfLib';

/**
 * A resolved set of all four Standard-14 variants for one font family.
 */
export interface Standard14FontGroup {
  regular: import('pdf-lib').StandardFonts;
  bold: import('pdf-lib').StandardFonts;
  italic: import('pdf-lib').StandardFonts;
  boldItalic: import('pdf-lib').StandardFonts;
}

type FamilyMap = Array<[pattern: RegExp, group: Standard14FontGroup]>;

/**
 * Mapping from CSS font-family strings (lowercased, trimmed) to Standard-14
 * font groups.  Every family the ribbon offers must appear here so the export
 * is honest — what the user picks is what lands in the PDF. Built lazily (and
 * cached) on first use so pdf-lib's StandardFonts enum isn't pulled into the
 * eagerly-loaded bundle.
 */
let familyMapPromise: Promise<FamilyMap> | null = null;

function getFamilyMap(): Promise<FamilyMap> {
  if (!familyMapPromise) {
    familyMapPromise = pdfLib().then(({ StandardFonts }) => [
      [
        /courier|monospace|courier new|lucida console/i,
        {
          regular: StandardFonts.Courier,
          bold: StandardFonts.CourierBold,
          italic: StandardFonts.CourierOblique,
          boldItalic: StandardFonts.CourierBoldOblique,
        },
      ],
      [
        /times|georgia|serif|times new roman|garamond/i,
        {
          regular: StandardFonts.TimesRoman,
          bold: StandardFonts.TimesRomanBold,
          italic: StandardFonts.TimesRomanItalic,
          boldItalic: StandardFonts.TimesRomanBoldItalic,
        },
      ],
      // Helvetica is the default — also covers Arial, Inter, IBM Plex Sans, etc.
      [
        /.*/,
        {
          regular: StandardFonts.Helvetica,
          bold: StandardFonts.HelveticaBold,
          italic: StandardFonts.HelveticaOblique,
          boldItalic: StandardFonts.HelveticaBoldOblique,
        },
      ],
    ]);
  }
  return familyMapPromise;
}

/**
 * Resolve a CSS font-family string (or undefined) to the correct Standard-14
 * font group.  The catch-all at the end always matches, so this never throws.
 */
export async function resolveStandard14Group(
  fontFamily: string | undefined,
): Promise<Standard14FontGroup> {
  const name = (fontFamily ?? '').replace(/['"]/g, '').trim();
  const familyMap = await getFamilyMap();

  for (const [pattern, group] of familyMap) {
    if (pattern.test(name)) return group;
  }

  // Unreachable — the catch-all always fires — but satisfies the type checker.
  return familyMap[familyMap.length - 1][1];
}

/**
 * Pick the right StandardFonts variant given bold/italic flags and a family.
 */
export async function pickStandard14Font(
  fontFamily: string | undefined,
  bold: boolean,
  italic: boolean,
): Promise<import('pdf-lib').StandardFonts> {
  const group = await resolveStandard14Group(fontFamily);
  if (bold && italic) return group.boldItalic;
  if (bold) return group.bold;
  if (italic) return group.italic;
  return group.regular;
}

/**
 * The font families the ribbon exposes.  Every entry here maps cleanly to a
 * Standard-14 group so the export is always faithful.
 */
export const RIBBON_FONT_FAMILIES: Array<{ label: string; value: string }> = [
  { label: 'Helvetica', value: 'Helvetica' },
  { label: 'Arial', value: 'Arial' },
  { label: 'Times New Roman', value: 'Times New Roman' },
  { label: 'Georgia', value: 'Georgia' },
  { label: 'Courier New', value: 'Courier New' },
];
