import { describe, expect, it } from 'vitest';
import { sanitizeClipboardHtml } from './sanitizeClipboardHtml';

describe('sanitizeClipboardHtml', () => {
  it('removes scripts, event handlers, and javascript urls', () => {
    const result = sanitizeClipboardHtml(`
      <div onclick="alert(1)">
        <script>alert(1)</script>
        <a href="javascript:alert(1)">bad</a>
        <span style="font-weight: bold; background-image: url(javascript:bad)">safe</span>
      </div>
    `);

    expect(result).not.toContain('<script');
    expect(result).not.toContain('onclick');
    expect(result).not.toContain('javascript:');
    expect(result).toContain('font-weight: bold');
    expect(result).not.toContain('background-image');
  });

  it('keeps basic rich text structure', () => {
    const result = sanitizeClipboardHtml(`
      <p><strong>Hello</strong> <em>writer</em></p>
      <ul><li>One</li><li>Two</li></ul>
    `);

    expect(result).toContain('<strong>');
    expect(result).toContain('<em>');
    expect(result).toContain('<ul>');
    expect(result).toContain('<li>');
  });

  it('blocks data:text/html urls', () => {
    const result = sanitizeClipboardHtml(`
      <a href="data:text/html,<script>alert(1)</script>">bad</a>
    `);

    expect(result).not.toContain('data:text/html');
  });
});
