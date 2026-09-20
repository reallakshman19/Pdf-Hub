import {
  PDFHexString,
  PDFName,
  PDFNumber,
} from 'pdf-lib';

export async function addPhase8gMetadataRichStructures(
  pdf,
  fixedDate,
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
        fixedDate,
      modificationDate:
        fixedDate,
    },
  );
}
