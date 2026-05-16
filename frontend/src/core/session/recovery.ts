import { FileAdapter } from '@/adapters/file/FileAdapter';
import { composeCommittedPdf } from '@/core/document/commitPipeline';
import type { PdfAnnotation } from '@/core/annotations/types';
import type { PlacedElement } from '@/core/writer/types';

export async function emergencyDownloadCommittedPdf(input: {
  workingBytes: Uint8Array;
  fileName: string;
  annotations: PdfAnnotation[];
  writerElements: PlacedElement[];
}): Promise<void> {
  const committed = await composeCommittedPdf({
    baseBytes: input.workingBytes,
    annotations: input.annotations,
    writerElements: input.writerElements,
  });

  const safeName = input.fileName.replace(/\.pdf$/i, '') + '-recovery.pdf';
  FileAdapter.downloadBytes(committed.bytes, safeName);
}
