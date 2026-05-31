/**
 * clientOcr.ts
 *
 * Singleton Tesseract.js worker with sequential job queue.
 * Ensures OCR work is asynchronous and shared across calls.
 */

type TesseractWorker = Awaited<
  ReturnType<typeof import('tesseract.js')['createWorker']>
>;

let workerInstance: TesseractWorker | null = null;
let workerInitPromise: Promise<TesseractWorker> | null = null;
let jobQueue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<TesseractWorker> {
  if (workerInstance) return workerInstance;

  if (!workerInitPromise) {
    workerInitPromise = import('tesseract.js')
      .then(({ createWorker }) => createWorker('eng'))
      .then((worker) => {
        workerInstance = worker;
        return worker;
      })
      .catch((err) => {
        workerInitPromise = null;
        throw err;
      });
  }

  return workerInitPromise;
}

/**
 * Recognize text from a base64 image data URL.
 * Concurrent calls are serialized through a shared queue.
 */
export async function recognizeImage(base64DataUrl: string): Promise<string> {
  const result = jobQueue.then(async () => {
    const worker = await getWorker();
    const ret = await worker.recognize(base64DataUrl);
    return ret.data.text;
  });

  jobQueue = result.catch(() => undefined);
  return result;
}

/**
 * Terminate the OCR worker and clear singleton state.
 */
export async function terminateOcrWorker(): Promise<void> {
  if (!workerInstance) return;

  await workerInstance.terminate();
  workerInstance = null;
  workerInitPromise = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener(
    'pagehide',
    () => {
      void terminateOcrWorker();
    },
    { once: true },
  );
}
