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
  'src/core/header-footer/mutationPlan.ts',
  'src/core/header-footer/editorDraft.ts',
  'src/core/header-footer/imageAdmission.ts',
  'src/core/header-footer/numberingPresets.ts',
  'src/core/header-footer/simpleTextTemplate.ts',
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

const writerPaths = [
  'src/core/header-footer/pdfWriter.ts',
  'src/core/header-footer/pdfWriterGeometry.ts',
  'src/core/header-footer/pdfLibResources.ts',
  'src/core/header-footer/pdfLibContentPreparation.ts',
  'src/core/header-footer/pdfLibPageRenderer.ts',
  'src/core/header-footer/pdfLibHeaderFooterWriter.ts',
  'src/core/header-footer/executeMutation.ts',
  'src/adapters/pdf-mutation/pdfLibHeaderFooter.ts',
];

for (const relativePath of writerPaths) {
  const source = read(relativePath);
  forbidContains(source, relativePath, [
    'PdfEditAdapter',
    "from 'react'",
    'CommandBus',
    'useSessionStore',
    '@/core/commands/',
    '@/components/',
  ]);
  const lineCount = source.split('\n').length;
  if (lineCount > 300) {
    fail(
      `${relativePath} exceeds the Phase 6 300-line production-module guard (${lineCount})`,
    );
  }
}

const uiPaths = [
  'src/components/dialogs/HeaderFooterDialog.tsx',
  'src/components/dialogs/header-footer/HeaderFooterSlotGrid.tsx',
  'src/components/dialogs/header-footer/HeaderFooterOptionsPanel.tsx',
  'src/components/dialogs/header-footer/HeaderFooterTokenBar.tsx',
  'src/components/dialogs/header-footer/HeaderFooterNumberingPresetBar.tsx',
  'src/components/dialogs/header-footer/HeaderFooterPreview.tsx',
  'src/components/dialogs/header-footer/HeaderFooterPreviewPane.tsx',
  'src/components/dialogs/header-footer/useHeaderFooterImageEditor.ts',
  'src/components/dialogs/header-footer/useHeaderFooterImageResource.ts',
  'src/components/dialogs/header-footer/HeaderFooterImagePanel.tsx',
];

