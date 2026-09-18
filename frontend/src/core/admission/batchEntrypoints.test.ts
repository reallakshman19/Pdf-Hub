import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SOURCE_ROOT = resolve(process.cwd(), 'src');

function readSource(relativePath: string): string {
  return readFileSync(resolve(SOURCE_ROOT, relativePath), 'utf8');
}

describe('batch PDF source boundaries', () => {
  it('routes Automate batch processing through file sources', () => {
    const source = readSource('components/macro/advanced/MacroBatchRunPanel.tsx');
    const batchSection = source.slice(
      source.indexOf('const runBatch = async'),
      source.indexOf('return (', source.indexOf('const runBatch = async')),
    );

    expect(batchSection).toContain('FileAdapter.pickPdfFileSources(true)');
    expect(batchSection).toContain('runMacroBatch({');
    expect(batchSection).toContain('sources,');
    expect(batchSection).toContain('onOutput:');
    expect(batchSection).toContain('FileAdapter.downloadBytes');
    expect(batchSection).not.toContain('FileAdapter.pickPdfFiles(true)');
    expect(batchSection).not.toMatch(/\.arrayBuffer\s*\(/);
  });

  it('keeps the batch runner sequential and source-based', () => {
    const source = readSource('core/macro/batchRunner.ts');
    const options = source.slice(
      source.indexOf('export interface BatchRunOptions'),
      source.indexOf('interface BatchFileRecordBase'),
    );
    const result = source.slice(
      source.indexOf('export interface BatchRunResult'),
      source.indexOf('export async function runMacroBatch'),
    );

    expect(options).toContain('sources: readonly PickedPdfFileSource[]');
    expect(options).not.toContain('files:');
    expect(options).toContain('onOutput?:');
    expect(result).not.toContain('Uint8Array');
    expect(result).not.toContain('ArrayBuffer');
    expect(source).not.toContain('Promise.all');
    expect(source).not.toContain('successes:');
    expect(source).toContain('bytes: execution.finalBytes');
    expect(source).toContain('await options.onOutput?.');
  });
});
