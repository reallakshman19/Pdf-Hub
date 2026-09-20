import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';

import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
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
const RASTER_SIZE = 128;
const PNG_SIGNATURE =
  Buffer.from([
    137, 80, 78, 71,
    13, 10, 26, 10,
  ]);

const CRC_TABLE =
  Array.from(
    { length: 256 },
    (_, index) => {
      let value = index;
      for (
        let bit = 0;
        bit < 8;
        bit += 1
      ) {
        value =
          value & 1
            ? 0xedb88320
              ^ (value >>> 1)
            : value >>> 1;
      }
      return value >>> 0;
    },
  );

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value =
      CRC_TABLE[
        (value ^ byte) & 0xff
      ]
      ^ (value >>> 8);
  }
  return (
    value ^ 0xffffffff
  ) >>> 0;
}

function pngChunk(
  type,
  data,
) {
  const typeBytes =
    Buffer.from(
      type,
      'ascii',
    );
  const length =
    Buffer.alloc(4);
  length.writeUInt32BE(
    data.length,
    0,
  );
  const crc =
    Buffer.alloc(4);
  crc.writeUInt32BE(
    crc32(
      Buffer.concat([
        typeBytes,
        data,
      ]),
    ),
    0,
  );
  return Buffer.concat([
    length,
    typeBytes,
    data,
    crc,
  ]);
}

function deterministicRasterPng(
  seed,
) {
  const width = RASTER_SIZE;
  const height = RASTER_SIZE;
  const raw =
    Buffer.alloc(
      height
      * (
        1
        + width * 4
      ),
    );
  let state =
    (
      seed * 2654435761
      + 1013904223
    ) >>> 0;
  let offset = 0;

  for (
    let y = 0;
    y < height;
    y += 1
  ) {
    raw[offset] = 0;
    offset += 1;
    for (
      let x = 0;
      x < width;
      x += 1
    ) {
      state =
        (
          Math.imul(
            state,
            1664525,
          )
          + 1013904223
        ) >>> 0;
      raw[offset] =
        state & 0xff;
      raw[offset + 1] =
        (state >>> 8)
        & 0xff;
      raw[offset + 2] =
        (
          state >>> 16
          ^ x
          ^ y
        ) & 0xff;
      raw[offset + 3] =
        255;
      offset += 4;
    }
  }

  const ihdr =
    Buffer.alloc(13);
  ihdr.writeUInt32BE(
    width,
    0,
  );
  ihdr.writeUInt32BE(
    height,
    4,
  );
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk(
      'IDAT',
      zlib.deflateSync(
        raw,
        {
          level: 6,
        },
      ),
    ),
    pngChunk(
      'IEND',
      Buffer.alloc(0),
    ),
  ]);
}

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

async function addMetadataRichStructures(
  pdf,
) {
  const firstPage =
    pdf.getPage(0);

  const labelDict =
    pdf.context.obj({});
  labelDict.set(
    PDFName.of('S'),
    PDFName.of('D'),
  );
  labelDict.set(
    PDFName.of('P'),
    PDFHexString.fromText(
      'P-',
    ),
  );
  const nums =
    pdf.context.obj([]);
  nums.push(PDFNumber.of(0));
  nums.push(labelDict);
  const pageLabels =
    pdf.context.obj({});
  pageLabels.set(
    PDFName.of('Nums'),
    nums,
  );
  pdf.catalog.set(
    PDFName.of('PageLabels'),
    pageLabels,
  );

  const annotation =
    pdf.context.obj({});
  annotation.set(
    PDFName.of('Type'),
    PDFName.of('Annot'),
  );
  annotation.set(
    PDFName.of('Subtype'),
    PDFName.of('Text'),
  );
  annotation.set(
    PDFName.of('Rect'),
    pdf.context.obj([
      36,
      72,
      54,
      90,
    ]),
  );
  annotation.set(
    PDFName.of('Contents'),
    PDFHexString.fromText(
      'Phase 8G metadata annotation',
    ),
  );
  const annotationRef =
    pdf.context.register(
      annotation,
    );
  firstPage.node.set(
    PDFName.of('Annots'),
    pdf.context.obj([
      annotationRef,
    ]),
  );

  const outlines =
    pdf.context.obj({});
  const outlinesRef =
    pdf.context.register(
      outlines,
    );
  const outlineItem =
    pdf.context.obj({});
  outlineItem.set(
    PDFName.of('Title'),
    PDFHexString.fromText(
      'Phase 8G first page',
    ),
  );
  outlineItem.set(
    PDFName.of('Parent'),
    outlinesRef,
  );
  outlineItem.set(
    PDFName.of('Dest'),
    pdf.context.obj([
      firstPage.ref,
      PDFName.of('Fit'),
    ]),
  );
  const itemRef =
    pdf.context.register(
      outlineItem,
    );
  outlines.set(
    PDFName.of('Type'),
    PDFName.of('Outlines'),
  );
  outlines.set(
    PDFName.of('First'),
    itemRef,
  );
  outlines.set(
    PDFName.of('Last'),
    itemRef,
  );
  outlines.set(
    PDFName.of('Count'),
    PDFNumber.of(1),
  );
  pdf.catalog.set(
    PDFName.of('Outlines'),
    outlinesRef,
  );
  pdf.catalog.set(
    PDFName.of('PageMode'),
    PDFName.of('UseOutlines'),
  );

  await pdf.attach(
    Buffer.from(
      'Phase 8G deterministic attachment\n',
      'utf8',
    ),
    'phase8g.txt',
    {
      mimeType: 'text/plain',
      description:
        'Phase 8G deterministic attachment',
      creationDate:
        FIXED_DATE,
      modificationDate:
        FIXED_DATE,
    },
  );
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
      const image =
        await pdf.embedPng(
          deterministicRasterPng(
            pageNumber,
          ),
        );
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
      const image =
        await pdf.embedPng(
          deterministicRasterPng(
            pageNumber
            + 100000,
          ),
        );
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
    await addMetadataRichStructures(
      pdf,
    );
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
