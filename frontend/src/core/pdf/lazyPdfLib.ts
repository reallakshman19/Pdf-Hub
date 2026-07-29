let pdfLibModulePromise: Promise<typeof import('pdf-lib')> | null = null;

export function pdfLib(): Promise<typeof import('pdf-lib')> {
  if (!pdfLibModulePromise) {
    pdfLibModulePromise = import('pdf-lib');
  }
  return pdfLibModulePromise;
}
