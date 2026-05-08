PDF HUB — MACRO MODULE CONSOLIDATED README
==========================================

This package contains phase/wave-wise implementation workbooks for activating and certifying the PDF Hub Macro module, including a custom recipe builder and expanded macro recipe catalog.

Contents:
- README_CONSOLIDATED.txt
- WAVE_0_BASELINE_CONTRACT_FREEZE.txt
- WAVE_1_ENGINE_SAFETY_CODE.txt
- WAVE_2_SECURITY_VALIDATION_CODE.txt
- WAVE_3_SCHEMA_RECIPE_CATALOG_CODE.txt
- WAVE_4_CUSTOM_RECIPE_BUILDER_UI_CODE.txt
- WAVE_5_RUN_DRYRUN_IMPORT_EXPORT_CODE.txt
- WAVE_6_DROPDOWN_APP_INTEGRATION_CODE.txt
- WAVE_7_CERTIFICATION_CODE.txt
- AGENT_PROMPTS_ALL_WAVES.txt
- FINAL_ACCEPTANCE_MATRIX.txt
- MANIFEST.json

Wave order:
0. Baseline + contract freeze
1. Macro engine safety foundation
2. Security + validation hardening
3. Builder contract + recipe catalog
4. Custom recipe builder UI
5. Run / dry-run / import-export integration
6. Macro dropdown / app integration
7. Macro certification suite

Hard rules:
- Do not activate recipe execution UI until Wave 1 and Wave 2 pass.
- Do not add recipes using unsupported/unregistered operations.
- Do not let dry-run mutate PDF bytes or create output files.
- Do not allow partial PDF mutation after aborting macro errors.
- Do not allow raw HTML/table text/image sources into the rendering path.

Validation after every wave:
  cd frontend
  npm run typecheck
  npm run test
  npm run build

Final validation after Wave 7:
  cd frontend
  npm run certify:macro
