import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd());
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  failures.push(message);
}

function requireContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (!source.includes(marker)) {
      fail(`${relativePath} missing required Phase 6 marker: ${marker}`);
    }
  }
}

function forbidContains(source, relativePath, markers) {
  for (const marker of markers) {
    if (source.includes(marker)) {
      fail(`${relativePath} contains forbidden Phase 6 dependency/token: ${marker}`);
    }
  }
}

const domainPaths = [
  'src/core/header-footer/types.ts',
  'src/core/header-footer/validation.ts',
  'src/core/header-footer/contentValidation.ts',
  'src/core/header-footer/resolutionTypes.ts',
  'src/core/header-footer/selectorResolver.ts',
  'src/core/header-footer/tokenResolver.ts',
  'src/core/header-footer/resolver.ts',
  'src/core/header-footer/commandPlan.ts',
];

const domain = domainPaths.map((relativePath) => ({
  relativePath,
  source: read(relativePath),
}));

for (const { relativePath, source } of domain) {
  forbidContains(source, relativePath, [
    "from 'pdf-lib'",
    'PdfEditAdapter',
    "from 'react'",
    'CommandBus',
    'useSessionStore',
  ]);

  const lineCount = source.split('\n').length;
  if (lineCount > 300) {
    fail(
      `${relativePath} exceeds the Phase 6 300-line production-module guard (${lineCount})`,
    );
  }
}

const typesPath = 'src/core/header-footer/types.ts';
const types = read(typesPath);
requireContains(types, typesPath, [
  'HEADER_FOOTER_TEMPLATE_SCHEMA_VERSION',
  "mode: 'pageIds'",
  "mode: 'range'",
  "mode: 'pageLabelRange'",
  "'physicalPage'",
  "'pageLabel'",
  "'sectionPage'",
  "'sectionPageCount'",
  'binaryResourceId: string',
  'rules: HeaderFooterRule[]',
]);

const validationPath = 'src/core/header-footer/validation.ts';
const validation = read(validationPath);
requireContains(validation, validationPath, [
  'validateHeaderFooterTemplate',
  'pageGraph.pageLabelRanges',
  'excludeFirstPhysicalPage',
  'excludeLastPhysicalPage',
]);

const contentValidationPath = 'src/core/header-footer/contentValidation.ts';
const contentValidation = read(contentValidationPath);
requireContains(contentValidation, contentValidationPath, [
  "token.startsWith('metadata:')",
  "token.startsWith('var:')",
  'validateHeaderFooterBand',
  'validateHeaderFooterTextStyle',
]);

const selectorPath = 'src/core/header-footer/selectorResolver.ts';
const selector = read(selectorPath);
requireContains(selector, selectorPath, [
  'matchesHeaderFooterSelector',
  'sectionForPage',
  'pageLabelRanges',
  'Math.min(start, end)',
  'physicalPageNumber',
]);

const tokenPath = 'src/core/header-footer/tokenResolver.ts';
const tokenResolver = read(tokenPath);
requireContains(tokenResolver, tokenPath, [
  'resolveHeaderFooterText',
  "case 'pageLabel'",
  "case 'sectionPage'",
  "case 'sectionPageCount'",
  "token.startsWith('metadata:')",
  "token.startsWith('var:')",
  'toISOString()',
]);
forbidContains(tokenResolver, tokenPath, [
  'toLocaleDateString',
  'toLocaleTimeString',
]);

const resolverPath = 'src/core/header-footer/resolver.ts';
const resolver = read(resolverPath);
requireContains(resolver, resolverPath, [
  'resolveHeaderFooterTemplate',
  'validateHeaderFooterTemplate',
  'matchesHeaderFooterSelector',
  'sectionForPage',
  'mergeBand',
]);

const pageTypesPath = 'src/core/pages/types.ts';
const pageTypes = read(pageTypesPath);
const pageLabelStyleDeclarations =
  pageTypes.match(/export type PageLabelStyle\s*=/g)?.length ?? 0;
const pageLabelRangeDeclarations =
  pageTypes.match(/export interface PageLabelRange\s*{/g)?.length ?? 0;

if (pageLabelStyleDeclarations !== 1) {
  fail(`${pageTypesPath} must contain exactly one PageLabelStyle declaration`);
}
if (pageLabelRangeDeclarations !== 1) {
  fail(`${pageTypesPath} must contain exactly one PageLabelRange declaration`);
}

const commandPlanPath = 'src/core/header-footer/commandPlan.ts';
const commandPlan = read(commandPlanPath);
requireContains(commandPlan, commandPlanPath, [
  'planHeaderFooterTemplateCommand',
  'requiredBinaryResourceIds',
  'resolveHeaderFooterTemplate',
  'Header/footer template matches no pages.',
]);

const commandTypesPath = 'src/core/commands/types.ts';
const commandTypes = read(commandTypesPath);
requireContains(commandTypes, commandTypesPath, [
  "'APPLY_HEADER_FOOTER_TEMPLATE'",
  'ApplyHeaderFooterTemplateCommand',
  'HeaderFooterTemplate',
]);
if (!commandTypes.includes("'ADD_HEADER_FOOTER_TEXT'")) {
  fail('Phase 6 migration must not prematurely remove the legacy compatibility command');
}

const validatorsPath = 'src/core/commands/validators.ts';
const validators = read(validatorsPath);
requireContains(validators, validatorsPath, [
  "case 'APPLY_HEADER_FOOTER_TEMPLATE'",
  'payload.template.schemaVersion must be 1.',
  'payload.template.rules must contain at least one rule.',
]);

const dispatchPath = 'src/core/commands/dispatch.ts';
const dispatch = read(dispatchPath);
requireContains(dispatch, dispatchPath, [
  "case 'APPLY_HEADER_FOOTER_TEMPLATE'",
  "'Apply header/footer template'",
]);

if (failures.length > 0) {
  console.error('Phase 6 header/footer audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 6 header/footer audit passed.');
