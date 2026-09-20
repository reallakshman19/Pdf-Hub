import fs from 'node:fs/promises';
import path from 'node:path';
import {
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFString,
  StandardFonts,
  degrees,
  rgb,
} from 'pdf-lib';

const ROOT = process.cwd();
const MANIFEST_PATH =
  path.join(
    ROOT,
    'fidelity/phase9/manifest.json',
  );
const OUTPUT_DIR =
  path.join(
    ROOT,
    'fidelity/phase9/generated',
  );

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

function assertGeneratedEntry(
  manifest,
  id,
) {
  const entry =
    manifest.fixtures.find(
      (fixture) => fixture.id === id,
    );
  if (!entry) {
    throw new Error(
      `Missing manifest fixture ${id}`,
    );
  }
  if (
    entry.availability !== 'generated'
    || !entry.artifactPath
    || entry.generatorId !== id
  ) {
    throw new Error(
      `Fixture ${id} is not bound to its deterministic generator.`,
    );
  }
  return entry;
}

async function nativeTextBasic() {
  const doc =
    await PDFDocument.create();
  const font =
    await doc.embedFont(
      StandardFonts.Helvetica,
    );

  for (let index = 0; index < 2; index += 1) {
    const page =
      doc.addPage([612, 792]);
    page.drawText(
      `Phase 9 native text page ${index + 1}`,
      {
        x: 72,
        y: 700,
        size: 16,
        font,
        color: rgb(0, 0, 0),
      },
    );
    page.drawText(
      `semantic-token-PH9-${index + 1}`,
      {
        x: 72,
        y: 660,
        size: 11,
        font,
      },
    );
  }

  return doc.save({
    useObjectStreams: false,
  });
}

async function scannedImageOnly() {
  const doc =
    await PDFDocument.create();
  const image =
    await doc.embedPng(PNG_1X1);
  const page =
    doc.addPage([612, 792]);

  page.drawImage(image, {
    x: 0,
    y: 0,
    width: 612,
    height: 792,
  });

  return doc.save({
    useObjectStreams: false,
  });
}

async function mixedGeometryBoxes() {
  const doc =
    await PDFDocument.create();
  const font =
    await doc.embedFont(
      StandardFonts.Helvetica,
    );

  const first =
    doc.addPage([612, 792]);
  first.drawText(
    'letter-portrait',
    { x: 72, y: 700, size: 12, font },
  );

  const second =
    doc.addPage([792, 612]);
  second.setRotation(degrees(90));
  second.drawText(
    'landscape-rotated',
    { x: 72, y: 520, size: 12, font },
  );

  const third =
    doc.addPage([700, 900]);
  third.setMediaBox(
    10,
    20,
    700,
    900,
  );
  third.setCropBox(
    30,
    50,
    620,
    780,
  );
  third.drawText(
    'non-zero-box-origin',
    { x: 72, y: 760, size: 12, font },
  );

  return doc.save({
    useObjectStreams: false,
  });
}

function installNestedOutlines(
  doc,
) {
  const firstPage =
    doc.getPage(0);
  const secondPage =
    doc.getPage(1);

  const outlines =
    doc.context.obj({
      Type: 'Outlines',
      Count: 2,
  });
  const outlinesRef =
    doc.context.register(outlines);

  const child =
    doc.context.obj({
      Title:
        PDFString.of(
          'Nested destination',
        ),
      Dest: [
        secondPage.ref,
        PDFName.of('Fit'),
      ],
  });
  const childRef =
    doc.context.register(child);

  const parent =
    doc.context.obj({
      Title:
        PDFString.of(
          'Parent destination',
        ),
      Parent: outlinesRef,
      Dest: [
        firstPage.ref,
        PDFName.of('Fit'),
      ],
      First: childRef,
      Last: childRef,
      Count: 1,
  });
  const parentRef =
    doc.context.register(parent);

  child.set(
    PDFName.of('Parent'),
    parentRef,
  );
  outlines.set(
    PDFName.of('First'),
    parentRef,
  );
  outlines.set(
    PDFName.of('Last'),
    parentRef,
  );
  doc.catalog.set(
    PDFName.of('Outlines'),
    outlinesRef,
  );
}

async function nestedOutlines() {
  const doc =
    await PDFDocument.create();
  const font =
    await doc.embedFont(
      StandardFonts.Helvetica,
    );
  for (
    const label
    of ['outline-parent', 'outline-child']
  ) {
    const page =
      doc.addPage([612, 792]);
    page.drawText(label, {
      x: 72,
      y: 700,
      size: 14,
      font,
    });
  }
  installNestedOutlines(doc);

  return doc.save({
    useObjectStreams: false,
  });
}

