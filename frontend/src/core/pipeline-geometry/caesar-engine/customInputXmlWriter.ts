/**
 * CAESAR II / XML CII 2019/2024 XML Serializer.
 *
 * Converts a structured CustomInputModel into valid CAESAR II XML format matching
 * the contract of XML_Compare_Utilities/converters/xml-cii2019-core/custom-input-xml-builder.js.
 *
 * Invariant INV-4: Pure TypeScript domain types without library dependencies.
 */

import type { FullXmlBuilderModel } from '../types';
import {
  buildCustomInputModel,
  type CustomInputModel,
  type ModelBranch,
  type ModelNode,
} from './customInputModel';
import {
  applyCustomInputBends,
  applyCustomInputTees,
} from './autoTopology';

function trim(v: unknown): string {
  return String(v ?? '').trim();
}

function escapeXml(v: unknown): string {
  return trim(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name: string, value: unknown): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function val(node: ModelNode, branch: ModelBranch, key: keyof ModelNode | keyof ModelBranch, fallback: string = ''): string {
  const nodeVal = node[key as keyof ModelNode];
  if (nodeVal !== undefined && nodeVal !== null && trim(nodeVal) !== '') {
    return trim(nodeVal);
  }
  const branchVal = branch[key as keyof ModelBranch];
  if (branchVal !== undefined && branchVal !== null && trim(branchVal) !== '') {
    return trim(branchVal);
  }
  return fallback;
}

function renderNodeXml(branch: ModelBranch, node: ModelNode): string {
  const comp = val(node, branch, 'componentType', 'PIPE');
  const lines: string[] = [
    '  <Node>',
    `    ${tag('NodeNumber', node.nodeNumber)}`,
    `    ${tag('NodeName', node.nodeName || node.nodeNumber)}`,
    `    ${tag('Endpoint', node.endpoint || '1')}`,
    `    ${tag('Rigid', node.rigid || '0')}`,
    `    ${tag('ComponentType', comp)}`,
    `    ${tag('Weight', node.weight || '0')}`,
    `    ${tag('ComponentRefNo', node.componentRefNo || '')}`,
    `    ${tag('ConnectionType', '')}`,
    `    ${tag('OutsideDiameter', node.outsideDiameter || '')}`,
    `    ${tag('WallThickness', val(node, branch, 'wallThickness', '0'))}`,
    `    ${tag('CorrosionAllowance', val(node, branch, 'corrosionAllowance', '0'))}`,
    `    ${tag('InsulationThickness', val(node, branch, 'insulationThickness', '0'))}`,
    `    ${tag('Position', node.position || '0 0 0')}`,
    `    ${tag('BendRadius', node.bendRadius || '0')}`,
    `    ${tag('SIF', node.sif || '0')}`,
    `    ${tag('PipingClass', val(node, branch, 'pipingClass', 'CS150'))}`,
    `    ${tag('Rating', val(node, branch, 'rating', '150'))}`,
    `    ${tag('BoreMm', val(node, branch, 'boreMm', '100'))}`,
    `    ${tag('ElementLengthMm', node.elementLengthMm || '')}`,
    `    ${tag('MaterialName', val(node, branch, 'materialName', 'A106-B'))}`,
    `    ${tag('MaterialCode', val(node, branch, 'materialCode', '1'))}`,
  ];

  if (node.dtxr) {
    lines.push(`    ${tag('DTXR_POS', node.dtxr)}`);
  }

  for (const r of node.restraints || []) {
    lines.push(
      `    <CustomRestraint>${tag('Type', r.type)}${tag('Direction', r.direction || '')}${tag('Gap', r.gap || '')}${tag('Stiffness', r.stiffness || '')}${tag('Friction', r.friction || '')}</CustomRestraint>`,
    );
  }

  lines.push('  </Node>');
  return lines.join('\n');
}

export interface XmlGenerationOptions {
  autoBend?: boolean;
  autoTee?: boolean;
}

/**
 * Builds the complete CAESAR II XML text from a CustomInputModel.
 */
export function buildCustomInputXml(
  model: CustomInputModel,
  options: XmlGenerationOptions = { autoBend: true, autoTee: true },
): string {
  let workingModel = JSON.parse(JSON.stringify(model)) as CustomInputModel;

  if (options.autoBend !== false) {
    workingModel = applyCustomInputBends(workingModel);
  }
  if (options.autoTee !== false) {
    workingModel = applyCustomInputTees(workingModel);
  }

  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>', '<Root>'];

  for (const b of workingModel.branches || []) {
    out.push('<Branch>');
    out.push(`  ${tag('Branchname', b.branchName)}`);
    out.push(`  ${tag('LineNo', b.lineKey || '1')}`);
    out.push('  <Pressure>');
    out.push(`    ${tag('Pressure1', b.p1 || '')}`);
    out.push(`    ${tag('HydroPressure', b.hydroPressure || '')}`);
    out.push('  </Pressure>');
    out.push('  <Temperature>');
    out.push(`    ${tag('Temperature1', b.t1 || '')}`);
    out.push(`    ${tag('Temperature2', b.t2 || '')}`);
    out.push(`    ${tag('Temperature3', b.t3 || '')}`);
    out.push('  </Temperature>');
    out.push(`  ${tag('FluidDensity', b.fluidDensity || '')}`);

    for (const nd of b.nodes || []) {
      out.push(renderNodeXml(b, nd));
    }

    out.push('</Branch>');
  }

  out.push('</Root>');
  return out.join('\n');
}

/**
 * Convenience 1-click helper: compiles the 5 tables directly into CAESAR II XML.
 */
export function buildDirectCaesarXmlFromTables(
  tables: Partial<FullXmlBuilderModel>,
  options?: XmlGenerationOptions,
): string {
  const model = buildCustomInputModel(tables);
  return buildCustomInputXml(model, options);
}
