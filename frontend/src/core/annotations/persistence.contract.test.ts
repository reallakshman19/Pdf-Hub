import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('Annotation Persistence Contract (INV-10)', () => {
  const annotationsDir = __dirname;

  it('persistence.ts does not reference localStorage', () => {
    const code = readFileSync(join(annotationsDir, 'persistence.ts'), 'utf8');
    expect(code).not.toContain('localStorage');
  });

  it('store.ts does not reference localStorage', () => {
    const code = readFileSync(join(annotationsDir, 'store.ts'), 'utf8');
    expect(code).not.toContain('localStorage');
  });

  it('persistence.ts uses IndexedDB (idb import)', () => {
    const code = readFileSync(join(annotationsDir, 'persistence.ts'), 'utf8');
    expect(code).toContain('idb');
  });

  it('no file in core/annotations/ uses localStorage', () => {
    // Read all .ts files in the annotations directory
    const files = readdirSync(annotationsDir)
      .filter((f: string) => f.endsWith('.ts') && !f.includes('.test.'));

    for (const file of files) {
      const content = readFileSync(join(annotationsDir, file), 'utf8');
      expect(content).not.toContain('localStorage');
    }
  });
});
