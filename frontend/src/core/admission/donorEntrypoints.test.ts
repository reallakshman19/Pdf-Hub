import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');

function readSource(relativePath: string): string {
  return readFileSync(resolve(SOURCE_ROOT, relativePath), 'utf8');
}

describe('donor PDF admission source boundaries', () => {
  it('routes all toolbar donor operations through shared admission', () => {
    const source = readSource('components/toolbar/ToolbarOrganize.tsx');
    const donorSection = source.slice(0, source.indexOf('const confirmBatchRun'));

    expect(donorSection).toContain('admitDonorPdfFiles');
    expect(donorSection).toContain('FileAdapter.pickPdfFileSources(true)');
    expect(donorSection).toContain('FileAdapter.pickPdfFileSources(false)');
    expect(donorSection).not.toContain('FileAdapter.pickPdfFiles');
    expect(donorSection).not.toContain('PdfEditAdapter.countPages(donor');
    expect(donorSection).not.toMatch(/\.arrayBuffer\s*\(/);
  });

  it('routes thumbnail replacement through the same admission boundary', () => {
    const source = readSource(
      'components/sidebar/thumbnails/ThumbnailContextMenu.tsx',
    );

    expect(source).toContain('admitDonorPdfFiles');
    expect(source).toContain('FileAdapter.pickPdfFileSources(false)');
    expect(source).not.toContain('FileAdapter.pickPdfFiles');
    expect(source).not.toMatch(/\.arrayBuffer\s*\(/);
  });

  it('removes raw donor byte fields from protected command types', () => {
    const source = readSource('core/commands/types.ts');
    const commands = source.slice(
      source.indexOf('export type DocumentCommand'),
      source.indexOf('export interface CommandContext'),
    );

    expect(commands).toContain("type: 'MERGE_PDF'; donors:");
    expect(commands).toContain("type: 'INSERT_PAGES'; atIndex: number; donor:");
    expect(commands).toContain("type: 'REPLACE_PAGE'; atIndex: number; donor:");
    expect(commands).not.toContain('additionalBytes');
    expect(commands).not.toContain('newBytes: Uint8Array');
    expect(commands).not.toContain('donorBytes');
  });
});
