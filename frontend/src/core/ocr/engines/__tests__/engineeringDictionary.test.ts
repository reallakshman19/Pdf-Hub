import { describe, expect, it } from 'vitest';
import {
  applyEngineeringDictionaryToTesseractData,
  correctEngineeringText,
} from '../engineeringDictionary';

describe('engineeringDictionary', () => {
  it('corrects pressure units after numbers without touching unrelated words', () => {
    expect(correctEngineeringText('ALPHA VALVE 10 8AR')).toBe('ALPHA VALVE 10 BAR');
    expect(correctEngineeringText('VALVE 10bar')).toBe('VALVE 10 BAR');
    expect(correctEngineeringText('BETA COMPRESSOR 25 P51')).toBe('BETA COMPRESSOR 25 PSI');
    expect(correctEngineeringText('PRESSURE 25psi')).toBe('PRESSURE 25 PSI');
    expect(correctEngineeringText('SETTING 100 kpa')).toBe('SETTING 100 kPa');
    expect(correctEngineeringText('SYSTEM 2.5 MPA')).toBe('SYSTEM 2.5 MPa');

    // Unrelated words must stay untouched
    expect(correctEngineeringText('He went to the bar with friends')).toBe('He went to the bar with friends');
    expect(correctEngineeringText('barbecue party')).toBe('barbecue party');
    expect(correctEngineeringText('psychology')).toBe('psychology');
  });

  it('corrects metric dimensions and tolerance symbols', () => {
    expect(correctEngineeringText('LENGTH 50 mrn')).toBe('LENGTH 50 mm');
    expect(correctEngineeringText('TOLERANCE +-0.05')).toBe('TOLERANCE ±0.05');
    expect(correctEngineeringText('PIPE O25')).toBe('PIPE Ø25');
  });

  it('corrects common engineering term typos', () => {
    expect(correctEngineeringText('ALPHA VALV')).toBe('ALPHA VALVE');
    expect(correctEngineeringText('BETA CONPRESSOR')).toBe('BETA COMPRESSOR');
    expect(correctEngineeringText('STEEL FLANQE')).toBe('STEEL FLANGE');
  });

  it('applies corrections recursively to TesseractRecognizeData', () => {
    const rawData = {
      text: 'ALPHA VALV 10 8AR',
      words: [
        { text: 'ALPHA', confidence: 95 },
        { text: 'VALV', confidence: 80 },
        { text: '10', confidence: 98 },
        { text: '8AR', confidence: 70 },
      ],
      lines: [
        {
          text: 'ALPHA VALV 10 8AR',
          confidence: 85,
          words: [
            { text: 'ALPHA', confidence: 95 },
            { text: 'VALV', confidence: 80 },
            { text: '10', confidence: 98 },
            { text: '8AR', confidence: 70 },
          ],
        },
      ],
    };

    const corrected = applyEngineeringDictionaryToTesseractData(rawData);

    expect(corrected.text).toBe('ALPHA VALVE 10 BAR');
    expect(corrected.words?.[1]?.text).toBe('VALVE');
    expect(corrected.lines?.[0]?.text).toBe('ALPHA VALVE 10 BAR');
  });
});
