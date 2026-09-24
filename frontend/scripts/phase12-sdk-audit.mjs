#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];
const passes = [];

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8',
  );
}

function requireFile(relativePath) {
  if (!fs.existsSync(path.join(root, relativePath))) {
    failures.push(`missing file: ${relativePath}`);
    return '';
  }
  passes.push(`file: ${relativePath}`);
  return read(relativePath);
}

function requireTokens(label, text, tokens) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      failures.push(`${label}: missing token ${JSON.stringify(token)}`);
    } else {
      passes.push(`${label}: ${token}`);
    }
  }
}

function forbidTokens(label, text, tokens) {
  for (const token of tokens) {
    if (text.includes(token)) {
      failures.push(`${label}: forbidden token ${JSON.stringify(token)}`);
    } else {
      passes.push(`${label}: no ${token}`);
    }
  }
}

const types = requireFile('src/core/sdk/types.ts');
const sdk = requireFile('src/core/sdk/publicSdk.ts');
const browserGlobal = requireFile('src/core/sdk/browserGlobal.ts');
const index = requireFile('src/core/sdk/index.ts');
const tests = requireFile('src/core/sdk/__tests__/publicSdk.test.ts');
const main = requireFile('src/main.tsx');
const headless = requireFile('src/core/macro/headlessApi.ts');
const moduleEntry = requireFile('src/sdk.ts');
const packageJson = requireFile('package.json');
const docs = requireFile('../Docs/PUBLIC_SDK.md');

requireTokens('types', types, [
  "PDF_HUB_SDK_API_VERSION = '1'",
  'Extract<',
  'PdfCommandDraft',
  "'INSERT_PAGES'",
  "'REPLACE_PAGE'",
  "'MERGE_PDF'",
  "'REPLACE_EXISTING_TEXT'",
  'PdfHubSdkDonorAdmissionRequest',
  'releaseDonorAdmission',
  'subscribeEvents',
  "'INVALID_ARGUMENT'",
]);

forbidTokens('public sdk types', types, [
  'AdmittedDonorPdf',
  'AdmittedDonorSet',
  'PickedPdfFileSource',
  'ResolvedAdmittedDonorPdf',
]);

requireTokens('sdk canonical routing', sdk, [
  "from '@/core/commands/bus'",
  "from '@/core/commands/validators'",
  'materializePdfCommand(',
  'validateCommand(command)',
  "'api'",
  'commandBus.execute({',
]);

forbidTokens('sdk dispatcher boundary', sdk, [
  "from '@/core/commands/dispatch'",
  'dispatchPdfCommand(',
]);

forbidTokens('sdk lint boundary', sdk, [
  'console.log(',
  'console.warn(',
  'console.error(',
]);

requireTokens('sdk donor boundary', sdk, [
  'admitDonorPdfFiles(',
  "'COMMAND_CALLER'",
  'assertAdmittedDonorSetDispatchAllowed(',
  'revokeAdmittedDonorSet(',
  'DONOR_ADMISSION_INVALID',
  'DONOR_ADMISSION_CANCELLED',
  'record.unsubscribeSession?.()',
  "from '@/core/logger/service'",
]);

requireTokens('browser global', browserGlobal, [
  'PDFHubSDK',
  'createPdfHubSdk()',
]);

requireTokens('module entry', moduleEntry, [
  "export * from './core/sdk';",
]);
forbidTokens('module entry side effects', moduleEntry, [
  'browserGlobal',
  'PDFHubSDK =',
  'window.',
]);
requireTokens('private package sdk export', packageJson, [
  '"private": true',
  '"./sdk": "./src/sdk.ts"',
]);

requireTokens('startup', main, [
  "import '@/core/macro/headlessApi';",
  "import '@/core/sdk/browserGlobal';",
]);

requireTokens('legacy headless compatibility', headless, [
  'PDFHubHeadless',
  'executeHeadlessMacro',
  'inspectHeadlessPdfDocument',
  'executeHeadlessPdfCommand',
]);

forbidTokens('legacy headless isolation', headless, [
  'PDFHubSDK',
]);

requireTokens('public exports', index, [
  'PdfHubSdkDonorAdmission',
  'PdfHubSdkDonorCommandTarget',
  'PdfHubSdkDonorResource',
]);

requireTokens('focused tests', tests, [
  'routes supported commands through CommandBus with API source',
  'routes bounded existing-text replacement through CommandBus with API source',
  'rejects malformed existing-text replacement before CommandBus execution',
  'admits donors behind opaque resource IDs and routes them through CommandBus',
  'rejects donor resources after the active document changes',
  'rejects malformed runtime command values before CommandBus execution',
  'emits typed session and command lifecycle events and detaches cleanly',
  'emits a terminal command event when CommandBus throws',
  'isolates event-listener exceptions from SDK and session execution',
  'isolates session-listener exceptions and validates subscription options',
  'rejects malformed execute options before CommandBus execution',
]);

requireTokens('documentation', docs, [
  '## Module consumption',
  '## Runtime validation',
  '## SDK events',
  '## Donor admission',
  'CommandResources.donors',
  'single-use',
  'PDFHubHeadless',
]);

if (failures.length > 0) {
  console.error('=== Phase 12 SDK Audit FAILED ===');
  failures.forEach((item) => console.error(`[FAIL] ${item}`));
  console.error(`${passes.length} check(s) passed before failure.`);
  process.exit(1);
}

console.log('=== Phase 12 SDK Audit PASSED ===');
console.log(`${passes.length} check(s) passed.`);
