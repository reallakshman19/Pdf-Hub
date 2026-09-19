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
  console.error(`[phase8-renderer-source] ${message}`);
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${relativePath} missing required marker: ${marker}`);
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(`${relativePath} contains forbidden marker: ${marker}`);
    }
  }
}

const transportPath =
  'src/adapters/pdf-renderer/PdfJsDocumentSourceTransport.ts';
const transport = read(transportPath);
requireContains(transport, transportPath, [
  'extends PDFDataRangeTransport',
  'super(input.size, null)',
  'requestDataRange(begin: number, end: number)',
  'this.source.read(begin, length)',
  'this.onDataRange(begin, chunk)',
  'override abort(): void',
  'rangeBytesDelivered',
  'maxRequestedRangeBytes',
]);
forbidContains(transport, transportPath, [
  'materializeDocumentSource',
  'FileAdapter',
  'useSessionStore',
  'zustand',
  'pdf-lib',
]);

const cachePath =
  'src/adapters/pdf-renderer/PdfDocumentLeaseCache.ts';
const cache = read(cachePath);
requireContains(cache, cachePath, [
  'acquireDocumentSource(',
  'sourceCacheKey(',
  'return `source:${publicKey}`',
  'range: transport',
  'rangeChunkSize: 64 * 1024',
  'disableRange: false',
  'disableStream: true',
  'disableAutoFetch: true',
  'getSourceDiagnostics()',
  'entry.sourceTransport?.abort()',
  'source entries never collide with byte entries',
]);
forbidContains(cache, cachePath, [
  '@/core/session/',
  'useSessionStore',
  'zustand',
  'materializeDocumentSource',
  'FileAdapter',
  'pdf-lib',
]);

const sourceStart = cache.indexOf(
  'async acquireDocumentSource(',
);
const sourceEnd = cache.indexOf(
  'getDiagnostics()',
  sourceStart,
);
if (sourceStart < 0 || sourceEnd < 0) {
  fail(
    'Could not isolate PdfDocumentLeaseCache.acquireDocumentSource implementation.',
  );
} else {
  const sourcePath = cache.slice(
    sourceStart,
    sourceEnd,
  );
  for (const forbidden of [
    'clonePdfBytes',
    'digestHex',
    'FileAdapter.hashBytes',
    'materializeDocumentSource',
  ]) {
    if (sourcePath.includes(forbidden)) {
      fail(
        `acquireDocumentSource must not use ${forbidden}.`,
      );
    }
  }
}

const rendererPath =
  'src/adapters/pdf-renderer/PdfRendererAdapter.ts';
const renderer = read(rendererPath);
requireContains(renderer, rendererPath, [
  'pdfDocumentLeaseCache.acquireDocument(',
  'pdfDocumentLeaseCache.acquireDocumentSource(',
  'pdfDocumentLeaseCache.getDiagnostics()',
  'pdfDocumentLeaseCache.getSourceDiagnostics()',
  'pdfDocumentLeaseCache.clear(options)',
]);
forbidContains(renderer, rendererPath, [
  '@/core/session/',
  'useSessionStore',
  'zustand',
  'materializeDocumentSource',
]);

const transportTestPath =
  'src/adapters/pdf-renderer/PdfJsDocumentSourceTransport.test.ts';
const transportTest = read(transportTestPath);
requireContains(transportTest, transportTestPath, [
  'maps PDF.js [begin,end) requests to exact DocumentSource reads',
  'suppresses a late range delivery after abort',
  'reports a source read failure once',
  'fails if a source violates exact-length read semantics',
]);

const rendererTestPath =
  'src/adapters/pdf-renderer/PdfRendererAdapter.test.ts';
const rendererTest = read(rendererTestPath);
requireContains(rendererTest, rendererTestPath, [
  'loads a DocumentSource through PDF.js range transport without whole-source reads',
  'reuses one source-backed PDF.js document for the same revision key',
  'keeps source-backed cache entries isolated from byte-backed admission entries',
  'removes a failed source load so the revision can retry',
  'force-clears a source-backed entry by aborting its transport and destroying its document',
  'does not destroy a shared source load when only one waiting acquisition is cancelled',
  "cacheKey: 'sha256:source-one'",
]);

const moduleLimits = [
  [transportPath, transport, 220],
  [cachePath, cache, 500],
  [rendererPath, renderer, 600],
];

for (const [relativePath, source, limit] of moduleLimits) {
  const lineCount = source.split('\n').length;
  if (lineCount > limit) {
    fail(
      `${relativePath} exceeds ${limit} lines (${lineCount}).`,
    );
  }
}

if (failed) process.exit(1);

console.log(
  '[phase8-renderer-source] PDF.js range transport, source-cache isolation and no-materialization guards passed',
);
