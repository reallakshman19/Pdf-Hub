import type { WriterAssetRecordV2 } from '../../persistence/indexedDbWriterStore';

export interface WriterDocxImageAsset {
  id: string;
  mimeType: string;
  bytes: Uint8Array;
  width?: number;
  height?: number;
}

export interface WriterDocxAssetResolver {
  getImageAsset: (assetId: string) => Promise<WriterDocxImageAsset | null>;
}

export function createWriterDocxAssetResolver(
  assets: WriterAssetRecordV2[] | undefined,
): WriterDocxAssetResolver {
  const assetsById = new Map((assets ?? []).map((asset) => [asset.id, asset]));

  return {
    async getImageAsset(assetId) {
      const asset = assetsById.get(assetId);

      if (!asset || !asset.dataUrl.startsWith('data:image/')) {
        return null;
      }

      return {
        id: asset.id,
        mimeType: asset.mimeType,
        bytes: dataUrlToBytes(asset.dataUrl),
        width: asset.width,
        height: asset.height,
      };
    },
  };
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(',');

  if (commaIndex === -1) {
    throw new Error('Invalid data URL: missing comma separator.');
  }

  const metadata = dataUrl.slice(0, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);

  if (!/;base64/i.test(metadata)) {
    return new TextEncoder().encode(decodeURIComponent(payload));
  }

  if (typeof atob === 'undefined') {
    throw new Error('Base64 decoding is not available in this environment.');
  }

  const binary = atob(payload);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
