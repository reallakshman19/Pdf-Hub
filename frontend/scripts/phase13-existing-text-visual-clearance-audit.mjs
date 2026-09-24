#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function requireFile(relativePath) {
  const fullPath =
    path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(
      `missing file: ${relativePath}`,
    );
    return '';
  }
  passes.push(
    `file: ${relativePath}`,
  );
  return read(relativePath);
}

function requireTokens(label, source, tokens) {
  for (const token of tokens) {
    if (!source.includes(token)) {
      failures.push(
        `${label}: missing token ${JSON.stringify(token)}`,
      );
    } else {
      passes.push(
        `${label}: ${token}`,
      );
    }
  }
}

function forbidTokens(label, source, tokens) {
  for (const token of tokens) {
    if (source.includes(token)) {
      failures.push(
        `${label}: forbidden token ${JSON.stringify(token)}`,
      );
    } else {
      passes.push(
        `${label}: no ${token}`,
      );
    }
  }
}

function walkFiles(relativeDir) {
  const absolute =
    path.join(root, relativeDir);
  if (!fs.existsSync(absolute)) {
    return [];
  }
  return fs.readdirSync(
    absolute,
    { withFileTypes: true },
  ).flatMap((entry) => {
    const child =
      path.join(
        relativeDir,
        entry.name,
      );
    return entry.isDirectory()
      ? walkFiles(child)
      : [child];
  });
}

const scanner =
  requireFile(
    'src/core/existing-text/visualClearanceScanner.ts',
  );
const types =
  requireFile(
    'src/core/existing-text/visualClearanceTypes.ts',
  );
const lexer =
  requireFile(
    'src/core/existing-text/contentStreamScanner.ts',
  );
const adapter =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextVisualClearance.ts',
  );
const font =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextFont.ts',
  );
const fitTypes =
  requireFile(
    'src/core/existing-text/fitTypes.ts',
  );
const fitPolicy =
  requireFile(
    'src/core/existing-text/fitPolicy.ts',
  );
const scannerTests =
  requireFile(
    'src/core/existing-text/__tests__/visualClearanceScanner.test.ts',
  );
const adapterTests =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextVisualClearance.test.ts',
  );
const docs =
  requireFile(
    '../Docs/EXISTING_PDF_TEXT_EDITING.md',
  );

requireTokens(
  'shared content lexer',
  lexer,
  [
    'export interface ExistingTextContentToken',
    'export function lexExistingTextContentStream',
    'export function existingTextBytesToLatin1',
  ],
);

requireTokens(
  'paint scanner proof grammar',
  scanner,
  [
    'scanExistingTextVisualClearancePaint',
    "'NON_IDENTITY_TRANSFORM'",
    "'FOREIGN_PAINT_OPERATOR'",
    "'EXTRA_TEXT_SHOW'",
    "'CLIPPING_UNSUPPORTED'",
    "'UNSUPPORTED_GRAPHICS_STATE'",
    "'BACKGROUND_MISSING'",
    "'BACKGROUND_DOES_NOT_COVER_CLEARANCE'",
    "case 'rg':",
    "case 'g':",
    "case 're':",
    "case 'f':",
    "case 'Tj':",
  ],
);

requireTokens(
  'clearance result contract',
  types,
  [
    "'single-stream-solid-background-target-text-only'",
    "'MULTIPLE_CONTENT_STREAMS'",
    "'FONT_RESOURCE_UNSUPPORTED'",
    "'PDF_ANALYSIS_FAILED'",
    'ExistingTextReconstructedOverlayEvidence',
    'nativeFit',
  ],
);

requireTokens(
  'read-only PDF analyzer',
  adapter,
  [
    'analyzeExistingTextVisualClearance',
    'validateExistingTextEditIntentAgainstSpan',
    'readExistingTextPageContentStreamsFromDocument',
    'matchExistingTextSpanToContentStream',
    'resolveExistingTextStandard14BaseFont',
    'measureExistingTextNativeFit',
    "nativeFit.status",
    "'overflows'",
    'scanExistingTextVisualClearancePaint',
    "sourceCoverage:",
    "'proved'",
    'foreignPaintIntersections: 0',
  ],
);

forbidTokens(
  'clearance analyzer has no mutation authority',
  adapter,
  [
    '.save(',
    'context.assign(',
    'flateStream(',
    'replaceByteRange(',
    'commitDocumentMutation',
    'commandBus',
    'PdfMutationSession',
    'drawVisualMasks',
    'drawText(',
    'useWriterV2Store',
    'useHistoryStore',
  ],
);

forbidTokens(
  'clearance analyzer has no raster heuristic',
  adapter + scanner,
  [
    'canvas',
    'Canvas',
    'ImageData',
    'getImageData',
    'renderPage',
    'getViewport',
    'pixel',
  ],
);

requireTokens(
  'shared font admission',
  font,
  [
    'resolveExistingTextStandard14BaseFont',
    'Type1',
    'WinAnsiEncoding',
    'Helvetica',
    'Times-Roman',
    'Courier',
  ],
);

requireTokens(
  'fit identity binding',
  fitTypes + fitPolicy,
  [
    'sourceText: string',
    'replacementText: string',
    "'NATIVE_FIT_IDENTITY_MISMATCH'",
    'fit.sourceText',
    'fit.replacementText',
  ],
);

requireTokens(
  'pure scanner tests',
  scannerTests,
  [
    'proves one solid background rectangle plus the exact target text only',
    'supports explicit DeviceGray solid backgrounds',
    'rejects extra path paint',
    'rejects an additional text show',
    'rejects non-identity graphics transforms',
    'rejects missing background paint',
    'rejects a background that does not cover the requested clearance',
  ],
);

requireTokens(
  'generated PDF integration',
  adapterTests,
  [
    'proves revision-bound visual clearance for a simple native overflow without mutating input bytes',
    'feeds proved clearance directly into the future-overlay eligibility policy',
    'does not claim generic reconstructed candidates without exact source-paint provenance',
    'does not produce evidence without an explicit solid background paint',
    'rejects pages with more than one decoded content stream',
    'rejects stale revision identity before PDF analysis',
    'does not produce fallback evidence when the replacement already fits natively',
  ],
);

const commandSources =
  [
    'src/core/commands/types.ts',
    'src/core/commands/dispatch.ts',
    'src/core/pdf-mutation/types.ts',
    'src/adapters/pdf-mutation/PdfLibMutationEngine.ts',
  ].map(read).join('\n');

forbidTokens(
  'no reconstructed overlay mutation surface',
  commandSources,
  [
    'RECONSTRUCTED_OVERLAY',
    'MASK_AND_REDRAW_EXISTING_TEXT',
    'applyReconstructedExistingText',
  ],
);

const components =
  walkFiles('src/components')
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file),
    )
    .map(read)
    .join('\n');

forbidTokens(
  'no visual-clearance UI exposure',
  components,
  [
    'analyzeExistingTextVisualClearance',
    'visualClearanceScanner',
    'future-reconstructed-overlay-candidate',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Read-only visual-clearance evidence producer',
    'exact source-paint provenance',
    'zero foreign-paint count',
    'does **not** prove generic',
    'must revalidate the evidence against the active revision before mutation',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Visual Clearance Audit FAILED ===',
  );
  failures.forEach(
    (failure) =>
      console.error(
        `[FAIL] ${failure}`,
      ),
  );
  console.error(
    `${passes.length} check(s) passed before failure.`,
  );
  process.exit(1);
}

console.log(
  '=== Phase 13 Existing Text Visual Clearance Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
