#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dist = path.join(
  root,
  'dist-sdk-client',
);

const expectedFiles = [
  'pdf-hub-sdk-client.js',
  'pdf-hub-sdk-client.global.js',
  'pdf-hub-sdk-client.d.ts',
];

const failures = [];
const passes = [];

function read(name) {
  return fs.readFileSync(
    path.join(dist, name),
    'utf8',
  );
}

if (!fs.existsSync(dist)) {
  console.error(
    '[FAIL] dist-sdk-client does not exist. Run pnpm run build:sdk-client first.',
  );
  process.exit(1);
}

for (const name of expectedFiles) {
  const fullPath =
    path.join(dist, name);
  if (!fs.existsSync(fullPath)) {
    failures.push(
      `missing artifact: ${name}`,
    );
    continue;
  }

  const size =
    fs.statSync(fullPath).size;
  if (size <= 0) {
    failures.push(
      `empty artifact: ${name}`,
    );
  } else if (size > 64 * 1024) {
    failures.push(
      `artifact unexpectedly large (>64 KiB): ${name} (${size} bytes)`,
    );
  } else {
    passes.push(
      `${name}: ${size} bytes`,
    );
  }
}

if (
  expectedFiles.every((name) =>
    fs.existsSync(
      path.join(dist, name),
    ),
  )
) {
  const esm = read(
    'pdf-hub-sdk-client.js',
  );
  const iife = read(
    'pdf-hub-sdk-client.global.js',
  );
  const declarations = read(
    'pdf-hub-sdk-client.d.ts',
  );

  for (const [
    label,
    text,
  ] of [
    ['esm', esm],
    ['iife', iife],
  ]) {
    for (const forbidden of [
      'zustand',
      'commandBus',
      'dispatchPdfCommand',
      'AdmittedDonorPdf',
      'pdfjs-dist',
      'pdf-lib',
      'react-dom',
    ]) {
      if (text.includes(forbidden)) {
        failures.push(
          `${label}: bundled forbidden runtime signature ${forbidden}`,
        );
      }
    }
  }

  if (
    !esm.includes(
      'connectPdfHubSdk',
    )
  ) {
    failures.push(
      'esm: missing connectPdfHubSdk export',
    );
  }

  if (
    !iife.includes(
      'PDFHubSDKClient',
    )
  ) {
    failures.push(
      'iife: missing PDFHubSDKClient namespace',
    );
  }

  if (
    /\bPDFHubSDK\s*=/.test(iife)
  ) {
    failures.push(
      'iife: must not assign the PDFHubSDK host global',
    );
  }

  if (
    /\bimport\s|\bfrom\s+['"]/.test(
      declarations,
    )
  ) {
    failures.push(
      'declarations: expected a standalone declaration file with no imports',
    );
  }

  for (const required of [
    'PdfHubSdkHost',
    'PdfHubSdkConnection',
    'connectPdfHubSdk',
    'negotiatePdfHubSdkApiVersion',
    'PDF_HUB_SDK_CLIENT_SUPPORTED_API_VERSIONS',
  ]) {
    if (
      !declarations.includes(required)
    ) {
      failures.push(
        `declarations: missing ${required}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(
    '=== Phase 12 SDK Client Artifact Audit FAILED ===',
  );
  failures.forEach(
    (failure) =>
      console.error(
        `[FAIL] ${failure}`,
      ),
  );
  console.error(
    `${passes.length} artifact check(s) passed before failure.`,
  );
  process.exit(1);
}

console.log(
  '=== Phase 12 SDK Client Artifact Audit PASSED ===',
);
passes.forEach(
  (item) =>
    console.log(
      `[PASS] ${item}`,
    ),
);
