import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const checks = [
  {
    id: 'WRITER_TYPES_CONTENT_MODEL',
    file: 'src/core/writer/types.ts',
    required: [
      /contentModel\?/,
      /sourceMeta\?/,
      /hidden\?/,
      /WriterRichTextModel/,
      /WriterTableModel/,
      /WriterImageModel/,
    ],
    forbidden: [],
    message: 'PlacedElement must support contentModel/sourceMeta/hidden and typed writer models.',
  },
  {
    id: 'WRITER_CONTENT_MODEL_REQUIRED',
    file: 'src/core/writer/content-model.ts',
    required: [
      /createEmptyRichTextModel/,
      /createTableModelFromMatrix/,
      /createImageModel/,
      /normalizeWriterElement/,
    ],
    forbidden: [],
    message: 'Writer content model helpers are required.',
  },
  {
    id: 'WRITER_CLIPBOARD_SANITIZER_REQUIRED',
    file: 'src/core/writer/clipboard/sanitizeClipboardHtml.ts',
    required: [
      /sanitizeClipboardHtml/,
      /escapeClipboardHtml/,
      /javascript:/,
      /data:text\/html/,
    ],
    forbidden: [],
    message: 'Clipboard HTML sanitizer must block scripts/events/javascript URLs.',
  },
  {
    id: 'WRITER_PASTE_MUST_IGNORE_EDITABLE_TARGETS',
    file: 'src/core/writer/clipboard/pasteController.ts',
    required: [
      /shouldIgnorePasteTarget/,
      /isContentEditable/,
      /data-macro-builder/,
      /data-writer-allow-native-paste/,
    ],
    forbidden: [],
    message: 'Writer paste controller must not hijack native paste in editors or macro builder.',
  },
  {
    id: 'WRITER_RICH_TEXT_SANITIZER_REQUIRED',
    file: 'src/core/writer/richTextHtml.ts',
    required: [
      /sanitizeWriterHtml/,
      /script/,
      /javascript:/,
      /richTextModelToHtml/,
    ],
    forbidden: [
      /dangerouslySetInnerHTML[\s\S]{0,80}html(?!: richTextModelToHtml)/,
    ],
    message: 'Rich text HTML paths must sanitize unsafe content.',
  },
  {
    id: 'WRITER_TABLE_COMMANDS_IMMUTABLE',
    file: 'src/core/writer/tableCommands.ts',
    required: [
      /updateTableCellText/,
      /insertTableRow/,
      /deleteTableRow/,
      /insertTableColumn/,
      /deleteTableColumn/,
      /pasteMatrixIntoTable/,
    ],
    forbidden: [],
    message: 'Table commands must exist.',
  },
  {
    id: 'WRITER_IMAGE_MIME_RESTRICTED',
    file: 'src/core/writer/imageImport.ts',
    required: [
      /isSupportedWriterImageMime/,
      /image\\?\/\(png\|jpeg\|jpg\|webp\)/,
    ],
    forbidden: [
      /svg\+xml/,
    ],
    message: 'Writer image import must not accept SVG/active content image formats.',
  },
  {
    id: 'WRITER_OBJECTS_HIDE_EXPORT',
    file: 'src/core/writer/writerObjects.ts',
    required: [
      /visibleWriterElementsForExport/,
      /!element\.hidden/,
    ],
    forbidden: [],
    message: 'Hidden writer objects must be excluded from export.',
  },
  {
    id: 'WRITER_EXPORTER_CONTENT_MODEL_FIRST',
    file: 'src/core/writer/exporter.ts',
    required: [
      /createWriterExportPlan/,
      /visibleWriterElementsForExport/,
      /contentModel/,
      /exportWriterDocument/,
      /exportWriterElementsToHtml/,
      /flattenWriterElementsToPdf/,
      /Unsafe image source blocked/,
    ],
    forbidden: [
      /elements\.map\(renderElementHtml\)(?![\s\S]{0,200}visibleWriterElementsForExport)/,
      /Buffer\.from/,
    ],
    message: 'Writer exporter must be contentModel-first, must filter hidden objects, and must not rely on Buffer in browser builds.',
  },
  {
    id: 'WRITER_CERT_DOC_REQUIRED',
    file: 'WRITER_CERTIFICATION.md',
    required: [
      /npm run certify:writer/,
      /TypeScript errors/,
      /Hidden object/,
      /Unsafe HTML/,
    ],
    forbidden: [],
    message: 'Writer certification document must exist.',
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

  let checkFailed = false;

  for (const pattern of check.required) {
    if (!pattern.test(content)) {
      fail(check, `Required pattern missing: ${pattern}`);
      checkFailed = true;
    }
  }

  for (const pattern of check.forbidden) {
    if (pattern.test(content)) {
      fail(check, `Forbidden pattern found: ${pattern}`);
      checkFailed = true;
    }
  }

  if (!checkFailed) {
    console.log(`[PASS] ${check.id}`);
  }
}

if (failures > 0) {
  console.error(`\nWriter static audit failed: ${failures} issue(s).`);
  process.exit(1);
}

console.log('\nWriter static audit passed.');

function fail(check, detail) {
  console.error(`[FAIL] ${check.id}`);
  console.error(`       ${detail}`);
  console.error(`       ${check.message}`);
  failures += 1;
}
