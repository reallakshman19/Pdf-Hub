import { afterEach, describe, expect, it, vi } from 'vitest';

const recognizeMock = vi.fn();
const terminateMock = vi.fn();
const createWorkerMock = vi.fn(async () => ({
  recognize: recognizeMock,
  terminate: terminateMock,
}));

vi.mock('tesseract.js', () => ({
  createWorker: createWorkerMock,
}));

const loadOcrModule = async () => {
  vi.resetModules();
  return import('./clientOcr');
};

describe('clientOcr', () => {
  afterEach(() => {
    recognizeMock.mockReset();
    terminateMock.mockReset();
    createWorkerMock.mockClear();
    vi.restoreAllMocks();
  });

  it('serializes concurrent OCR requests through one worker', async () => {
    let activeRecognitions = 0;
    let maxActiveRecognitions = 0;
    recognizeMock.mockImplementation(async (image: string) => {
      activeRecognitions += 1;
      maxActiveRecognitions = Math.max(maxActiveRecognitions, activeRecognitions);
      await Promise.resolve();
      activeRecognitions -= 1;
      return { data: { text: `text:${image}` } };
    });

    const { recognizeImage, terminateOcrWorker } = await loadOcrModule();

    await expect(
      Promise.all([
        recognizeImage('image-1'),
        recognizeImage('image-2'),
        recognizeImage('image-3'),
        recognizeImage('image-4'),
        recognizeImage('image-5'),
      ]),
    ).resolves.toEqual(['text:image-1', 'text:image-2', 'text:image-3', 'text:image-4', 'text:image-5']);

    expect(createWorkerMock).toHaveBeenCalledTimes(1);
    expect(maxActiveRecognitions).toBe(1);

    await terminateOcrWorker();
    expect(terminateMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the OCR queue usable after a failed recognition', async () => {
    recognizeMock
      .mockRejectedValueOnce(new Error('scan failed'))
      .mockResolvedValueOnce({ data: { text: 'recovered' } });
    const { recognizeImage } = await loadOcrModule();

    await expect(recognizeImage('bad-image')).rejects.toThrow('scan failed');
    await expect(recognizeImage('good-image')).resolves.toBe('recovered');
    expect(createWorkerMock).toHaveBeenCalledTimes(1);
  });
});
