import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const ENTRY_POINTS = [
  'pages/LandingPage.tsx',
  'components/toolbar/ToolbarFile.tsx',
  'components/workspace/DocumentWorkspace.tsx',
] as const;

function readSource(relativePath: string): string {
  return readFileSync(new URL(relativePath, new URL('../../', import.meta.url)), 'utf8');
}

describe('primary PDF entry-point admission boundary', () => {
  it.each(ENTRY_POINTS)('%s delegates opening to the shared coordinator', (relativePath) => {
    const source = readSource(relativePath);

    expect(source).toContain('admitAndOpenPdfFile');
    expect(source).not.toContain('PdfEditAdapter.countPages');
    expect(source).not.toContain('FileAdapter.hashBytes');
    expect(source).not.toMatch(/\bopenDocument\s*\(/);
    expect(source).not.toMatch(/\.arrayBuffer\s*\(/);
  });

  it('picker entry points request metadata-first file sources', () => {
    const toolbar = readSource('components/toolbar/ToolbarFile.tsx');
    const workspace = readSource('components/workspace/DocumentWorkspace.tsx');

    expect(toolbar).toContain('FileAdapter.pickPdfFileSources(false)');
    expect(workspace).toContain('FileAdapter.pickPdfFileSources(false)');
  });

  it('resolves the expected frontend source directory', () => {
    expect(SOURCE_ROOT.replaceAll('\\', '/')).toMatch(/\/frontend\/src\/$/);
  });
});