function installPageLabels(
  doc,
) {
  const cover =
    doc.context.obj({});
  cover.set(
    PDFName.of('P'),
    PDFHexString.fromText(
      'Cover',
    ),
  );

  const body =
    doc.context.obj({});
  body.set(
    PDFName.of('S'),
    PDFName.of('D'),
  );
  body.set(
    PDFName.of('P'),
    PDFHexString.fromText(
      'A-',
    ),
  );

  const nums =
    doc.context.obj([]);
  nums.push(PDFNumber.of(0));
  nums.push(cover);
  nums.push(PDFNumber.of(1));
  nums.push(body);

  const tree =
    doc.context.obj({});
  tree.set(
    PDFName.of('Nums'),
    nums,
  );
  doc.catalog.set(
    PDFName.of('PageLabels'),
    tree,
  );
}

function installTextAnnotation(
  doc,
  page,
) {
  const annotation =
    doc.context.obj({
      Type: 'Annot',
      Subtype: 'Text',
      Rect: [
        PDFNumber.of(72),
        PDFNumber.of(620),
        PDFNumber.of(96),
        PDFNumber.of(644),
      ],
      Contents:
        PDFString.of(
          'Phase 9 fixture note',
        ),
      NM:
        PDFString.of(
          'phase9-note',
        ),
      F: 4,
  });
  const ref =
    doc.context.register(
      annotation,
    );
  const annots =
    doc.context.obj([ref]);
  page.node.set(
    PDFName.of('Annots'),
    annots,
  );
}

async function catalogStructures() {
  const doc =
    await PDFDocument.create();
  const font =
    await doc.embedFont(
      StandardFonts.Helvetica,
    );
  const pages = [
    doc.addPage([612, 792]),
    doc.addPage([612, 792]),
    doc.addPage([612, 792]),
  ];

  pages.forEach(
    (page, index) => {
      page.drawText(
        `catalog-structure-page-${index + 1}`,
        {
          x: 72,
          y: 700,
          size: 12,
          font,
        },
      );
    },
  );

  installPageLabels(doc);

  const form = doc.getForm();
  const field =
    form.createTextField(
      'project.code',
    );
  field.setText('PH9-001');
  field.addToPage(pages[0], {
    x: 72,
    y: 620,
    width: 180,
    height: 24,
    font,
  });
  form.updateFieldAppearances(font);

  installTextAnnotation(
    doc,
    pages[1],
  );

  await doc.attach(
    new TextEncoder().encode(
      'Phase 9 deterministic attachment\n',
    ),
    'phase9-note.txt',
    {
      mimeType:
        'text/plain',
      description:
        'Phase 9 deterministic fixture attachment',
      creationDate:
        new Date(
          '2026-01-01T00:00:00.000Z',
        ),
      modificationDate:
        new Date(
          '2026-01-01T00:00:00.000Z',
        ),
    },
  );

  doc.setTitle(
    'Phase 9 Catalog Structures',
  );
  doc.setAuthor('PDF Hub');
  doc.setSubject(
    'Deterministic fidelity fixture',
  );
  doc.setCreationDate(
    new Date(
      '2026-01-01T00:00:00.000Z',
    ),
  );
  doc.setModificationDate(
    new Date(
      '2026-01-01T00:00:00.000Z',
    ),
  );

  return doc.save({
    useObjectStreams: false,
  });
}

