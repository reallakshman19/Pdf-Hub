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
    const donorSection = source;

    expect(donorSection).toContain('admitDonorPdfFiles');
    expect(donorSection).toContain('FileAdapter.pickPdfFileSources(multiple)');
    expect(donorSection).toContain("admitDonorSelection(true, 'MERGE_PDF')");
    expect(donorSection).toContain("admitDonorSelection(false, 'INSERT_PAGES')");
    expect(donorSection).toContain("admitDonorSelection(false, 'REPLACE_PAGE')");
    expect(donorSection).not.toContain('FileAdapter.pickPdfFiles');
    expect(donorSection).not.toContain('PdfEditAdapter.countPages(donor');
    expect(donorSection).not.toMatch(/\.arrayBuffer\s*\(/);
    expect(donorSection).toContain('setReplaceDonorSet(null)');
    expect(donorSection).toContain('operation.documentKey !== documentKey');
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

  it('keeps donor capabilities outside canonical serializable command payloads', () => {
    const source = readSource('core/commands/types.ts');
    const commands = source.slice(
      source.indexOf('export type RotatePagesCommand'),
      source.indexOf('export interface CommandResources'),
    );

    expect(commands).toContain("donorResourceId: string");
    expect(commands).toContain("donorResourceIds: string[]");
    expect(commands).not.toContain('AdmittedDonorPdf');
    expect(commands).not.toContain('donorBytes');
    expect(commands).not.toContain('Uint8Array');

    const resources = source.slice(
      source.indexOf('export interface CommandResources'),
      source.indexOf('export interface CommandContext'),
    );
    expect(resources).toContain('AdmittedDonorPdf');
    expect(resources).toContain('Uint8Array');
  });
});
