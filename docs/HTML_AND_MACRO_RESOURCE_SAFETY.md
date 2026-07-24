# HTML and Macro Resource Safety

## Rich-text HTML

PDF Hub treats pasted and stored rich-text HTML as untrusted input.

`sanitizeHtml()` reconstructs a new DOM tree instead of mutating the parsed source tree. This prevents descendants moved out of unknown wrappers from bypassing sanitization.

The sanitizer:

- copies only allowlisted rich-text and table elements;
- drops active or inert unsafe subtrees such as scripts, styles, frames, objects, forms, SVG, MathML, and templates;
- recursively sanitizes descendants of unknown wrappers before unwrapping them;
- removes event handlers and unapproved attributes;
- normalizes leading ASCII controls and whitespace before URL-scheme checks, preventing encoded or split `javascript:` and `vbscript:` prefixes;
- restricts links to HTTP, HTTPS, mail, telephone, fragment, and relative destinations;
- restricts images to bounded raster data URLs and same-session blob URLs, preventing remote tracking loads and SVG script content;
- preserves only allowlisted inline style properties and rejects CSS URLs, expressions, imports, behaviors, and structural tokens;
- caps input bytes, visited nodes, nesting depth, and decoded embedded-image bytes;
- fails closed to escaped text when the input-byte limit is exceeded.

The rich-text editor sanitizes content when it is loaded, when HTML is inserted at the caret, and before content is saved. Display rendering sanitizes again as a final boundary.

## Macro recipes

Macro recipe JSON and programmatic recipes are subject to the same central resource policy.

Default limits cover:

- raw single-recipe and stored-collection JSON bytes;
- total JSON values and object nesting depth;
- flattened recipe steps and conditional nesting depth;
- ordinary string bytes and aggregate embedded data bytes;
- input PDF size, donor-file count, and aggregate donor bytes;
- elapsed execution time and actually executed steps, including nested conditional branches;
- working PDF size, output-file count, and aggregate output bytes.

The bounded parser is used by headless execution, expert JSON editing and preview, recipe import, and local-storage loading. Programmatic recipes are inspected again by the executor before validation or execution.

## Execution behavior

A macro resource-limit violation fails closed. If execution has begun, the transaction is rolled back to the pre-run document state unless rollback was explicitly disabled for ordinary step errors. Resource-limit diagnostics include a stable code and the measured limit where applicable.

Execution deadlines are enforced around each asynchronous macro step. Nested conditional steps share the same deadline and executed-step counter as the top-level recipe.

## Maintenance rules

- New macro import surfaces must use `parseMacroRecipeJson()` or `parseBoundedJson()` before `JSON.parse`-equivalent processing.
- New macro executors must run through `executeMacroRecipe()` so runtime budgets and rollback apply.
- Conditional or composite steps must use the shared `MacroExecutionBudget` for every nested operation.
- New rich-text rendering or paste surfaces must call `sanitizeHtml()` at the trust boundary.
- Resource defaults may be adjusted centrally in `DEFAULT_MACRO_RESOURCE_LIMITS` and `DEFAULT_HTML_SANITIZER_LIMITS`; individual callers should override limits only for tested, explicit use cases.
