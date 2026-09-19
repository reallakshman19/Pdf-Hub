import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
let failed = false;

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function fail(message) {
  failed = true;
  console.error(
    `[phase8-document-source] ${message}`,
  );
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(
        `${relativePath} missing required marker: ${marker}`,
      );
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(
        `${relativePath} contains forbidden marker: ${marker}`,
      );
    }
  }
}

const corePaths = [
  'src/core/document-source/types.ts',
  'src/core/document-source/errors.ts',
  'src/core/document-source/validation.ts',
  'src/core/document-source/registry.ts',
  'src/core/document-source/materialize.ts',
  'src/core/document-source/index.ts',
];

for (const relativePath of corePaths) {
  const source = read(relativePath);
  forbidContains(source, relativePath, [
    '@/adapters/',
    'pdf-lib',
    "from 'react'",
    'zustand',
    '@/core/session/',
    '@/core/commands/',
    'FileAdapter',
  ]);
}

const typesPath =
  'src/core/document-source/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  'export interface DocumentSource',
  'readonly id: string',
  'readonly kind: DocumentSourceKind',
  'readonly capabilities',
  'size(): Promise<number>',
  'read(offset: number, length: number): Promise<Uint8Array>',
  "'memory'",
  "'browser-file'",
  "'opfs'",
]);

const errorsPath =
  'src/core/document-source/errors.ts';
const errors = read(errorsPath);
requireContains(errors, errorsPath, [
  'export class DocumentSourceError',
  "'INVALID_SOURCE_ID'",
  "'INVALID_SOURCE_SIZE'",
  "'INVALID_RANGE'",
  "'OUT_OF_BOUNDS'",
  "'READ_FAILED'",
]);

const validationPath =
  'src/core/document-source/validation.ts';
const validation = read(validationPath);
requireContains(validation, validationPath, [
  'Number.isSafeInteger(size)',
  'Number.isSafeInteger(offset)',
  'Number.isSafeInteger(length)',
  'length > size - offset',
]);

const coreIndexPath =
  'src/core/document-source/index.ts';
const coreIndex = read(coreIndexPath);
forbidContains(coreIndex, coreIndexPath, [
  'MemorySource',
  'BrowserFileSource',
]);

const registryPath =
  'src/core/document-source/registry.ts';
const registry = read(registryPath);
requireContains(registry, registryPath, [
  'registerDocumentSource',
  'resolveDocumentSource',
  'releaseDocumentSource',
  'new Map<string, DocumentSource>()',
]);
forbidContains(registry, registryPath, [
  '@/adapters/',
  '@/core/session/',
  'File',
  'Blob',
]);

const materializePath =
  'src/core/document-source/materialize.ts';
const materialize = read(materializePath);
requireContains(materialize, materializePath, [
  'DEFAULT_DOCUMENT_SOURCE_CHUNK_BYTES',
  'source.size()',
  'source.read(offset, length)',
  'new Uint8Array(size)',
  'output.set(chunk, offset)',
  'maxBytes',
  'throwIfAborted',
]);
forbidContains(materialize, materializePath, [
  'File',
  'Blob',
  'arrayBuffer()',
  '@/adapters/',
]);

const memoryPath =
  'src/adapters/document-source/MemorySource.ts';
const memory = read(memoryPath);
requireContains(memory, memoryPath, [
  'implements DocumentSource',
  'Uint8Array.from(input.bytes)',
  'this.bytes.slice(offset, offset + length)',
  'assertDocumentSourceReadRange',
  "readonly kind = 'memory'",
]);
forbidContains(memory, memoryPath, [
  'pdf-lib',
  '@/core/session/',
  '@/core/commands/',
  "from 'react'",
]);

const browserPath =
  'src/adapters/document-source/BrowserFileSource.ts';
const browser = read(browserPath);
requireContains(browser, browserPath, [
  'implements DocumentSource',
  'this.file.slice(offset, offset + length)',
  'blob.arrayBuffer()',
  'bytes.byteLength !== length',
  'assertDocumentSourceReadRange',
  "readonly kind = 'browser-file'",
]);
forbidContains(browser, browserPath, [
  'this.file.arrayBuffer()',
  'pdf-lib',
  '@/core/session/',
  '@/core/commands/',
  "from 'react'",
]);

const adapterIndexPath =
  'src/adapters/document-source/index.ts';
const adapterIndex = read(adapterIndexPath);
requireContains(adapterIndex, adapterIndexPath, [
  'MemorySource',
  'BrowserFileSource',
]);

const memoryTestPath =
  'src/adapters/document-source/MemorySource.test.ts';
const memoryTest = read(memoryTestPath);
requireContains(memoryTest, memoryTestPath, [
  'snapshots input bytes',
  'returns caller-owned range copies',
  'supports zero-length reads including at EOF',
  "'INVALID_RANGE'",
  "'OUT_OF_BOUNDS'",
]);

const browserTestPath =
  'src/adapters/document-source/BrowserFileSource.test.ts';
const browserTest = read(browserTestPath);
requireContains(browserTest, browserTestPath, [
  'materializes only the requested Blob/File slice',
  'returns independent byte arrays across reads',
  'without materializing a Blob slice',
  "'READ_FAILED'",
]);

const openPdfPath =
  'src/core/admission/openPdf.ts';
const openPdf = read(openPdfPath);
requireContains(openPdf, openPdfPath, [
  'new BrowserFileSource',
  'Math.min(file.size, 1024)',
  'materializeDocumentSource',
  'maxBytes: FileAdapter.MAX_PDF_SIZE_BYTES',
  'registerDocumentSource(documentSource)',
  'sourceId',
]);
forbidContains(openPdf, openPdfPath, [
  'file.arrayBuffer()',
]);

const openPdfTestPath =
  'src/core/admission/openPdf.test.ts';
const openPdfTest = read(openPdfTestPath);
requireContains(openPdfTest, openPdfTestPath, [
  'reads only the bounded signature prefix before rejecting a large non-PDF payload',
  'expect(file.arrayBuffer).not.toHaveBeenCalled()',
  'toHaveBeenCalledWith(0, 1024)',
  'resolveDocumentSource(result.value.sourceId)',
]);

const sessionTypesPath =
  'src/core/session/types.ts';
const sessionTypes = read(sessionTypesPath);
requireContains(sessionTypes, sessionTypesPath, [
  'sourceId: string | null',
]);
forbidContains(sessionTypes, sessionTypesPath, [
  'DocumentSource;',
  'File;',
  'Blob;',
]);

const sessionStorePath =
  'src/core/session/store.ts';
const sessionStore = read(sessionStorePath);
requireContains(sessionStore, sessionStorePath, [
  'sourceId?: string | null',
  'resolveDocumentSource(sourceId)',
  'releaseDocumentSource(previousSourceId)',
  'releaseDocumentSource(get().sourceId)',
  'sourceId: null',
]);

const sessionTestPath =
  'src/core/session/__tests__/session.test.ts';
const sessionTest = read(sessionTestPath);
requireContains(sessionTest, sessionTestPath, [
  'retains only sourceId in session state and releases it on clear',
  'releases the prior source when a different document opens',
  'rejects an unregistered sourceId on open',
  'commitWorkingCopy',
]);

if (failed) {
  process.exit(1);
}

console.log(
  '[phase8-document-source] contract, range adapters, source-aware admission, registry lifecycle, and compatibility materialization guards passed',
);
