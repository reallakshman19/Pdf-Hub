import { describe, expect, it } from 'vitest';
import { renderToSvg } from './MathJaxAdapter';

describe('MathJaxAdapter.renderToSvg', () => {
  it('renders structured LaTeX fractions and square roots to W3C <svg> offline', async () => {
    const svg = await renderToSvg('E = mc^2 + \\frac{\\Delta x}{\\sqrt{2}}');
    expect(svg).toMatch(/^<svg\b[^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<line ');
    expect(svg).toContain('<path ');
    expect(svg).toContain('Δ');
    expect(svg).not.toContain('<img');
  });

  it('neutralizes malicious HTML/script payloads inside LaTeX input', async () => {
    const svg = await renderToSvg('a + <script>fetch("http://evil")</script>');
    expect(svg).toContain('<svg ');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });
});
