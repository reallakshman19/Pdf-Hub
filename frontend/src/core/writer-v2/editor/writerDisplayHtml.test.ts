import { describe, expect, it } from 'vitest';
import { writerDisplayHtml } from './writerDisplayHtml';

function state(children: unknown[]): string {
  return JSON.stringify({ root: { type: 'root', children } });
}

function text(t: string, format = 0, style = ''): Record<string, unknown> {
  return { type: 'text', text: t, format, style };
}

describe('writerDisplayHtml', () => {
  it('falls back to escaped plain text when JSON is missing', () => {
    expect(writerDisplayHtml(null, 'a < b & "c"')).toBe('a &lt; b &amp; &quot;c&quot;');
  });

  it('renders inline text formats including the new ones', () => {
    const html = writerDisplayHtml(
      state([{ type: 'paragraph', children: [
        text('strike', 1 << 2),
        text('code', 1 << 4),
        text('sub', 1 << 5),
        text('super', 1 << 6),
      ] }]),
      '',
    );
    expect(html).toContain('<s>strike</s>');
    expect(html).toContain('<code');
    expect(html).toContain('<sub>sub</sub>');
    expect(html).toContain('<sup>super</sup>');
  });

  it('passes through whitelisted inline text styles', () => {
    const html = writerDisplayHtml(
      state([{ type: 'paragraph', children: [
        text('x', 0, 'letter-spacing: 0.05em; text-transform: uppercase; color: #ff0000'),
      ] }]),
      '',
    );
    expect(html).toContain('letter-spacing:0.05em');
    expect(html).toContain('text-transform:uppercase');
    expect(html).toContain('color:#ff0000');
  });

  it('strips dangerous style values', () => {
    const html = writerDisplayHtml(
      state([{ type: 'paragraph', children: [
        text('x', 0, 'background-color: url(javascript:alert(1)); color: #00f'),
      ] }]),
      '',
    );
    expect(html).not.toContain('javascript');
    expect(html).not.toContain('url(');
    expect(html).toContain('color:#00f');
  });

  it('renders quote, code block and horizontal rule nodes', () => {
    const html = writerDisplayHtml(
      state([
        { type: 'quote', children: [text('quoted')] },
        { type: 'code', children: [text('const x = 1')] },
        { type: 'horizontalrule' },
      ]),
      '',
    );
    expect(html).toContain('<blockquote');
    expect(html).toContain('quoted');
    expect(html).toContain('<pre');
    expect(html).toContain('const x = 1');
    expect(html).toContain('<hr');
  });

  it('applies block-level line-height and indent', () => {
    const html = writerDisplayHtml(
      state([{ type: 'paragraph', style: 'line-height: 1.5', indent: 2, children: [text('hi')] }]),
      '',
    );
    expect(html).toContain('line-height:1.5');
    expect(html).toContain('padding-left:40px');
  });
});
