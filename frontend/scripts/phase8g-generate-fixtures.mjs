import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  PDFDocument,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';

const root = process.cwd();
const budgetPath =
  path.join(
    root,
    'performance',
    'phase8g-budget-manifest.json',
  );
const budget =
  JSON.parse(
    fs.readFileSync(
      budgetPath,
      'utf8',
    ),
  );

const FIXED_DATE =
  new Date('2026-09-20T00:00:00.000Z');
const DEFAULT_OUT =
  path.join(
    root,
    'performance',
    'fixtures',
    'phase8g',
  );
const PNG_1X1 =
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=',
    'base64',
  );

function parseArgs(argv) {
  const options = {
    out: DEFAULT_OUT,
    kinds: null,
    pageCounts: null,
  };

  for (const arg of argv) {
    if (arg.startsWith('--out=')) {
      options.out =
        path.resolve(
          root,
          arg.slice('--out='.length),
        );
    } else if (
      arg.startsWith('--kinds=')
    ) {
      options.kinds =
        new Set(
          arg
            .slice('--kinds='.length)
            .split(',')
            .filter(Boolean),
        );
    } else if (
      arg.startsWith('--pages=')
    ) {
      options.pageCounts =
        new Set(
          arg
            .slice('--pages='.length)
            .split(',')
            .map(Number)
            .filter(
              (value) =>
                Number.isInteger(value)
                && value > 0,
            ),
        );
    }
  }

  return options;
}

function selectedMatrix(options) {
  return Object.entries(
    budget.fixtures,
  ).flatMap(
    ([kind, fixture]) => {
      if (
        options.kinds
        && !options.kinds.has(kind)
      ) {
        return [];
      }

      return fixture.page_counts
        .filter(
          (pageCount) =>
            !options.pageCounts
            || options.pageCounts
              .has(pageCount),
        )
        .map(
          (pageCount) => ({
            kind,
            pageCount,
          }),
        );
    },
  );
}

function setDeterministicMetadata(
  pdf,
  kind,
  pageCount,
) {
  pdf.setTitle(
    `Phase 8G ${kind} ${pageCount} pages`,
  );
  pdf.setAuthor('Pdf-Hub');
  pdf.setSubject(
    'Deterministic Phase 8G performance fixture',
  );
  pdf.setKeywords([
    'phase8g',
    kind,
    String(pageCount),
  ]);
  pdf.setCreator(
    'Pdf-Hub Phase 8G fixture generator',
  );
  pdf.setProducer(
    'Pdf-Hub Phase 8G fixture generator',
  );
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
}

function pageSizeFor(
  kind,
  pageIndex,
) {
  if (kind !== 'mixed_geometry') {
    return [595.28, 841.89];
  }

  const sizes = [
    [595.28, 841.89],
    [612, 792],
    [841.89, 595.28],
    [420, 595],
  ];
  return sizes[
    pageIndex % sizes.length
  ];
}

function drawNativeText(
  page,
  font,
  pageNumber,
) {
  page.drawText(
    `phase8g-needle native page ${pageNumber}`,
    {
      x: 36,
      y: page.getHeight() - 64,
      size: 12,
      font,
      color: rgb(0, 0, 0),
    },
  );
  for (
    let row = 0;
    row < 12;
    row += 1
  ) {
    page.drawText(
      `deterministic text row ${row + 1} page ${pageNumber}`,
      {
        x: 36,
        y:
          page.getHeight()
          - 92
          - row * 18,
        size: 9,
        font,
      },
    );
  }
}

async function buildFixture(
  kind,
  pageCount,
) {
  const pdf =
    await PDFDocument.create();
  setDeterministicMetadata(
    pdf,
    kind,
    pageCount,
  );

  const font =
    await pdf.embedFont(
      StandardFonts.Helvetica,
    );
  const image =
    kind === 'image_heavy'
    || kind === 'scanned_image_only'
      ? await pdf.embedPng(
          PNG_1X1,
        )
      : null;

  for (
    let index = 0;
    index < pageCount;
    index += 1
  ) {
    const page =
      pdf.addPage(
        pageSizeFor(
          kind,
          index,
        ),
      );
    const pageNumber = index + 1;

    if (kind === 'native_text') {
      drawNativeText(
        page,
        font,
        pageNumber,
      );
    } else if (
      kind === 'image_heavy'
    ) {
      for (
        let tile = 0;
        tile < 24;
        tile += 1
      ) {
        const column = tile % 4;
        const row =
          Math.floor(tile / 4);
        page.drawImage(
          image,
          {
            x: 24 + column * 135,
            y:
              page.getHeight()
              - 150
              - row * 105,
            width: 120,
            height: 90,
          },
        );
      }
    } else if (
      kind === 'scanned_image_only'
    ) {
      page.drawImage(
        image,
        {
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: page.getHeight(),
        },
      );
    } else if (
      kind === 'mixed_geometry'
    ) {
      page.setRotation(
        degrees(
          [0, 90, 180, 270][
            index % 4
          ],
        ),
      );
      drawNativeText(
        page,
        font,
        pageNumber,
      );
    } else if (
      kind === 'metadata_rich'
    ) {
      drawNativeText(
        page,
        font,
        pageNumber,
      );
    } else {
      throw new Error(
        `Unsupported fixture kind: ${kind}`,
      );
    }
  }

  if (
    kind === 'metadata_rich'
    && pdf.getPageCount() > 0
  ) {
    const form = pdf.getForm();
    const field =
      form.createTextField(
        'phase8g-metadata-field',
      );
    field.setText(
      'deterministic form value',
    );
    field.addToPage(
      pdf.getPage(0),
      {
        x: 36,
        y: 36,
        width: 180,
        height: 24,
      },
    );
  }

  return new Uint8Array(
    await pdf.save({
      useObjectStreams: false,
      addDefaultPage: false,
      objectsPerTick: 50,
    }),
  );
}

function sha256(bytes) {
  return crypto
    .createHash('sha256')
    .update(bytes)
    .digest('hex');
}

async function main() {
  const options =
    parseArgs(
      process.argv.slice(2),
    );
  const matrix =
    selectedMatrix(options);

  if (matrix.length === 0) {
    throw new Error(
      'No Phase 8G fixture variants selected.',
    );
  }

  fs.mkdirSync(
    options.out,
    { recursive: true },
  );

  const generated = [];

  for (
    const { kind, pageCount }
    of matrix
  ) {
    const bytes =
      await buildFixture(
        kind,
        pageCount,
      );
    const filename =
      `${kind}-${pageCount}.pdf`;
    fs.writeFileSync(
      path.join(
        options.out,
        filename,
      ),
      bytes,
    );
    generated.push({
      fixture_id:
        `phase8g:${kind}:${pageCount}`,
      kind,
      page_count: pageCount,
      filename,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
    });
  }

  const manifest = {
    schema_version:
      'phase8g-fixture-manifest-v1',
    generator:
      'scripts/phase8g-generate-fixtures.mjs',
    generated,
  };
  fs.writeFileSync(
    path.join(
      options.out,
      'manifest.json',
    ),
    JSON.stringify(
      manifest,
      null,
      2,
    ) + '\n',
  );

  console.log(
    `[phase8g-fixtures] generated ${generated.length} fixture(s) in ${options.out}`,
  );
}

await main();