function buildClassicPdf(
  objectBodies,
  options = {},
) {
  const chunks = [
    Buffer.from(
      '%PDF-1.7\n%Phase9\n',
      'ascii',
    ),
  ];
  const offsets = [0];

  objectBodies.forEach(
    (body, index) => {
      offsets[index + 1] =
        chunks.reduce(
          (sum, chunk) =>
            sum + chunk.byteLength,
          0,
        );
      chunks.push(
        Buffer.from(
          `${index + 1} 0 obj\n${body}\nendobj\n`,
          'ascii',
        ),
      );
    },
  );

  const xrefOffset =
    chunks.reduce(
      (sum, chunk) =>
        sum + chunk.byteLength,
      0,
    );
  const lines = [
    'xref',
    `0 ${objectBodies.length + 1}`,
    '0000000000 65535 f ',
  ];
  for (
    let objectNumber = 1;
    objectNumber
      <= objectBodies.length;
    objectNumber += 1
  ) {
    const offset =
      options.xrefOffsetOverrides
        ?.get(objectNumber)
      ?? offsets[objectNumber];
    lines.push(
      `${String(offset).padStart(10, '0')} 00000 n `,
    );
  }
  lines.push(
    'trailer',
    `<< /Size ${objectBodies.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  );
  chunks.push(
    Buffer.from(
      lines.join('\n'),
      'ascii',
    ),
  );
  return Buffer.concat(chunks);
}

function streamObject(content) {
  const bytes =
    Buffer.from(content, 'ascii');
  return `<< /Length ${bytes.byteLength} >>\nstream\n${content}\nendstream`;
}

async function taggedStructureTree() {
  const content =
    '/P <</MCID 0>> BDC\n'
    + 'BT /F1 16 Tf 72 700 Td '
    + '(Tagged Phase 9 text) Tj ET\n'
    + 'EMC';

  return buildClassicPdf([
    '<< /Type /Catalog /Pages 2 0 R /StructTreeRoot 6 0 R /MarkInfo << /Marked true >> >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /StructParents 0 >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    streamObject(content),
    '<< /Type /StructTreeRoot /K 7 0 R /ParentTree 8 0 R /ParentTreeNextKey 1 >>',
    '<< /Type /StructElem /S /P /P 6 0 R /Pg 3 0 R /K 0 >>',
    '<< /Nums [0 [7 0 R]] >>',
  ]);
}

async function malformedReadableXref() {
  const content =
    'BT /F1 14 Tf 72 700 Td '
    + '(Malformed xref but readable page) Tj ET';

  return buildClassicPdf(
    [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      streamObject(content),
      '<< /Phase9UnusedObject true >>',
    ],
    {
      // Object 6 is deliberately unreachable and its xref offset is wrong.
      // A tolerant reader can render the required page tree without fetching it.
      xrefOffsetOverrides:
        new Map([[6, 1]]),
    },
  );
}

function parseLastTrailerValue(
  source,
  pattern,
  label,
) {
  const trailerIndex =
    source.lastIndexOf('trailer');
  if (trailerIndex < 0) {
    throw new Error(
      `Incremental fixture base has no trailer for ${label}.`,
    );
  }
  const trailer =
    source.slice(trailerIndex);
  const match =
    trailer.match(pattern);
  if (!match) {
    throw new Error(
      `Incremental fixture base trailer has no ${label}.`,
    );
  }
  return match;
}

async function incrementalUpdateInput() {
  const baseBytes =
    await nativeTextBasic();
  const base =
    Buffer.from(baseBytes);
  const source =
    base.toString('latin1');

  const sizeMatch =
    parseLastTrailerValue(
      source,
      /\/Size\s+(\d+)/,
      'Size',
    );
  const rootMatch =
    parseLastTrailerValue(
      source,
      /\/Root\s+(\d+)\s+(\d+)\s+R/,
      'Root',
    );
  const startMatches = [
    ...source.matchAll(
      /startxref\s+(\d+)\s+%%EOF/g,
    ),
  ];
  const previousStart =
    startMatches.at(-1)?.[1];
  if (!previousStart) {
    throw new Error(
      'Incremental fixture base has no startxref.',
    );
  }

  const nextObjectNumber =
    Number(sizeMatch[1]);
  const objectOffset =
    base.byteLength;
  const incrementalObject =
    Buffer.from(
      `\n${nextObjectNumber} 0 obj\n<< /Producer (PDF Hub Phase 9) /Phase9Revision (incremental-update-1) >>\nendobj\n`,
      'ascii',
    );
  const xrefOffset =
    objectOffset
    + incrementalObject.byteLength;
  const xrefEntry =
    String(objectOffset)
      .padStart(10, '0');

  const suffix =
    Buffer.from(
      `xref\n${nextObjectNumber} 1\n${xrefEntry} 00000 n \ntrailer\n<< /Size ${nextObjectNumber + 1} /Root ${rootMatch[1]} ${rootMatch[2]} R /Info ${nextObjectNumber} 0 R /Prev ${previousStart} >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
      'ascii',
    );

  return Buffer.concat([
    base,
    incrementalObject,
    suffix,
  ]);
}

async function objectStreamInput() {
  const doc =
    await PDFDocument.create();
  const font =
    await doc.embedFont(
      StandardFonts.Helvetica,
    );
  for (
    let index = 0;
    index < 4;
    index += 1
  ) {
    const page =
      doc.addPage([612, 792]);
    page.drawText(
      `object-stream-page-${index + 1}`,
      {
        x: 72,
        y: 700,
        size: 12,
        font,
      },
    );
  }
  return doc.save({
    useObjectStreams: true,
  });
}

const GENERATORS = {
  'native-text-basic':
    nativeTextBasic,
  'scanned-image-only':
    scannedImageOnly,
  'mixed-geometry-boxes':
    mixedGeometryBoxes,
  'nested-outlines':
    nestedOutlines,
  'catalog-structures':
    catalogStructures,
  'object-stream-input':
    objectStreamInput,
  'incremental-update-input':
    incrementalUpdateInput,
  'tagged-structure-tree':
    taggedStructureTree,
  'malformed-readable-xref':
    malformedReadableXref,
};

async function main() {
  const manifest =
    JSON.parse(
      await fs.readFile(
        MANIFEST_PATH,
        'utf8',
      ),
    );

  await fs.mkdir(
    OUTPUT_DIR,
    { recursive: true },
  );

  for (
    const [id, generate]
    of Object.entries(GENERATORS)
  ) {
    const entry =
      assertGeneratedEntry(
        manifest,
        id,
      );
    const bytes =
      await generate();
    const destination =
      path.join(
        ROOT,
        entry.artifactPath,
      );
    await fs.mkdir(
      path.dirname(destination),
      { recursive: true },
    );
    await fs.writeFile(
      destination,
      bytes,
    );
    console.log(
      `[phase9-fidelity] generated ${entry.id} -> ${entry.artifactPath} (${bytes.length} bytes)`,
    );
  }
}

await main();
