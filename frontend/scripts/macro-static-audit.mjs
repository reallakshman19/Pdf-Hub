import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
  {
    id: 'MACRO_ENGINE_TYPES',
    file: 'src/core/macro/types.ts',
    required: [/MacroRecipe/, /MacroStep/, /MacroExecutionContext/, /conditional/, /apply_template_vars/],
    forbidden: [],
    message: 'Macro type contract must include recipe, steps, context, and logic ops.',
  },
  {
    id: 'MACRO_REGISTRY_SAFE_ERROR',
    file: 'src/core/macro/registry.ts',
    required: [/No executor registered/, /try/, /catch/, /sideEffects/],
    forbidden: [],
    message: 'Macro registry must return structured errors and side effects.',
  },
  {
    id: 'MACRO_EXECUTOR_ROLLBACK',
    file: 'src/core/macro/executor.ts',
    required: [/simulateMacroDryRun/, /beginMacroTransaction/, /rollbackMacroTransaction/, /applySideEffectToState/, /abortOnError/],
    forbidden: [/from '\.\/steps\/logic-ops'/],
    message: 'Executor must dry-run, rollback, and avoid direct step cycles.',
  },
  {
    id: 'MACRO_SIDE_EFFECTS_MODULE',
    file: 'src/core/macro/side-effects.ts',
    required: [/applySideEffectToState/, /bytes_updated/, /page_count_changed/, /selection_changed/],
    forbidden: [],
    message: 'Shared side-effect handling module must exist.',
  },
  {
    id: 'MACRO_SECURITY',
    file: 'src/core/macro/security.ts',
    required: [/sanitizeMacroHtml/, /sanitizeMacroStyle/, /isSafeMacroImageSrc/, /safeMacroFontFamily/, /url\\s\*\\\(/, /expression\\s\*\\\(/, /javascript:/],
    forbidden: [],
    message: 'Macro security helpers must block unsafe HTML/CSS/image sources.',
  },
  {
    id: 'MACRO_CONTENT_OPS_NO_MUTATION_ON_ERROR',
    file: 'src/core/macro/steps/content-ops.ts',
    required: [/diagnostics\.status === ['"]error['"]/, /Unsafe image source blocked/, /renderSafeRichTextboxPreview/, /renderSafeTablePreview/],
    forbidden: [],
    custom: assertContentOpsErrorBranchDoesNotMutate,
    message: 'Content ops must not emit bytes_updated on error.',
  },
  {
    id: 'MACRO_VALIDATOR_SCHEMA',
    file: 'src/core/macro/validator.ts',
    required: [/validateMacroRecipe/, /macroRegistry\.has/, /validateMacroStepByOp/],
    forbidden: [],
    message: 'Macro validator must check registry and op validators.',
  },
  {
    id: 'MACRO_OP_SCHEMA_COVERAGE',
    file: 'src/core/macro/schema/schemaCoverage.ts',
    required: [/SUPPORTED_MACRO_OPS/, /validateMacroSchemaCoverage/, /conditional/, /adjust_image/],
    forbidden: [],
    message: 'Macro schema coverage helper must exist.',
  },
  {
    id: 'MACRO_BUILDER_RECURSIVE_VALIDATION',
    file: 'src/core/macro/builder/recipeBuilderState.ts',
    required: [/validateMacroStepsWithSchema/, /step\.op === 'conditional'/, /step\.then/, /step\.else/, /field\.min/, /field\.max/],
    forbidden: [],
    message: 'Recipe builder validation must recursively validate conditional nested steps.',
  },
  {
    id: 'MACRO_RECIPES_STORAGE',
    file: 'src/core/macro/recipes/recipeStorage.ts',
    required: [/pdfhub\.macro\.customRecipes\.v1/, /validateMacroRecipeWithSchema/, /importMacroRecipeJson/, /exportMacroRecipeJson/],
    forbidden: [],
    message: 'Macro recipe storage must use dedicated key and validation.',
  },
  {
    id: 'MACRO_BUILDER_UI',
    file: 'src/components/macro/builder/MacroRecipeBuilder.tsx',
    required: [/data-macro-builder="true"/, /validateMacroRecipeWithSchema/, /executeMacroRecipe/, /upsertCustomMacroRecipe/, /runRecipe\(true\)/, /runRecipe\(false\)/],
    forbidden: [],
    message: 'Macro builder UI must validate, dry-run, run, save, and protect paste.',
  },
  {
    id: 'MACRO_FIELD_EDITOR_SYNC',
    file: 'src/components/macro/builder/MacroFieldEditor.tsx',
    required: [/useEffect/, /setText\(serialized\)/, /data-macro-builder="true"/],
    forbidden: [],
    message: 'Macro JSON field editor must sync value changes and protect paste.',
  },
  {
    id: 'MACRO_DROPDOWN',
    file: 'src/components/macro/MacroDropdown.tsx',
    required: [/MacroDropdown/, /executeMacroRecipe/, /validateMacroRecipeWithSchema/, /onOpenBuilder/, /Recommended built-ins/, /No macro execution context is available/],
    forbidden: [],
    message: 'Macro dropdown must run/validate recipes, report missing context, and open builder.',
  },
  {
    id: 'MACRO_PANEL',
    file: 'src/components/macro/MacroPanel.tsx',
    required: [/MacroPanel/, /macroUiReducer/, /MacroDropdown/, /MacroRecipeBuilder/, /MacroRunResultPanel/, /onCommitBytes/, /isMacroDryRunResult/],
    forbidden: [],
    message: 'Macro panel must wire dropdown, builder, result panel, and non-dry-run byte commit guard.',
  },
  {
    id: 'MACRO_CONTEXT_ADAPTER',
    file: 'src/core/macro/integration/macroExecutionContextAdapter.ts',
    required: [/createMacroExecutionContextFromSnapshot/, /validateRuntimeSnapshot/, /applyMacroBytesToSnapshot/, /Uint8Array/],
    forbidden: [],
    message: 'Macro execution context adapter must exist.',
  },
  {
    id: 'MACRO_CERT_DOC',
    file: 'MACRO_CERTIFICATION.md',
    required: [/npm run certify:macro/, /TypeScript errors/, /Dry-run bytes mutated/, /Unsafe image/, /Invalid nested conditional/],
    forbidden: [],
    message: 'Macro certification document must exist.',
  },
];

let failures = 0;

for (const check of checks) {
  const filePath = path.join(root, check.file);

  if (!fs.existsSync(filePath)) {
    fail(check, `Missing file: ${check.file}`);
    continue;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let failed = false;

  for (const pattern of check.required) {
    if (!pattern.test(content)) {
      fail(check, `Required pattern missing: ${pattern}`);
      failed = true;
    }
  }

  for (const pattern of check.forbidden) {
    if (pattern.test(content)) {
      fail(check, `Forbidden pattern found: ${pattern}`);
      failed = true;
    }
  }

  if (check.custom) {
    const customResult = check.custom(content);
    if (customResult !== true) {
      fail(check, customResult);
      failed = true;
    }
  }

  if (!failed) {
    console.log(`[PASS] ${check.id}`);
  }
}

if (failures > 0) {
  console.error(`\nMacro static audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nMacro static audit passed.');

function fail(check, detail) {
  console.error(`[FAIL] ${check.id}`);
  console.error(`       ${detail}`);
  console.error(`       ${check.message}`);
  failures += 1;
}

function assertContentOpsErrorBranchDoesNotMutate(content) {
  const branch = content.match(/if \(diagnostics\.status === ['"]error['"]\) \{([\s\S]*?)\n  \}\n\n  return \{/);

  if (!branch) {
    return 'Could not locate diagnostics.status error branch in content-ops.ts.';
  }

  if (/bytes_updated/.test(branch[1])) {
    return 'Error branch contains bytes_updated side effect.';
  }

  return true;
}
