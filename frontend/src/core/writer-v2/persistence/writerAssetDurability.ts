import type {
  WriterAssetRecordV2,
} from './indexedDbWriterStore';
import {
  resolveWriterPersistenceAdapter,
} from './writerPersistenceRuntime';

export async function persistWriterAssetReferences(
  documentFingerprint: string,
  assetIds: readonly string[],
  assetRecords: readonly WriterAssetRecordV2[],
): Promise<void> {
  const uniqueIds = [
    ...new Set(assetIds.filter(Boolean)),
  ];

  if (uniqueIds.length === 0) return;

  const recordsById = new Map(
    assetRecords.map((asset) => [
      asset.id,
      asset,
    ]),
  );
  const adapter =
    resolveWriterPersistenceAdapter();

  for (const assetId of uniqueIds) {
    const asset = recordsById.get(assetId);

    if (!asset) {
      throw new Error(
        `Writer history cannot checkpoint missing asset ${assetId}.`,
      );
    }

    if (asset.documentFingerprint !== documentFingerprint) {
      throw new Error(`Writer history cannot checkpoint foreign asset ${assetId}.`);
    }
    const stored = await adapter.loadAsset(assetId, documentFingerprint);
    if (stored && stored.documentFingerprint === documentFingerprint
      && stored.dataUrl === asset.dataUrl && stored.mimeType === asset.mimeType
      && stored.width === asset.width && stored.height === asset.height
      && stored.updatedAt === asset.updatedAt) continue;
    await adapter.saveAsset({ ...asset });
  }
}
