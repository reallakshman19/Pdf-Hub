import { describe, expect, it } from 'vitest';
import { sanitizeHtml, sanitizeHtmlWithReport } from './htmlSanitizer';

describe('html sanitizer', () => {
  it('sanitizes descendants introduced by unknown wrapper unwrapping', () => {
    const html = sanitizeHtml(
      '<custom-wrapper><script>alert(1)</script><strong onclick="bad()">Safe</strong></custom-wrapper>',
    );

    expect(html).toContain('<strong>Safe</strong>');
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('alert(1)');
  });

  it('drops active subtrees and unsafe URL schemes', () => {
    const html = sanitizeHtml(
      '<iframe src="https://example.com">hidden</iframe>' +
      '<a href="java\nscript:alert(1)">bad</a>' +
      '<a href="https://example.com/path">good</a>',
    );

    expect(html).not.toContain('iframe');
    expect(html).not.toContain('javascript');
    expect(html).toContain('<a>bad</a>');
    expect(html).toContain('href="https://example.com/path"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('allows bounded raster data images but rejects SVG and remote image loads', () => {
    const html = sanitizeHtml(
      '<img src="data:image/png;base64,iVBORw0KGgo=" alt="safe">' +
      '<img src="data:image/svg+xml;base64,PHN2Zz4=" alt="svg">' +
      '<img src="https://tracker.example/pixel" alt="remote">',
    );

    expect(html).toContain('data:image/png;base64,iVBORw0KGgo=');
    expect(html).toContain('alt="safe"');
    expect(html).not.toContain('image/svg+xml');
    expect(html).not.toContain('tracker.example');
  });

  it('preserves allowlisted inline formatting without CSS URL execution', () => {
    const html = sanitizeHtml(
      '<span style="color: #ff0000; text-align: center; background-image: url(https://bad); position: fixed">Text</span>',
    );

    expect(html).toContain('color: #ff0000');
    expect(html).toContain('text-align: center');
    expect(html).not.toContain('background-image');
    expect(html).not.toContain('position');
    expect(html).not.toContain('url(');
  });

  it('fails closed before DOM parsing when input exceeds the byte budget', () => {
    const report = sanitizeHtmlWithReport('<script>alert(1)</script>'.repeat(20), {
      maxInputBytes: 32,
      maxFallbackTextCharacters: 24,
    });

    expect(report.truncated).toBe(true);
    expect(report.visitedNodes).toBe(0);
    expect(report.html).toContain('&lt;script&gt;');
    expect(report.html).not.toContain('<script>');
  });

  it('stops reconstruction at the configured node and depth limits', () => {
    const report = sanitizeHtmlWithReport(
      '<div><div><div><strong>deep</strong></div></div></div>',
      { maxDepth: 2, maxNodes: 4 },
    );

    expect(report.truncated).toBe(true);
    expect(report.visitedNodes).toBeLessThanOrEqual(5);
    expect(report.html).not.toContain('deep');
  });

  it('normalizes a backslash href to its real parsed destination instead of the raw string', () => {
    const html = sanitizeHtml('<a href="\\\\evil.com">link</a>');

    expect(html).not.toContain('\\\\evil.com');
    expect(html).toContain('href="https://evil.com/"');
  });

  it('rejects a protocol-relative href instead of letting it navigate off-site', () => {
    const html = sanitizeHtml('<a href="//evil.com">link</a>');

    expect(html).toBe('<a>link</a>');
  });

  it('rejects blob: image sources entirely rather than admitting them unbounded', () => {
    const html = sanitizeHtml('<img src="blob:https://pdfhub.invalid/abc-123" alt="x">');

    expect(html).not.toContain('blob:');
    expect(html).not.toContain('src=');
  });

  it('rejects animated GIF image sources to match the IMG-1 format policy', () => {
    const html = sanitizeHtml('<img src="data:image/gif;base64,R0lGODlh" alt="x">');

    expect(html).not.toContain('image/gif');
    expect(html).not.toContain('src=');
  });

  it('surfaces truncation via sanitizeHtmlWithReport so callers can warn the user', () => {
    const report = sanitizeHtmlWithReport('<script>alert(1)</script>'.repeat(20), {
      maxInputBytes: 32,
      maxFallbackTextCharacters: 24,
    });

    expect(report.truncated).toBe(true);
  });
});
