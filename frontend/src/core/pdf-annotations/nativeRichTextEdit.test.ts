import { describe, expect, it } from 'vitest';
import { editNativeRichText } from './nativeRichTextEdit';

const source = '<body xmlns="http://www.w3.org/1999/xhtml" style="font-family:Arial;font-size:12pt;color:#000000"><p>Alpha <span style="color:#ff0000">Beta</span></p><p style="font-weight:bold">Gamma</p></body>';

describe('native rich-text edit', () => {
  it('updates the edited characters while preserving the styles of unchanged runs', () => {
    const result = editNativeRichText(source, 'Alpha BetaGamma', 'Alpha BetterGamma');
    const doc = new DOMParser().parseFromString(result, 'application/xml');
    expect(doc.documentElement.textContent).toBe('Alpha BetterGamma');
    expect(doc.getElementsByTagName('span')[0].getAttribute('style')).toBe('color:#ff0000');
    expect(doc.getElementsByTagName('span')[0].textContent).toBe('Better');
    expect(doc.getElementsByTagName('p')[1].getAttribute('style')).toBe('font-weight:bold');
    expect(doc.getElementsByTagName('p')[1].textContent).toBe('Gamma');
  });

  it('does not reinterpret rich content when plain and rich values disagree', () => {
    expect(() => editNativeRichText(source, 'not the rich content', 'replacement')).toThrow(/rich text/i);
  });

  it('rejects unsupported structural markup rather than silently dropping it', () => {
    const complex = '<body xmlns="http://www.w3.org/1999/xhtml"><p>Alpha<b>Beta</b></p></body>';
    expect(() => editNativeRichText(complex, 'AlphaBeta', 'AlphaGamma')).toThrow(/rich text/i);
  });

  it('inserts native XHTML line breaks within a styled span', () => {
    const result = editNativeRichText(source, 'Alpha BetaGamma', 'Alpha Be\ntaGamma');
    const doc = new DOMParser().parseFromString(result, 'application/xml');
    const span = doc.getElementsByTagName('span')[0];
    expect(span.getAttribute('style')).toBe('color:#ff0000');
    expect(span.getElementsByTagName('br')).toHaveLength(1);
    expect(span.textContent).toBe('Beta');
  });

  it('edits and removes an existing native line break without losing its surrounding style', () => {
    const withBreak = '<body xmlns="http://www.w3.org/1999/xhtml"><p>Hello <span style="color:#ff0000">world<br/>again</span></p></body>';
    const result = editNativeRichText(withBreak, 'Hello world\nagain', 'Hello world again!');
    const doc = new DOMParser().parseFromString(result, 'application/xml');
    const span = doc.getElementsByTagName('span')[0];
    expect(span.getAttribute('style')).toBe('color:#ff0000');
    expect(span.getElementsByTagName('br')).toHaveLength(0);
    expect(doc.documentElement.textContent).toBe('Hello world again!');
  });
});
