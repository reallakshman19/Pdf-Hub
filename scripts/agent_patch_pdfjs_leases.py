from pathlib import Path


recipe_path = Path('frontend/src/core/macro/psIsonote/psIsonoteRecipe.ts')
recipe = recipe_path.read_text(encoding='utf-8-sig')
recipe_start = recipe.index('export async function scanPsIsonoteReferences(')
recipe_end = recipe.index('\nfunction clamp(', recipe_start)
recipe_replacement = '''export async function scanPsIsonoteReferences(
  bytes: Uint8Array,
  mappings: PsIsonoteMapping[],
  options: PsIsonoteScanOptions,
): Promise<PsIsonoteScanResult> {
  const lease = await PdfRendererAdapter.acquireDocument(bytes);
  try {
    const [inputSha256, mappingHashEntries] = await Promise.all([
      FileAdapter.hashBytes(bytes),
      Promise.all(
        mappings.map(async (mapping) => [
          mapping.psNo,
          await computePsIsonoteMappingHash(mapping),
        ] as const),
      ),
    ]);
    const doc = lease.doc;
    const mappingHashes = new Map(mappingHashEntries);
    const scannedPages = resolvePageNumbers(
      options.selector,
      doc.numPages,
      options.currentPage,
      options.selectedPages ?? [],
    );
    const references: PsIsonoteTextReference[] = [];
    const detectedReferences: PsIsonoteTextReference[] = [];
    const skippedExisting: PsIsonoteExistingAnnotation[] = [];
    const staleExisting: PsIsonoteExistingAnnotation[] = [];
    const legacyExisting: PsIsonoteExistingAnnotation[] = [];
    const pageDimensions: Record<number, { width: number; height: number }> = {};
    const foundPsNumbers = new Set<string>();

    for (const pageNumber of scannedPages) {
      const page = await doc.getPage(pageNumber);
      try {
        const items = await PdfRendererAdapter.getPageTextItems(page, 1);
        const pageText = items.map((item) => item.text).join(' ');
        const pageMarkers = parseVersionedPsIsonoteMarkers(pageText);
        pageDimensions[pageNumber] = PdfRendererAdapter.getPageDimensions(page);
        const unresolvedReferences = findPsIsonoteReferencesInTextItems(
          items,
          mappings,
          pageNumber,
          mappingHashes,
        );
        const pageReferences = await Promise.all(
          unresolvedReferences.map(async (reference) => ({
            ...reference,
            occurrenceId: await computePsIsonoteOccurrenceId({
              inputSha256,
              pageNumber,
              psNo: reference.psNo,
              rect: reference.rect,
            }),
          })),
        );

        for (const reference of pageReferences) {
          const currentMarker = pageMarkers.find((marker) =>
            marker.psNo === reference.psNo &&
            marker.mappingHash === reference.mappingHash &&
            marker.occurrenceId === reference.occurrenceId,
          );
          const staleMarker = pageMarkers.find((marker) =>
            marker.psNo === reference.psNo &&
            marker.occurrenceId === reference.occurrenceId &&
            marker.mappingHash !== reference.mappingHash,
          );
          const markerState: PsIsonoteExistingMarkerState = currentMarker
            ? 'current'
            : staleMarker
              ? 'stale'
              : hasLegacyPsIsonoteMarker(pageText, reference.psNo)
                ? 'legacy'
                : 'none';
          const resolvedReference: PsIsonoteTextReference = {
            ...reference,
            existingMarkerState: markerState,
            ...(staleMarker ? { foundMappingHash: staleMarker.mappingHash } : {}),
          };

          detectedReferences.push(resolvedReference);
          foundPsNumbers.add(reference.psNo);

          if (options.skipExisting !== false && markerState !== 'none') {
            const existing = existingAnnotation(resolvedReference);
            if (markerState === 'current') skippedExisting.push(existing);
            if (markerState === 'stale') staleExisting.push(existing);
            if (markerState === 'legacy') legacyExisting.push(existing);
            continue;
          }

          references.push(resolvedReference);
        }
      } finally {
        page.cleanup();
      }
    }

    const missingPsNumbers = mappings
      .map((mapping) => mapping.psNo)
      .filter((psNo) => !foundPsNumbers.has(psNo));

    return {
      inputSha256,
      references,
      detectedReferences,
      missingPsNumbers,
      skippedExisting,
      staleExisting,
      legacyExisting,
      scannedPages,
      pageDimensions,
    };
  } finally {
    await lease.release();
  }
}
'''
recipe_path.write_text(
    recipe[:recipe_start] + recipe_replacement + recipe[recipe_end:],
    encoding='utf-8',
)

workspace_path = Path('frontend/src/components/workspace/DocumentWorkspace.tsx')
workspace = workspace_path.read_text(encoding='utf-8-sig')
old_import = "import { PdfRendererAdapter, type TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';"
new_import = "import { PdfRendererAdapter, type PdfDocumentLease, type TextLayerItem } from '@/adapters/pdf-renderer/PdfRendererAdapter';"
if workspace.count(old_import) != 1:
    raise SystemExit('Unexpected PdfRendererAdapter import count')
workspace = workspace.replace(old_import, new_import)

effect_start_marker = '''  React.useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!workingBytes) {'''
effect_start = workspace.index(effect_start_marker)
effect_end = workspace.index('\n\n  // Reset drawing state when tool changes', effect_start)
new_effect = '''  React.useEffect(() => {
    let cancelled = false;
    let loadFinished = false;
    let lease: PdfDocumentLease | null = null;

    const releaseLease = async () => {
      if (!lease) return;
      const currentLease = lease;
      lease = null;
      await currentLease.release();
    };

    const load = async () => {
      if (!workingBytes) {
        setPdfDoc(null);
        setSharedPdfDoc(null);
        setLoadError(null);
        loadFinished = true;
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        lease = await PdfRendererAdapter.acquireDocument(workingBytes);
        if (cancelled) return;
        const doc = lease.doc;

        setPdfDoc(doc);
        setSharedPdfDoc(doc);

        if (documentKey && !SearchIndexer.getCache(documentKey)) {
          const pagesText: Record<number, import('@/core/search/types').PageTextItem[]> = {};
          for (let i = 1; i <= doc.numPages; i++) {
            if (cancelled) break;
            const pageProxy = await doc.getPage(i);
            try {
              const textItems = await PdfRendererAdapter.getPageTextItems(pageProxy, 1.0);
              pagesText[i] = textItems.map(item => ({
                str: item.text,
                rect: { x: item.x, y: item.y, width: item.width, height: item.height },
              }));
            } finally {
              pageProxy.cleanup();
            }
          }
          if (!cancelled) SearchIndexer.setCache(documentKey, pagesText);
        }
      } catch (err) {
        await releaseLease();
        if (!cancelled) {
          setLoadError(String(err));
          setPdfDoc(null);
          setSharedPdfDoc(null);
        }
      } finally {
        loadFinished = true;
        if (cancelled) await releaseLease();
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (loadFinished) void releaseLease();
    };
  }, [workingBytes, documentKey, setSharedPdfDoc]);'''
workspace_path.write_text(
    workspace[:effect_start] + new_effect + workspace[effect_end:],
    encoding='utf-8',
)

Path('.github/workflows/agent-apply-pdfjs-lease-migration.yml').unlink()
Path('scripts/agent_patch_pdfjs_leases.py').unlink()
