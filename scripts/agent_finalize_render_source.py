from pathlib import Path


path = Path("frontend/src/components/sidebar/panels/ThumbnailSidebar.tsx")
text = path.read_text()
old = r'''        const pageNumbers = Array.from(
          { length: pdfDoc.numPages },
          (_, index) => index + 1,
        );
        const result = await Promise.all(pageNumbers.map(async (pageNumber) => {
          const pagePromise = pdfDoc.getPage(pageNumber);
          const page = await raceWithAbort(
            pagePromise,
            controller.signal,
            `load PDF page ${pageNumber} metadata for thumbnail sidebar`,
            () => {
              void pagePromise
                .then((latePage) => latePage.cleanup())
                .catch(() => undefined);
            },
          );
          try {
            const viewport = page.getViewport({ scale: 1 });
            return {
              pageNumber,
              pageWidth: viewport.width,
              pageHeight: viewport.height,
            };
          } finally {
            page.cleanup();
          }
        }));
        if (!controller.signal.aborted) setThumbs(result);'''
new = r'''        const result: ThumbItem[] = [];
        const metadataBatchSize = 8;
        for (let start = 1; start <= pdfDoc.numPages; start += metadataBatchSize) {
          if (controller.signal.aborted) break;
          const pageNumbers = Array.from(
            { length: Math.min(metadataBatchSize, pdfDoc.numPages - start + 1) },
            (_, index) => start + index,
          );
          const batch = await Promise.all(pageNumbers.map(async (pageNumber) => {
            const pagePromise = pdfDoc.getPage(pageNumber);
            const page = await raceWithAbort(
              pagePromise,
              controller.signal,
              `load PDF page ${pageNumber} metadata for thumbnail sidebar`,
              () => {
                void pagePromise
                  .then((latePage) => latePage.cleanup())
                  .catch(() => undefined);
              },
            );
            try {
              const viewport = page.getViewport({ scale: 1 });
              return {
                pageNumber,
                pageWidth: viewport.width,
                pageHeight: viewport.height,
              };
            } finally {
              page.cleanup();
            }
          }));
          result.push(...batch);
        }
        if (!controller.signal.aborted) setThumbs(result);'''

if old in text:
    path.write_text(text.replace(old, new, 1))
elif "const metadataBatchSize = 8;" not in text:
    raise RuntimeError("Could not locate thumbnail metadata loading block")