for (const relativePath of uiPaths) {
  const source = read(relativePath);
  forbidContains(source, relativePath, [
    'PdfEditAdapter',
    "'pdf-lib'",
    '"pdf-lib"',
    'useSessionStore',
    'CommandBus',
    'ADD_HEADER_FOOTER_TEXT',
  ]);
  const lineCount = source.split('\n').length;
  if (lineCount > 300) {
    fail(
      `${relativePath} exceeds the Phase 6 UI 300-line component guard (${lineCount})`,
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

const editorDraftPath = 'src/core/header-footer/editorDraft.ts';
const editorDraft = read(editorDraftPath);
requireContains(editorDraft, editorDraftPath, [
  'compileHeaderFooterEditorDraft',
  "mode: 'pageIds'",
  "mode: 'pageLabelRange'",
  'selectedPageIds',
  'currentPageId',
  'HeaderFooterEditorImageDraft',
  'binaryResourceId: image.resourceId',
  "fit: 'contain'",
]);

const numberingPresetsPath =
  'src/core/header-footer/numberingPresets.ts';
const numberingPresets = read(numberingPresetsPath);
requireContains(numberingPresets, numberingPresetsPath, [
  'PRINTED_NUMBERING_PRESETS',
  "'page-n'",
  "'page-n-of-m'",
  "'logical-label'",
  "'section-page-of-total'",
  "'appendix-label'",
  'createPrintedNumberingRule',
  'applyPrintedNumberingPresetToDraft',
  'Page {{physicalPage}}',
  'Page {{physicalPage}} of {{pageCount}}',
  '{{pageLabel}}',
  'Page {{sectionPage}} of {{sectionPageCount}}',
]);
forbidContains(numberingPresets, numberingPresetsPath, [
  'SET_PAGE_LABELS',
  'writePdfPageLabels',
  'PdfEditAdapter',
  'CommandBus',
  "from 'react'",
  'ADD_HEADER_FOOTER_TEXT',
]);

const dialogPath = 'src/components/dialogs/HeaderFooterDialog.tsx';
const dialog = read(dialogPath);
requireContains(dialog, dialogPath, [
  'compileHeaderFooterEditorDraft',
  'resolveHeaderFooterTemplate',
  'HeaderFooterSlotGrid',
  'HeaderFooterNumberingPresetBar',
  'applyPrintedNumberingPresetToDraft',
  'HeaderFooterImagePanel',
  'HeaderFooterPreviewPane',
  'useHeaderFooterImageEditor',
  'imageEditor.binaryResources',
  'Logical PDF PageLabels remain',
]);

const previewPath =
  'src/components/dialogs/header-footer/HeaderFooterPreview.tsx';
const preview = read(previewPath);
requireContains(preview, previewPath, [
  'createHeaderFooterVisualGeometry',
  'physicalPageNumber',
  'logicalPageLabel',
  'slotWidthPt',
  'content.binaryResourceId',
]);

const imageAdmissionPath =
  'src/core/header-footer/imageAdmission.ts';
const imageAdmission = read(imageAdmissionPath);
requireContains(imageAdmission, imageAdmissionPath, [
  'admitWriterImageFile',
  "admitted.format === 'webp'",
  'PNG and JPEG only',
  'resourceId: createHeaderFooterImageResourceId()',
]);
forbidContains(imageAdmission, imageAdmissionPath, [
  'data:image/',
  'base64',
  'FileReader',
]);

const imageResourceHookPath =
  'src/components/dialogs/header-footer/useHeaderFooterImageResource.ts';
const imageResourceHook = read(imageResourceHookPath);
requireContains(imageResourceHook, imageResourceHookPath, [
  'URL.createObjectURL',
  'URL.revokeObjectURL',
  'AbortController',
  'admitHeaderFooterImageFile',
]);

const toolbarOrganizePath = 'src/components/toolbar/ToolbarOrganize.tsx';
const toolbarOrganize = read(toolbarOrganizePath);
requireContains(toolbarOrganize, toolbarOrganizePath, [
  'HeaderFooterDialog',
  'handleHeaderFooterApply',
  "type: 'APPLY_HEADER_FOOTER_TEMPLATE'",
  'payload: { template }',
  'resources: { binaries: binaryResources }',
  'aria-label="Header & Footer"',
]);
const headerFooterHandlerStart =
  toolbarOrganize.indexOf('const handleHeaderFooterApply');
const headerFooterHandlerEnd =
  toolbarOrganize.indexOf('const handleMerge', headerFooterHandlerStart);
if (
  headerFooterHandlerStart < 0
  || headerFooterHandlerEnd <= headerFooterHandlerStart
) {
  fail('Toolbar Organize canonical header/footer handler boundary is missing');
} else {
  forbidContains(
    toolbarOrganize.slice(
      headerFooterHandlerStart,
      headerFooterHandlerEnd,
    ),
    toolbarOrganizePath,
    ['ADD_HEADER_FOOTER_TEXT', 'PdfEditAdapter'],
  );
}

const simpleTextTemplatePath =
  'src/core/header-footer/simpleTextTemplate.ts';
const simpleTextTemplate = read(simpleTextTemplatePath);
requireContains(simpleTextTemplate, simpleTextTemplatePath, [
  'createSimpleHeaderFooterTextTemplate',
  'HeaderFooterPageSelector',
  "kind: 'text'",
  'template: input.text',
]);
forbidContains(simpleTextTemplate, simpleTextTemplatePath, [
  'ADD_HEADER_FOOTER_TEXT',
  'PdfEditAdapter',
  'header_footer_text',
]);

const thumbnailActionStripPath =
  'src/components/sidebar/thumbnails/ThumbnailActionStrip.tsx';
const thumbnailActionStrip = read(thumbnailActionStripPath);
requireContains(thumbnailActionStrip, thumbnailActionStripPath, [
  'createSimpleHeaderFooterTextTemplate',
  "type: 'APPLY_HEADER_FOOTER_TEMPLATE'",
  "mode: 'pageIds'",
  'targetPageIds',
  'Page {{physicalPage}} of {{pageCount}}',
  '{{fileName}}',
]);
forbidContains(thumbnailActionStrip, thumbnailActionStripPath, [
  'ADD_HEADER_FOOTER_TEXT',
  'Page {page}',
  "'{file}'",
]);

const thumbnailConfigPath =
  'src/components/sidebar/thumbnails/ThumbnailMacroConfigDialog.tsx';
const thumbnailConfig = read(thumbnailConfigPath);
requireContains(thumbnailConfig, thumbnailConfigPath, [
  'createSimpleHeaderFooterTextTemplate',
  "type: 'APPLY_HEADER_FOOTER_TEMPLATE'",
  'pageIds: PageId[]',
  "mode: 'pageIds'",
  '{{physicalPage}}',
  '{{fileName}}',
]);
forbidContains(thumbnailConfig, thumbnailConfigPath, [
  'ADD_HEADER_FOOTER_TEXT',
  'pageNumberToken',
  'fileNameToken',
]);

const automateSidebarSource = read(
  'src/components/sidebar/AutomateSidebar.tsx',
);
const quickActionStart =
  automateSidebarSource.indexOf('const QUICK_ACTION_IDS');
const quickActionEnd =
  automateSidebarSource.indexOf('] as const;', quickActionStart);
if (quickActionStart < 0 || quickActionEnd <= quickActionStart) {
  fail('Automate quick-action ID boundary is missing');
} else {
  forbidContains(
    automateSidebarSource.slice(quickActionStart, quickActionEnd),
    'src/components/sidebar/AutomateSidebar.tsx',
    ['footer-page-numbers', 'header-file-name'],
  );
}

const legacyMacroCompatPath =
  'src/core/macro/compat/headerFooterTextCompat.ts';
const legacyMacroCompat = read(legacyMacroCompatPath);
requireContains(legacyMacroCompat, legacyMacroCompatPath, [
  'compileLegacyHeaderFooterTextStep',
  'translateLegacyHeaderFooterText',
  'createSimpleHeaderFooterTextTemplate',
  "'{{page}}'",
  "'{page}'",
  "'{{total_pages}}'",
  "'{{file_name}}'",
  "'{{date}}'",
  '{{var:',
]);
forbidContains(legacyMacroCompat, legacyMacroCompatPath, [
  'PdfEditAdapter',
  'addHeaderFooterText',
  'ADD_HEADER_FOOTER_TEXT',
  "from 'pdf-lib'",
]);

const legacyMacroContentOpsPath =
  'src/core/macro/steps/content-ops.ts';
const legacyMacroContentOps = read(legacyMacroContentOpsPath);
const legacyMacroExecutorStart =
  legacyMacroContentOps.indexOf('async function executeHeaderFooterText');
const legacyMacroExecutorEnd =
  legacyMacroContentOps.indexOf(
    "macroRegistry.register('header_footer_text'",
    legacyMacroExecutorStart,
  );
if (
  legacyMacroExecutorStart < 0
  || legacyMacroExecutorEnd <= legacyMacroExecutorStart
) {
  fail('Legacy macro header/footer compatibility executor boundary is missing');
} else {
  const legacyMacroExecutor = legacyMacroContentOps.slice(
    legacyMacroExecutorStart,
    legacyMacroExecutorEnd,
  );
  requireContains(
    legacyMacroExecutor,
    legacyMacroContentOpsPath,
    [
      'FileAdapter.hashBytes',
      'buildPageGraphFromPdfBytes',
      'compileLegacyHeaderFooterTextStep',
      'executeHeaderFooterTemplateMutation',
      'pageIds',
    ],
  );
  forbidContains(
    legacyMacroExecutor,
    legacyMacroContentOpsPath,
    [
      'addHeaderFooterText',
      'ADD_HEADER_FOOTER_TEXT',
    ],
  );
}

const macroOpSchemaPath =
  'src/core/macro/schema/opSchema.ts';
const macroOpSchema = read(macroOpSchemaPath);
requireContains(macroOpSchema, macroOpSchemaPath, [
  'getCreatableMacroOpSchemas',
  "schema.op !== 'header_footer_text'",
]);
requireContains(
  read('src/components/macro/builder/MacroRecipeBuilder.tsx'),
  'src/components/macro/builder/MacroRecipeBuilder.tsx',
  [
    'getCreatableMacroOpSchemas',
  ],
);

const builtInRecipesPath =
  'src/core/macro/recipes/builtInRecipes.ts';
const builtInRecipes = read(builtInRecipesPath);
requireContains(builtInRecipes, builtInRecipesPath, [
  "const LEGACY_HEADER_FOOTER_OP = 'header_footer_text'",
  '!item.requiredOps.includes(LEGACY_HEADER_FOOTER_OP)',
  'findBuiltInMacroRecipe',
]);

const automateHeaderFooterPath =
  'src/components/sidebar/automate/AutomateHeaderFooterQuickAction.tsx';
const automateHeaderFooter = read(automateHeaderFooterPath);
requireContains(automateHeaderFooter, automateHeaderFooterPath, [
  'automate-header-footer',
  'HeaderFooterDialog',
  "type: 'APPLY_HEADER_FOOTER_TEMPLATE'",
  'payload: { template }',
  "'macro-runner'",
  'binaries: binaryResources',
  'Logical PageLabels are unchanged',
]);
forbidContains(automateHeaderFooter, automateHeaderFooterPath, [
  'ADD_HEADER_FOOTER_TEXT',
  'header_footer_text',
  'PdfEditAdapter',
  "'pdf-lib'",
  '"pdf-lib"',
  'MacroStep',
]);
if (automateHeaderFooter.split('\n').length > 300) {
  fail('Automate header/footer task exceeds the Phase 6 300-line component guard');
}

const automateSidebarPath = 'src/components/sidebar/AutomateSidebar.tsx';
const automateSidebar = read(automateSidebarPath);
requireContains(automateSidebar, automateSidebarPath, [
  'AutomateHeaderFooterQuickAction',
]);

const headlessApiPath = 'src/core/macro/headlessApi.ts';
const headlessApi = read(headlessApiPath);
requireContains(headlessApi, headlessApiPath, [
  'HeadlessSupportedPdfCommandDraft',
  "'SET_PAGE_LABELS'",
  "'APPLY_HEADER_FOOTER_TEMPLATE'",
  'executeHeaderFooterTemplateMutation',
  'options.binaryResources',
  "fileName: options.fileName ?? 'headless.pdf'",
  "now: new Date(command.createdAt)",
]);
const headlessCommandStart = headlessApi.indexOf(
  'export async function executeHeadlessPdfCommand',
);
const headlessMacroStart = headlessApi.indexOf(
  'export async function executeHeadlessMacro',
  headlessCommandStart,
);
if (headlessCommandStart < 0 || headlessMacroStart <= headlessCommandStart) {
  fail('Headless canonical command boundary is missing');
} else {
  forbidContains(
    headlessApi.slice(headlessCommandStart, headlessMacroStart),
    headlessApiPath,
    [
      'header_footer_text',
      'ADD_HEADER_FOOTER_TEXT',
      'PdfEditAdapter',
      'executeMacroRecipe',
    ],
  );
}

const macroTypesPath = 'src/core/macro/types.ts';
const macroTypes = read(macroTypesPath);
if (
  macroTypes.includes("op: 'header_footer_template'")
  || macroTypes.includes('op: "header_footer_template"')
  || macroTypes.includes("op: 'apply_header_footer_template'")
  || macroTypes.includes('op: "apply_header_footer_template"')
) {
  fail(
    'Phase 6G must not introduce a parallel macro-specific header/footer template operation',
  );
}
if (!macroTypes.includes("op: 'header_footer_text'")) {
  fail(
    'Saved-workflow compatibility must retain the legacy header_footer_text DSL entry',
  );
}

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
forbidContains(commandTypes, commandTypesPath, [
  "'ADD_HEADER_FOOTER_TEXT'",
  'AddHeaderFooterTextCommand',
  'HeaderFooterCommandOptions',
]);

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

requireContains(dispatch, dispatchPath, [
  'prepareHeaderFooterTemplateMutation',
  'mutationSession.applyHeaderFooter',
  'mutationSession.commit',
  'applyMutation(',
]);
const canonicalCaseStart = dispatch.lastIndexOf(
  "case 'APPLY_HEADER_FOOTER_TEMPLATE'",
);
const nextCommandCase = dispatch.indexOf(
  "case 'DRAW_TEXT_ON_PAGES'",
  canonicalCaseStart,
);
if (
  canonicalCaseStart < 0
  || nextCommandCase <= canonicalCaseStart
) {
  fail('Canonical header/footer dispatch boundary is missing');
} else {
  const canonicalDispatchSlice = dispatch.slice(
    canonicalCaseStart,
    nextCommandCase,
  );
  forbidContains(canonicalDispatchSlice, dispatchPath, [
    'PdfEditAdapter',
    'addHeaderFooterText',
    'ADD_HEADER_FOOTER_TEXT',
  ]);
  requireContains(canonicalDispatchSlice, dispatchPath, [
    'prepareHeaderFooterTemplateMutation',
    'requirePersistentMutationSession',
    'mutationSession.applyHeaderFooter',
    'mutationSession.commit',
    'applyMutation(',
  ]);
  forbidContains(canonicalDispatchSlice, dispatchPath, [
    'executeHeaderFooterTemplateMutation',
    'pdfLibHeaderFooterWriter',
  ]);
}
forbidContains(dispatch, dispatchPath, [
  "case 'ADD_HEADER_FOOTER_TEXT'",
  'addHeaderFooterText',
]);
forbidContains(validators, validatorsPath, [
  "case 'ADD_HEADER_FOOTER_TEXT'",
]);

const pdfEditAdapterPath =
  'src/adapters/pdf-edit/PdfEditAdapter.ts';
const pdfEditAdapter = read(pdfEditAdapterPath);
forbidContains(pdfEditAdapter, pdfEditAdapterPath, [
  'addHeaderFooterText',
  'HeaderFooterOptions',
]);

const acceptanceTestPath =
  'src/core/header-footer/phase6Acceptance.test.ts';
const acceptanceTest = read(acceptanceTestPath);
requireContains(acceptanceTest, acceptanceTestPath, [
  'Phase 6 header/footer acceptance',
  'resolveHeaderFooterTemplate',
  'executeHeaderFooterTemplateMutation',
  'reorderPageGraphByOrder',
  'reanchorPageLabelRangesAfterGraphChange',
  'applyUndo',
  'applyRedo',
  'getPageLabels',
  'Page 1 of 3',
  'Appendix A',
]);

const contentPreparationPath =
  'src/core/header-footer/pdfLibContentPreparation.ts';
const contentPreparation = read(contentPreparationPath);
requireContains(contentPreparation, contentPreparationPath, [
  'prepareHeaderFooterContent',
  "content.fit === 'cover'",
  'containScale',
  'requires clipping',
]);

const writerPath = 'src/core/header-footer/pdfLibHeaderFooterWriter.ts';
const writer = read(writerPath);
requireContains(writer, writerPath, [
  'pdfLib()',
  'applyPdfLibHeaderFooterPlan',
  'raceWithAbort',
]);

const pdfLibPlanPath =
  'src/adapters/pdf-mutation/pdfLibHeaderFooter.ts';
const pdfLibPlan = read(pdfLibPlanPath);
requireContains(pdfLibPlan, pdfLibPlanPath, [
  'applyPdfLibHeaderFooterPlan',
  'createHeaderFooterPdfLibResources',
  'renderPdfMutationHeaderFooterPage',
  'document.getPage(resolved.pageIndex)',
]);

const geometryPath = 'src/core/header-footer/pdfWriterGeometry.ts';
const geometry = read(geometryPath);
requireContains(geometry, geometryPath, [
  'visualPointToPdf',
  'normalizeQuarterTurn',
  'case 90',
  'case 180',
  'case 270',
]);

const mutationPath = 'src/core/header-footer/executeMutation.ts';
const mutation = read(mutationPath);
requireContains(mutation, mutationPath, [
  'prepareHeaderFooterTemplateMutation',
  'planHeaderFooterTemplateCommand',
  'compileHeaderFooterMutationPlan',
  "'RESOURCE_MISSING'",
  'isOperationCancelledError',
  'pdfLibHeaderFooterWriter',
]);

if (failures.length > 0) {
  console.error('Phase 6 header/footer audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('Phase 6 header/footer audit passed.');
