import { describe, it, expect } from 'vitest';
import { StandardFonts } from 'pdf-lib';
import { pickStandard14Font, resolveStandard14Group } from './fontFamilyResolver';

describe('fontFamilyResolver', () => {
  it('maps Arial and Helvetica to the Helvetica group', async () => {
    expect((await resolveStandard14Group('Arial')).regular).toBe(StandardFonts.Helvetica);
    expect((await resolveStandard14Group('Helvetica')).regular).toBe(StandardFonts.Helvetica);
  });

  it('maps Times New Roman and Georgia to the Times group', async () => {
    expect((await resolveStandard14Group('Times New Roman')).regular).toBe(StandardFonts.TimesRoman);
    expect((await resolveStandard14Group('Georgia')).regular).toBe(StandardFonts.TimesRoman);
  });

  it('maps Courier New to the Courier group', async () => {
    expect((await resolveStandard14Group('Courier New')).regular).toBe(StandardFonts.Courier);
    expect((await resolveStandard14Group('monospace')).regular).toBe(StandardFonts.Courier);
  });

  it('falls back to Helvetica for unknown families', async () => {
    expect((await resolveStandard14Group(undefined)).regular).toBe(StandardFonts.Helvetica);
    expect((await resolveStandard14Group('')).regular).toBe(StandardFonts.Helvetica);
    expect((await resolveStandard14Group('Comic Sans MS')).regular).toBe(StandardFonts.Helvetica);
  });

  it('picks correct bold/italic variants', async () => {
    expect(await pickStandard14Font('Times New Roman', true, false)).toBe(StandardFonts.TimesRomanBold);
    expect(await pickStandard14Font('Times New Roman', false, true)).toBe(StandardFonts.TimesRomanItalic);
    expect(await pickStandard14Font('Times New Roman', true, true)).toBe(StandardFonts.TimesRomanBoldItalic);
    expect(await pickStandard14Font('Courier New', true, false)).toBe(StandardFonts.CourierBold);
    expect(await pickStandard14Font('Arial', true, true)).toBe(StandardFonts.HelveticaBoldOblique);
  });

  it('strips surrounding quotes from font-family CSS values', async () => {
    // CSS font-family often comes with quotes e.g. "Times New Roman"
    expect((await resolveStandard14Group('"Times New Roman"')).regular).toBe(StandardFonts.TimesRoman);
    expect((await resolveStandard14Group("'Courier New'")).regular).toBe(StandardFonts.Courier);
  });
});
