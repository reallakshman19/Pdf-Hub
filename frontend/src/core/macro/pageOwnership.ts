import type { PageGraph, PageNode } from '@/core/pages/types';
import { createPageGraph, validatePageGraph } from '@/core/pages/pageGraph';
import type { PdfAnnotation } from '@/core/annotations/types';
import { normalizeAnnotationPageAnchors } from '@/core/annotations/pageAnchor';
import { remapAfterRotate } from '@/core/annotations/pageRemapper';
import type { WriterElementV2 } from '@/core/writer-v2/types';
import { normalizeWriterPageAnchors } from '@/core/writer-v2/writerPageAnchor';
import { remapWriterAfterRotate } from '@/core/writer-v2/pageRemapper';
import type { MacroPageLineageEntry } from './pageLineage';

export interface ResolvedMacroPageOwnership {
  graph: PageGraph<PageNode>;
  annotations: PdfAnnotation[];
  writerElements?: WriterElementV2[];
}

/**
 * Page IDs for surviving originals are conserved, even if physical order
 * changes. Copies receive new page IDs, and donor/generated/replacement pages
 * have no owner from the original document. No index-based rebinding.
 */
export function resolveMacroPageOwnership(
  before: PageGraph<PageNode>,
  output: PageGraph<PageNode>,
  lineage: readonly MacroPageLineageEntry[],
  commandId: string,
  annotations: readonly PdfAnnotation[],
  writerElements?: readonly WriterElementV2[],
): ResolvedMacroPageOwnership {
  const beforeValidation = validatePageGraph(before);
  const outputValidation = validatePageGraph(output);
  if (!beforeValidation.valid || !outputValidation.valid) {
    throw new Error('Macro ownership requires valid input and output PageGraphs.');
  }
  if (lineage.length !== output.pages.length || !commandId.trim()) {
    throw new Error('Macro ownership is missing a complete output page-lineage manifest.');
  }

  const instanceIds = new Set<string>();
  const originalIds = new Set<string>();
  const graph = createPageGraph(output.pages.map((rendered, index) => {
    const entry = lineage[index];
    if (!entry || !entry.instanceId.trim() || instanceIds.has(entry.instanceId)) {
      throw new Error('Macro ownership has a missing or repeated page instance.');
    }
    instanceIds.add(entry.instanceId);
    if (entry.sourceIndex === null) {
      return {
        ...rendered,
        pageId: `${commandId}::macro-page::${entry.instanceId}`,
        originalPageNumber: 0,
      };
    }
    if (
      !Number.isInteger(entry.sourceIndex)
      || entry.sourceIndex < 0
      || entry.sourceIndex >= before.pages.length
    ) {
      throw new Error('Macro ownership references an unknown source page.');
    }
    const origin = before.pages[entry.sourceIndex];
    const isOriginal = entry.instanceId === `source-${entry.sourceIndex}`;
    if (isOriginal && originalIds.has(origin.pageId)) {
      throw new Error('Macro ownership repeats an original PageId.');
    }
    if (isOriginal) originalIds.add(origin.pageId);
    return {
      ...rendered,
      pageId: isOriginal
        ? origin.pageId
        : `${commandId}::macro-page::${entry.instanceId}`,
      originalPageNumber: origin.originalPageNumber,
    };
  }), output.pageLabelRanges);

  if (!validatePageGraph(graph).valid) {
    throw new Error('Macro ownership produced invalid or duplicate output PageIds.');
  }

  const beforeIds = new Set(before.pages.map((p) => p.pageId));
  for (const annotation of annotations) {
    if (annotation.pageId && !beforeIds.has(annotation.pageId)) {
      throw new Error('Macro annotation has an unresolved source PageId; refusing positional ownership.');
    }
    if (!annotation.pageId && !before.pages[annotation.pageNumber - 1]) {
      throw new Error('Macro annotation has an out-of-range source page.');
    }
  }
  for (const element of writerElements ?? []) {
    if (element.pageId && !beforeIds.has(element.pageId)) {
      throw new Error('Macro Writer element has an unresolved source PageId; refusing positional ownership.');
    }
    if (!element.pageId && !before.pages[element.pageIndex]) {
      throw new Error('Macro Writer element has an out-of-range source page.');
    }
  }

  const normalizedAnnotations = normalizeAnnotationPageAnchors(annotations, before);
  const annotationBySource = new Map<string, PdfAnnotation[]>();
  for (const annotation of normalizedAnnotations) {
    if (!annotation.pageId) throw new Error('Macro annotation owner could not be established.');
    const records = annotationBySource.get(annotation.pageId) ?? [];
    records.push(annotation);
    annotationBySource.set(annotation.pageId, records);
  }
  const normalizedWriter = writerElements === undefined
    ? undefined
    : normalizeWriterPageAnchors(writerElements, before);
  const writerBySource = new Map<string, WriterElementV2[]>();
  for (const element of normalizedWriter ?? []) {
    if (!element.pageId) throw new Error('Macro Writer owner could not be established.');
    const records = writerBySource.get(element.pageId) ?? [];
    records.push(element);
    writerBySource.set(element.pageId, records);
  }

  const nextAnnotations: PdfAnnotation[] = [];
  const nextWriter: WriterElementV2[] = [];
  let annotationCopyOrdinal = 0;
  let writerCopyOrdinal = 0;
  lineage.forEach((entry, index) => {
    if (entry.sourceIndex === null) return;
    const source = before.pages[entry.sourceIndex];
    const target = graph.pages[index];
    const original = entry.instanceId === `source-${entry.sourceIndex}`;
    const deltaRotation = (target.rotation - source.rotation + 360) % 360;

    for (const originalAnnotation of annotationBySource.get(source.pageId) ?? []) {
      const annotation = deltaRotation
        ? remapAfterRotate([originalAnnotation], [{
            pageIndex: entry.sourceIndex,
            angle: deltaRotation,
            width: source.width,
            height: source.height,
          }])[0]
        : originalAnnotation;
      nextAnnotations.push({
        ...annotation,
        ...(original ? {} : {
          id: `${commandId}::annotation-duplicate::${++annotationCopyOrdinal}`,
        }),
        pageId: target.pageId,
        pageNumber: index + 1,
        rect: { ...annotation.rect },
        data: { ...annotation.data },
      });
    }
    for (const originalElement of writerBySource.get(source.pageId) ?? []) {
      const element = deltaRotation
        ? remapWriterAfterRotate([originalElement], [{
            pageIndex: entry.sourceIndex,
            angle: deltaRotation,
            width: source.width,
            height: source.height,
          }])[0]
        : originalElement;
      nextWriter.push({
        ...element,
        ...(original ? {} : {
          id: `${commandId}::writer-duplicate::${++writerCopyOrdinal}`,
        }),
        pageId: target.pageId,
        pageIndex: index,
        rect: { ...element.rect },
        style: { ...element.style },
        assetIds: element.assetIds ? [...element.assetIds] : undefined,
        callout: element.callout ? {
          ...element.callout,
          anchorPoint: element.callout.anchorPoint
            ? { ...element.callout.anchorPoint }
            : undefined,
        } : undefined,
        review: element.review ? { ...element.review } : undefined,
      });
    }
  });

  return {
    graph,
    annotations: nextAnnotations,
    ...(writerElements === undefined ? {} : { writerElements: nextWriter }),
  };
}
