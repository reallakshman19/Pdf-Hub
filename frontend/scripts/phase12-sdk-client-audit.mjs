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
  const fullPath =
    path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    failures.push(
      `missing file: ${relativePath}`,
    );
    return '';
  }
  passes.push(
    `file: ${relativePath}`,
  );
  return read(relativePath);
}

function requireTokens(
  label,
  text,
  tokens,
) {
  for (const token of tokens) {
    if (!text.includes(token)) {
      failures.push(
        `${label}: missing token ${JSON.stringify(token)}`,
      );
    } else {
      passes.push(
        `${label}: ${token}`,
      );
    }
  }
}

function forbidTokens(
  label,
  text,
  tokens,
) {
  for (const token of tokens) {
    if (text.includes(token)) {
      failures.push(
        `${label}: forbidden token ${JSON.stringify(token)}`,
      );
    } else {
      passes.push(
        `${label}: no ${token}`,
      );
    }
  }
}

const source = requireFile(
  'src/sdk-client/pdf-hub-sdk-client.ts',
);
const tests = requireFile(
  'src/sdk-client/__tests__/pdf-hub-sdk-client.test.ts',
);
const vite = requireFile(
  'vite.sdk-client.config.ts',
);
const tsconfig = requireFile(
  'tsconfig.sdk-client.json',
);
const packageJson = requireFile(
  'package.json',
);
const docs = requireFile(
  '../Docs/PUBLIC_SDK.md',
);

forbidTokens(
  'standalone source imports',
  source,
  [
    'import ',
    'import(',
    "from '@/",
    'zustand',
    'commandBus',
    'dispatchPdfCommand',
    'AdmittedDonorPdf',
    'AdmittedDonorSet',
    'pdf-lib',
    'pdfjs-dist',
    'react',
    'core/sdk',
  ],
);

requireTokens(
  'client contract',
  source,
  [
    "PDF_HUB_SDK_CLIENT_VERSION",
    "Object.freeze(['1'] as const)",
    'connectPdfHubSdk',
    'negotiatePdfHubSdkApiVersion',
    'HOST_UNAVAILABLE',
    'INVALID_HOST',
    'VERSION_MISMATCH',
    'globalThis',
    'getCapabilities',
    'subscribeEvents',
  ],
);

requireTokens(
  'vite library build',
  vite,
  [
    "name: 'PDFHubSDKClient'",
    "formats: ['es', 'iife']",
    "'pdf-hub-sdk-client.js'",
    "'pdf-hub-sdk-client.global.js'",
    "outDir: 'dist-sdk-client'",
  ],
);

forbidTokens(
  'iife namespace isolation',
  vite,
  [
    "name: 'PDFHubSDK'",
  ],
);

requireTokens(
  'declaration build',
  tsconfig,
  [
    '"emitDeclarationOnly": true',
    '"declaration": true',
    '"outDir": "./dist-sdk-client"',
    '"src/sdk-client/pdf-hub-sdk-client.ts"',
  ],
);

requireTokens(
  'package scripts',
  packageJson,
  [
    '"build:sdk-client"',
    '"test:phase12-sdk-client"',
    '"audit:phase12-sdk-client"',
    '"certify:phase12-sdk-client"',
  ],
);

requireTokens(
  'focused tests',
  tests,
  [
    'connects to an explicitly injected v1 host',
    'discovers the installed global host',
    'requires host and capability API versions to agree',
    'rejects unsupported host API versions',
  ],
);

requireTokens(
  'documentation',
  docs,
  [
    '## Distributable host client',
    'PDFHubSDKClient',
    'dist-sdk-client',
    'acceptedApiVersions',
    'host-first',
  ],
);

if (failures.length > 0) {
  console.error(
    '=== Phase 12 SDK Client Audit FAILED ===',
  );
  failures.forEach(
    (failure) =>
      console.error(
        `[FAIL] ${failure}`,
      ),
  );
  console.error(
    `${passes.length} check(s) passed before failure.`,
  );
  process.exit(1);
}

console.log(
  '=== Phase 12 SDK Client Audit PASSED ===',
);
console.log(
  `${passes.length} check(s) passed.`,
);
