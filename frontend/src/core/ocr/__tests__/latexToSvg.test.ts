import { describe, expect, it } from 'vitest';
import { escapeXml, renderLatexToSvgSync, sanitizeMathSvg } from '../latexToSvg';

describe('latexToSvg', () => {
  it('renders quadratic formula with fraction line and radical path', () => {
    const svg = renderLatexToSvgSync(
      'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}',
    );
    expect(svg).toContain('<svg ');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<line ');
    expect(svg).toContain('<path ');
    expect(svg).toContain('±');
    expect(svg).toContain('2');
    expect(svg).not.toContain('<img');
    expect(svg).not.toContain('<script');
  });

  it('renders Greek symbols, big operators with limits, nth roots, and matrices', () => {
    const integralSvg = renderLatexToSvgSync('\\sum_{i=1}^{n} \\alpha_i^2 + \\sqrt[3]{\\pi}');
    expect(integralSvg).toContain('∑');
    expect(integralSvg).toContain('α');
    expect(integralSvg).toContain('π');
    expect(integralSvg).toContain('<path ');

    const matrixSvg = renderLatexToSvgSync('\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}');
    expect(matrixSvg).toContain('<svg ');
    expect(matrixSvg).toContain('<path ');
    expect(matrixSvg).toContain('a');
    expect(matrixSvg).toContain('d');
  });

  it('handles empty or whitespace input safely', () => {
    const emptySvg = renderLatexToSvgSync('   ');
    expect(emptySvg).toContain('<svg ');
    expect(emptySvg).toContain('Empty equation');
  });

  it('XML-escapes hostile script payloads and never emits unsafe HTML or attributes', () => {
    const hostile = 'x + <script>alert(1)</script><img src=x onerror=alert(2)>';
    const svg = renderLatexToSvgSync(hostile);
    expect(svg).toContain('<svg ');
    expect(svg).not.toMatch(/<script/i);
    expect(svg).not.toMatch(/<img/i);
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&lt;img');
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
    expect(doc.querySelectorAll('script, img, image, foreignObject, iframe')).toHaveLength(0);
    for (const el of Array.from(doc.querySelectorAll('*'))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase()).not.toMatch(/^on/);
      }
    }
    expect(escapeXml('a&<b>"c\'')).toBe('a&amp;&lt;b&gt;&quot;c&#39;');
  });

  it('sanitizeMathSvg rejects disallowed tags and javascript protocols', () => {
    expect(sanitizeMathSvg('<svg><script>alert(1)</script></svg>')).toContain('Formula unavailable');
    expect(sanitizeMathSvg('<svg><text onload="x()">a</text></svg>')).toContain('Formula unavailable');
    expect(sanitizeMathSvg('<svg><foreignObject>hi</foreignObject></svg>')).toContain('Formula unavailable');
    expect(sanitizeMathSvg('<svg xmlns="http://www.w3.org/2000/svg"><text x="1" y="14">ok</text></svg>')).toContain('>ok</text>');
  });
});
