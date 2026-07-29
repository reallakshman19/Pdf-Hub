import { describe, expect, it } from 'vitest';
import {
  admitPastedPsIsonoteText,
  admitPsIsonoteUploadSize,
  PS_ISONOTE_ADMISSION_LIMITS,
  PsIsonoteAdmissionError,
} from './psIsonoteAdmission';

describe('psIsonoteAdmission', () => {
  it('admits an upload at or under the byte limit', () => {
    expect(() => admitPsIsonoteUploadSize({ size: PS_ISONOTE_ADMISSION_LIMITS.maxUploadedSourceBytes })).not.toThrow();
    expect(() => admitPsIsonoteUploadSize({ size: 1 })).not.toThrow();
  });

  it('rejects an oversized upload without reading its bytes', () => {
    let textCalled = false;
    const oversizedFile = {
      size: PS_ISONOTE_ADMISSION_LIMITS.maxUploadedSourceBytes + 1,
      text: async () => {
        textCalled = true;
        return 'x'.repeat(1000);
      },
    };

    expect(() => admitPsIsonoteUploadSize(oversizedFile)).toThrow(PsIsonoteAdmissionError);
    expect(textCalled).toBe(false);
  });

  it('admits pasted/typed text at or under the code-unit limit', () => {
    expect(() => admitPastedPsIsonoteText('PS,NOTE\nPS-1,ok')).not.toThrow();
  });

  it('rejects oversized pasted/typed text', () => {
    const huge = 'x'.repeat(PS_ISONOTE_ADMISSION_LIMITS.maxPastedSourceCodeUnits + 1);
    expect(() => admitPastedPsIsonoteText(huge)).toThrow(PsIsonoteAdmissionError);
  });
});
