import { describe, it, expect } from 'vitest';
import * as pdfLib from 'pdf-lib';
import fs from 'node:fs';
import { readNativePdfAnnotations } from './nativeAnnotationReader';
import { computeCalloutPath } from '@/core/annotations/callout-geometry';

describe('FreeText & Callout color, newline, and border fidelity', () => {
  it('correctly maps white /C with colored /DA to opaque background and colored stroke', async () => {
    const doc = await pdfLib.PDFDocument.create();
    const page = doc.addPage([600, 400]);

    const calloutDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      IT: 'FreeTextCallout',
      Rect: [50, 100, 250, 200],
      Contents: pdfLib.PDFString.of('Line 1\rLine 2'),
      CL: [50, 100, 80, 150, 120, 180],
      C: [1, 1, 1], // White fill in PDF convention
      DA: pdfLib.PDFString.of('1 0 0 rg /Arial 10 Tf'), // Red stroke & text
      NM: pdfLib.PDFString.of('callout-white-c'),
    });
    const calloutRef = doc.context.register(calloutDict);

    const textboxDict = doc.context.obj({
      Type: 'Annot',
      Subtype: 'FreeText',
      Rect: [300, 100, 400, 120],
      Contents: pdfLib.PDFString.of('2200'),
      C: [1, 1, 1],
      DA: pdfLib.PDFString.of('1 0 0 rg /Helv 18 Tf'),
      BS: doc.context.obj({ W: 0 }),
      NM: pdfLib.PDFString.of('dim-box'),
    });
    const textboxRef = doc.context.register(textboxDict);

    page.node.set(pdfLib.PDFName.of('Annots'), doc.context.obj([calloutRef, textboxRef]));

    const bytes = await doc.save();
    const result = await readNativePdfAnnotations(bytes);

    const callout = result.annotations.find(a => a.id === 'callout-white-c');
    expect(callout).toBeDefined();
    expect(callout?.data.text).toBe('Line 1\nLine 2');
    expect(callout?.data.backgroundColor).toBe('#ffffff');
    expect(callout?.data.borderColor).toBe('#ff0000');
    expect(callout?.data.textColor).toBe('#ff0000');

    const textbox = result.annotations.find(a => a.id === 'dim-box');
    expect(textbox).toBeDefined();
    expect(textbox?.data.text).toBe('2200');
    expect(textbox?.data.borderWidth).toBe(0);
    expect(textbox?.data.backgroundColor).toBe('#ffffff');
    expect(textbox?.data.borderColor).toBe('#ff0000');
    expect(textbox?.data.textColor).toBe('#ff0000');
  });

  it('correctly reads real-world SYS-008A markups if file exists', async () => {
    const filePath = 'C:/Users/reall/Downloads/Markup for SYS-008A.pdf';
    if (!fs.existsSync(filePath)) return;
    const bytes = fs.readFileSync(filePath);
    const result = await readNativePdfAnnotations(new Uint8Array(bytes));
    const page1Annots = result.annotations.filter(a => a.pageNumber === 1);

    const callout1 = page1Annots.find(a => a.id.includes('9f56a7d5-5c94-442f-b58d-d23865a8cbbf'));
    expect(callout1).toBeDefined();
    expect(callout1?.data.text).toBe('Rest\nAxial Stop- Normal');
    expect(callout1?.data.borderColor).toBe('#ff0000');
    expect(callout1?.data.backgroundColor).toBe('#ffffff');
    expect(callout1?.data.anchor).toBeDefined();
    expect(callout1?.data.knee).toBeDefined();

    const callout2 = page1Annots.find(a => a.id.includes('60fc6164-13f5-45b1-954b-b2d7faa0b960'));
    expect(callout2).toBeDefined();
    expect(callout2?.data.text).toBe('Rest\nHold Down+Guide');
    expect(callout2?.data.anchor).toBeDefined();
    expect(callout2?.data.knee).toBeDefined();

    const path1 = computeCalloutPath(callout1!.data.anchor!, callout1!.rect, { kneePoint: callout1!.data.knee });
    expect(path1.points.length).toBe(3);

    const path2 = computeCalloutPath(callout2!.data.anchor!, callout2!.rect, { kneePoint: callout2!.data.knee });
    expect(path2.points.length).toBe(3);

    const tb2200 = page1Annots.find(a => a.id.includes('03839f4a-f04f-4dd9-a290-bfb2e0e4661b'));
    expect(tb2200).toBeDefined();
    expect(tb2200?.data.borderWidth).toBe(0);

    const page2Annots = result.annotations.filter(a => a.pageNumber === 2);
    const civilBox = page2Annots.find(a => a.data.text?.includes('Civil frame'));
    expect(civilBox).toBeDefined();
    // Green text color from DS / RC (#3faa54 or #3eaa53)
    expect(civilBox?.data.textColor?.toLowerCase()).toMatch(/^#(3faa54|3eaa53)$/);
    expect(civilBox?.data.borderColor?.toLowerCase()).toMatch(/^#(3faa54|3eaa53)$/);

    const deleteTrunnion = page2Annots.find(a => a.data.text?.includes('Delete Trunnion'));
    expect(deleteTrunnion).toBeDefined();
    expect(deleteTrunnion?.type).toBe('callout');
    expect(deleteTrunnion?.data.anchor).toBeDefined();
    expect(deleteTrunnion?.data.knee).toBeDefined();

    const shoeCallout = page2Annots.find(a => a.data.text?.includes('S1 type Shoe'));
    expect(shoeCallout).toBeDefined();
    expect(shoeCallout?.type).toBe('callout');
    expect(shoeCallout?.data.anchor).toBeDefined();
    expect(shoeCallout?.data.knee).toBeDefined();

    const dbvdCallouts = page2Annots.filter(a => a.data.text === 'DBVD-B-LT');
    expect(dbvdCallouts.length).toBe(3);
    for (const dbvd of dbvdCallouts) {
      expect(dbvd.type).toBe('callout');
      expect(dbvd.data.anchor).toBeDefined();
      expect(dbvd.data.knee).toBeDefined();
    }
  });

  it('heals legacy stored annotations where callouts were saved as textboxes without anchors', () => {
    // Simulated native source parsed from PDF
    const nativeSource = [
      {
        id: 'callout-1',
        type: 'callout' as const,
        pageNumber: 2,
        rect: { x: 661, y: 269, width: 108, height: 18 },
        data: {
          text: 'Delete Trunnion',
          anchor: { x: 499, y: 321 },
          knee: { x: 649, y: 279 },
          arrowHead: 'open' as const,
          borderColor: '#ff0000',
          textColor: '#ff0000',
        },
      },
      {
        id: 'civil-1',
        type: 'textbox' as const,
        pageNumber: 2,
        rect: { x: 517, y: 212, width: 218, height: 20 },
        data: {
          text: 'Supported on Civil frame (Box type)',
          borderColor: '#3faa54',
          textColor: '#3faa54',
          backgroundColor: '#ffffff',
        },
      },
    ];

    // Simulated legacy stored session (e.g. from IndexedDB before fix)
    const legacyStored = [
      {
        id: 'callout-1',
        type: 'textbox' as const, // Legacy was saved as textbox!
        pageNumber: 2,
        rect: { x: 499, y: 269, width: 270, height: 55 },
        data: {
          text: 'Delete Trunnion',
          borderColor: '#ff0000',
          textColor: '#ff0000',
          // anchor and knee were missing in legacy session!
        },
      },
      {
        id: 'civil-1',
        type: 'textbox' as const,
        pageNumber: 2,
        rect: { x: 517, y: 212, width: 218, height: 20 },
        data: {
          text: 'Supported on Civil frame (Box type)',
          borderColor: '#ff0000', // Stale red in old session
          textColor: '#ff0000',
          backgroundColor: '#ffffff',
        },
      },
    ];

    const sourceByKey = new Map<string, (typeof nativeSource)[0]>();
    const sourceByText = new Map<string, (typeof nativeSource)[0]>();
    for (const item of nativeSource) {
      sourceByKey.set(`${item.pageNumber}\u0000${item.id}`, item);
      if (item.data.text) sourceByText.set(`${item.pageNumber}\u0000${item.data.text.trim()}`, item);
    }

    const healed = legacyStored.map((item) => {
      const source = sourceByKey.get(`${item.pageNumber}\u0000${item.id}`)
        ?? (item.data.text ? sourceByText.get(`${item.pageNumber}\u0000${item.data.text.trim()}`) : undefined);
      const data = { ...item.data } as Record<string, unknown>;
      let effectiveRect = item.rect;
      const resolvedType = (source?.type === 'callout' || (item.type as string) === 'callout')
        ? 'callout'
        : (source?.type ?? item.type);
      if (source) {
        if (resolvedType === 'callout') {
          if (source.data.anchor) data.anchor = source.data.anchor;
          if (source.data.knee) data.knee = source.data.knee;
          if (source.data.arrowHead) data.arrowHead = source.data.arrowHead;
          effectiveRect = source.rect;
        }
        if (resolvedType === 'callout' || resolvedType === 'textbox') {
          if (source.data.borderColor) data.borderColor = source.data.borderColor;
          if (source.data.textColor) data.textColor = source.data.textColor;
        }
      }
      return { ...item, type: resolvedType, rect: effectiveRect, data };
    });

    const healedCallout = healed.find(a => a.id === 'callout-1');
    expect(healedCallout?.type).toBe('callout');
    expect(healedCallout?.data.anchor).toEqual({ x: 499, y: 321 });
    expect(healedCallout?.data.knee).toEqual({ x: 649, y: 279 });
    expect(healedCallout?.rect).toEqual({ x: 661, y: 269, width: 108, height: 18 });

    const healedCivil = healed.find(a => a.id === 'civil-1');
    expect(healedCivil?.data.textColor).toBe('#3faa54');
    expect(healedCivil?.data.borderColor).toBe('#3faa54');
  });
});
