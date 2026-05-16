import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

const disabledToolsPath = path.join(root, 'src/core/tool-policy/disabledTools.ts');
const toolbarPath = path.join(root, 'src/components/toolbar/ToolbarComment.tsx');

const disabledToolsText = fs.readFileSync(disabledToolsPath, 'utf8');
const toolbarText = fs.readFileSync(toolbarPath, 'utf8');

const unsafeTools = [
  'textbox',
  'ink',
  'comment',
  'sticky-note',
  'callout',
  'shape-rect',
  'shape-ellipse',
  'shape-cloud',
  'shape-polygon',
  'stamp',
  'line',
  'arrow',
  'redaction',
  'squiggly',
];

const findings = [];

for (const tool of unsafeTools) {
  if (!disabledToolsText.includes(`${tool}:`) && !disabledToolsText.includes(`'${tool}':`)) {
    findings.push({
      tool,
      issue: 'missing from DISABLED_TOOLS',
    });
  }

  if (!toolbarText.includes(`isToolDisabled('${tool}')`)) {
    findings.push({
      tool,
      issue: 'toolbar does not check isToolDisabled',
    });
  }

  if (!toolbarText.includes(`handleToolClick('${tool}')`)) {
    findings.push({
      tool,
      issue: 'toolbar does not route through guarded handleToolClick',
    });
  }
}

if (!toolbarText.includes('<WriterV2ToolbarControls />')) {
  findings.push({
    issue: 'WriterV2ToolbarControls is not mounted in ToolbarComment',
  });
}

if (toolbarText.includes("setWriterActiveTool('place-text')")) {
  findings.push({
    issue: 'legacy Writer Element place-text entry point still appears in ToolbarComment',
  });
}

if (findings.length > 0) {
  console.error('Writer V2 disabled-tools audit failed.');
  console.error(JSON.stringify(findings, null, 2));
  process.exit(1);
}

console.log('Writer V2 disabled-tools audit passed.');