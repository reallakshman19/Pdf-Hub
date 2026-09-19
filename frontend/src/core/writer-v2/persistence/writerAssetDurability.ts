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

    await adapter.saveAsset({
      ...asset,
      documentFingerprint,
    });
  }
}
