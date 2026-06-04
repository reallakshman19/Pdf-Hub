import { describe, it, expect } from 'vitest';
import { StandardFonts } from 'pdf-lib';
import { pickStandard14Font, resolveStandard14Group } from './fontFamilyResolver';

describe('fontFamilyResolver', () => {
  it('maps Arial and Helvetica to the Helvetica group', () => {
    expect(resolveStandard14Group('Arial').regular).toBe(StandardFonts.Helvetica);
    expect(resolveStandard14Group('Helvetica').regular).toBe(StandardFonts.Helvetica);
  });

  it('maps Times New Roman and Georgia to the Times group', () => {
    expect(resolveStandard14Group('Times New Roman').regular).toBe(StandardFonts.TimesRoman);
    expect(resolveStandard14Group('Georgia').regular).toBe(StandardFonts.TimesRoman);
  });

  it('maps Courier New to the Courier group', () => {
    expect(resolveStandard14Group('Courier New').regular).toBe(StandardFonts.Courier);
    expect(resolveStandard14Group('monospace').regular).toBe(StandardFonts.Courier);
  });

  it('falls back to Helvetica for unknown families', () => {
    expect(resolveStandard14Group(undefined).regular).toBe(StandardFonts.Helvetica);
    expect(resolveStandard14Group('').regular).toBe(StandardFonts.Helvetica);
    expect(resolveStandard14Group('Comic Sans MS').regular).toBe(StandardFonts.Helvetica);
  });

  it('picks correct bold/italic variants', () => {
    expect(pickStandard14Font('Times New Roman', true, false)).toBe(StandardFonts.TimesRomanBold);
    expect(pickStandard14Font('Times New Roman', false, true)).toBe(StandardFonts.TimesRomanItalic);
    expect(pickStandard14Font('Times New Roman', true, true)).toBe(StandardFonts.TimesRomanBoldItalic);
    expect(pickStandard14Font('Courier New', true, false)).toBe(StandardFonts.CourierBold);
    expect(pickStandard14Font('Arial', true, true)).toBe(StandardFonts.HelveticaBoldOblique);
  });

  it('strips surrounding quotes from font-family CSS values', () => {
    // CSS font-family often comes with quotes e.g. "Times New Roman"
    expect(resolveStandard14Group('"Times New Roman"').regular).toBe(StandardFonts.TimesRoman);
    expect(resolveStandard14Group("'Courier New'").regular).toBe(StandardFonts.Courier);
  });
});
