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

const fitTypes =
  requireFile(
    'src/core/existing-text/fitTypes.ts',
  );
const fitPolicy =
  requireFile(
    'src/core/existing-text/fitPolicy.ts',
  );
const fitAdapter =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextFit.ts',
  );
const replacementTypes =
  requireFile(
    'src/core/existing-text/replacementTypes.ts',
  );
const writer =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextReplacement.ts',
  );
const writerTests =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextReplacement.test.ts',
  );
const fitTests =
  requireFile(
    'src/adapters/pdf-text/PdfLibExistingTextFit.test.ts',
  );
const policyTests =
  requireFile(
    'src/core/existing-text/__tests__/fitPolicy.test.ts',
  );
const mutationTests =
  requireFile(
    'src/adapters/pdf-mutation/PdfLibMutationEngine.test.ts',
  );
const commandTypes =
  requireFile(
    'src/core/commands/types.ts',
  );
const docs =
  requireFile(
    '../Docs/EXISTING_PDF_TEXT_EDITING.md',
  );

requireTokens(
  'fit contract',
  fitTypes,
  [
    'EXISTING_TEXT_NATIVE_FIT_TOLERANCE_PT',
    "status:",
    "'fits'",
    "'overflows'",
    "'unmeasurable'",
    'measuredSourceWidthPt',
    'measuredReplacementWidthPt',
    'observedToMetricScale',
    'projectedReplacementAdvancePt',
    'ExistingTextReconstructedOverlayEvidence',
    "'future-reconstructed-overlay-candidate'",
  ],
);

requireTokens(
  'Standard-14 metric adapter',
  fitAdapter,
  [
    'PDFDocument.create()',
    'embedFont(',
    'widthOfTextAtSize(',
    'input.observedAdvancePt',
    '/ measuredSourceWidthPt',
    'projectedReplacementAdvancePt',
    'StandardFonts.Helvetica',
    'StandardFonts.TimesRoman',
    'StandardFonts.Courier',
  ],
);
forbidTokens(
  'metric adapter does not touch source PDF',
  fitAdapter,
  [
    'PDFDocument.load(',
    '.save(',
    'context.assign(',
    'flateStream(',
  ],
);

requireTokens(
  'native writer fit gate',
  replacementTypes + writer,
  [
    "'NATIVE_FIT_UNMEASURABLE'",
    "'NATIVE_REPLACEMENT_OVERFLOW'",
    'measureExistingTextNativeFit(',
    "fit.status === 'unmeasurable'",
    "fit.status === 'overflows'",
    'fit,',
  ],
);

const fitIndex =
  writer.indexOf(
    'measureExistingTextNativeFit(',
  );
const rewriteIndex =
  writer.indexOf(
    'replaceByteRange(',
  );
if (
  fitIndex < 0
  || rewriteIndex < 0
  || fitIndex >= rewriteIndex
) {
  failures.push(
    'writer: fit gate must occur before decoded operand rewrite',
  );
} else {
  passes.push(
    'writer: fit gate precedes decoded operand rewrite',
  );
}

requireTokens(
  'fallback policy',
  fitPolicy,
  [
    'validateExistingTextEditIntentAgainstSpan',
    "'UNSUPPORTED_SPAN'",
    "'NATIVE_REPLACEMENT_OVERFLOW'",
    "'FALLBACK_EVIDENCE_MISSING'",
    "'FALLBACK_EVIDENCE_STALE'",
    "'FALLBACK_FOREIGN_PAINT_INTERSECTION'",
    "'FALLBACK_REPLACEMENT_OUTSIDE_CLEARANCE'",
    "'future-reconstructed-overlay-candidate'",
  ],
);

forbidTokens(
  'fallback policy is not mutation authority',
  fitPolicy,
  [
    'drawVisualMasks',
    'drawText(',
    'PdfMutationSession',
    'commandBus',
    'APPLY_WORKING_COPY',
    'useWriterV2Store',
    'PDFDocument',
  ],
);

requireTokens(
  'focused fit proofs',
  fitTests
    + writerTests
    + mutationTests,
  [
    'accepts a shorter Helvetica replacement and preserves observed scale',
    'rejects a wider Helvetica replacement against the observed source advance',
    'rejects native replacement that exceeds the original observed advance',
    'rejects native overflow before mutating the active session document',
    "status: 'fits'",
  ],
);

requireTokens(
  'focused fallback proofs',
  policyTests,
  [
    'admits native replacement only with a fitting diagnostic',
    'blocks native overflow when fallback evidence is absent',
    'future overlay candidate with complete evidence',
    'reconstructed source only as a future overlay candidate',
    'rejects stale fallback evidence and foreign paint',
    'rejects replacement bounds outside the proved clearance region',
    'keeps unsupported spans explicitly blocked',
  ],
);

requireTokens(
  'canonical command remains native-only',
  commandTypes,
  [
    "'REPLACE_EXISTING_TEXT'",
  ],
);
forbidTokens(
  'no fallback command',
  commandTypes,
  [
    'RECONSTRUCTED_OVERLAY',
    'REPLACE_EXISTING_TEXT_FALLBACK',
    'MASK_AND_REDRAW_EXISTING_TEXT',
  ],
);

const componentSources =
  walkFiles('src/components')
    .filter(
      (file) =>
        /\.(ts|tsx)$/.test(file),
    )
    .map(read)
    .join('\n');

forbidTokens(
  'no Phase 13 text editing UI',
  componentSources,
  [
    'future-reconstructed-overlay-candidate',
    'NATIVE_REPLACEMENT_OVERFLOW',
    'measureExistingTextNativeFit(',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Native layout-fit gate',
    '0.25 pt numeric tolerance',
    '## Reconstructed-overlay policy contract',
    'eligibility contract, not mutation authority',
    'canonical `REPLACE_EXISTING_TEXT` command itself remains native-only',
    '### Still not exposed in UI',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 13 Existing Text Fit Policy Audit FAILED ===',
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
  '=== Phase 13 Existing Text Fit Policy Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
