/**
 * PDF Content Stream AST Transformer.
 * High-level mutation and query utilities operating on the Content Stream AST.
 */

import {
  serializeContentStreamAST,
  type SerializeOptions,
} from './serializer';
import type {
  PdfArrayOperand,
  PdfContentNode,
  PdfContentOperation,
  PdfContentStreamAST,
  PdfHexStringOperand,
  PdfLiteralStringOperand,
  PdfTextObjectNode,
} from './types';

export function findTextObjects(
  ast: PdfContentStreamAST,
): PdfTextObjectNode[] {
  const result: PdfTextObjectNode[] = [];
  for (const node of ast.structuredNodes) {
    if (node.type === 'text-object') {
      result.push(node);
    } else if (node.type === 'graphics-block') {
      collectTextObjectsFromBlock(node.children, result);
    }
  }
  return result;
}

function collectTextObjectsFromBlock(
  children: PdfContentNode[],
  acc: PdfTextObjectNode[],
): void {
  for (const child of children) {
    if (child.type === 'text-object') {
      acc.push(child);
    } else if (child.type === 'graphics-block') {
      collectTextObjectsFromBlock(child.children, acc);
    }
  }
}

export function findTextOperations(
  ast: PdfContentStreamAST,
  predicate?: (op: PdfContentOperation) => boolean,
): PdfContentOperation[] {
  return ast.operations.filter((op) => {
    if (op.operator !== 'Tj' && op.operator !== 'TJ') {
      return false;
    }
    return predicate ? predicate(op) : true;
  });
}

export interface ReplaceTextOptions {
  preferHex?: boolean;
}

export function replaceTextInOperation(
  op: PdfContentOperation,
  newText: string,
  options: ReplaceTextOptions = {},
): boolean {
  if (op.operator === 'Tj') {
    if (op.operands.length === 0) {
      return false;
    }
    const current = op.operands[0];
    const bytes = textToAsciiBytes(newText);

    if (current.kind === 'hex-string' || options.preferHex) {
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      const updated: PdfHexStringOperand = {
        kind: 'hex-string',
        bytes,
        hex,
        decodedText: newText,
        raw: `<${hex}>`,
      };
      op.operands[0] = updated;
    } else {
      const updated: PdfLiteralStringOperand = {
        kind: 'literal-string',
        bytes,
        decodedText: newText,
        raw: `(${newText})`,
      };
      op.operands[0] = updated;
    }
    return true;
  }

  if (op.operator === 'TJ') {
    if (op.operands.length === 0 || op.operands[0].kind !== 'array') {
      return false;
    }
    const arrayOp = op.operands[0] as PdfArrayOperand;
    // Find the primary string operand in the TJ array
    const stringItemIdx = arrayOp.items.findIndex(
      (item) => item.kind === 'literal-string' || item.kind === 'hex-string',
    );
    if (stringItemIdx === -1) {
      return false;
    }

    const currentItem = arrayOp.items[stringItemIdx];
    const bytes = textToAsciiBytes(newText);

    if (currentItem.kind === 'hex-string' || options.preferHex) {
      const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase();
      arrayOp.items[stringItemIdx] = {
        kind: 'hex-string',
        bytes,
        hex,
        decodedText: newText,
        raw: `<${hex}>`,
      };
    } else {
      arrayOp.items[stringItemIdx] = {
        kind: 'literal-string',
        bytes,
        decodedText: newText,
        raw: `(${newText})`,
      };
    }
    return true;
  }

  return false;
}

export function replaceTextById(
  ast: PdfContentStreamAST,
  operationId: string,
  newText: string,
  options: ReplaceTextOptions = {},
): boolean {
  const op = ast.operations.find((candidate) => candidate.id === operationId);
  if (!op) {
    return false;
  }
  return replaceTextInOperation(op, newText, options);
}

export function extractAllText(ast: PdfContentStreamAST): string[] {
  const result: string[] = [];
  for (const op of ast.operations) {
    if (op.operator === 'Tj' && op.operands.length > 0) {
      const operand = op.operands[0];
      if ('decodedText' in operand && operand.decodedText !== undefined) {
        result.push(operand.decodedText);
      }
    } else if (op.operator === 'TJ' && op.operands.length > 0 && op.operands[0].kind === 'array') {
      const arrayOp = op.operands[0] as PdfArrayOperand;
      let combined = '';
      for (const item of arrayOp.items) {
        if ('decodedText' in item && item.decodedText !== undefined) {
          combined += item.decodedText;
        }
      }
      if (combined.length > 0) {
        result.push(combined);
      }
    }
  }
  return result;
}

export function consolidatePageStreams(
  ast: PdfContentStreamAST,
  options: SerializeOptions = { normalize: true },
): Uint8Array {
  return serializeContentStreamAST(ast, options);
}

function textToAsciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) {
      throw new Error(
        `Character at index ${i} ('${text[i]}', U+${code.toString(16).padStart(4, '0').toUpperCase()}) is outside the printable ASCII range (U+0020..U+007E). Non-ASCII text replacement requires font CMap encoding in Phase B.`,
      );
    }
    bytes[i] = code & 0xff;
  }
  return bytes;
}
