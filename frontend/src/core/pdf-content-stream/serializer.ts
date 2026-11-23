/**
 * PDF Content Stream AST Serializer (ISO 32000-1 §7.2, §7.8).
 * Converts a content stream AST or operation list back into clean, spec-compliant PDF bytecode.
 */

import { bytesToLatin1 } from './lexer';
import type {
  PdfArrayOperand,
  PdfContentOperand,
  PdfContentOperation,
  PdfContentStreamAST,
  PdfDictOperand,
  PdfHexStringOperand,
  PdfLiteralStringOperand,
  PdfNameOperand,
  PdfNumberOperand,
} from './types';

export interface SerializeOptions {
  normalize?: boolean;
}

export function serializeContentStreamAST(
  ast: PdfContentStreamAST,
  options: SerializeOptions = {},
): Uint8Array {
  return serializeOperations(ast.operations, options);
}

export function serializeOperations(
  operations: readonly PdfContentOperation[],
  options: SerializeOptions = {},
): Uint8Array {
  const parts: string[] = [];
  let openQCount = 0;
  let inBT = false;

  for (const op of operations) {
    if (op.operator === 'q') {
      openQCount += 1;
    } else if (op.operator === 'Q') {
      if (openQCount > 0) {
        openQCount -= 1;
      }
    } else if (op.operator === 'BT') {
      inBT = true;
    } else if (op.operator === 'ET') {
      inBT = false;
    }

    parts.push(serializeOperation(op));
  }

  // Automatic normalization if requested
  if (options.normalize) {
    if (inBT) {
      parts.push('ET');
    }
    while (openQCount > 0) {
      parts.push('Q');
      openQCount -= 1;
    }
  }

  const outputString = parts.join('\n') + '\n';
  return latin1ToBytes(outputString);
}

export function serializeOperation(op: PdfContentOperation): string {
  const operandStrings = op.operands.map(serializeOperand);
  if (operandStrings.length === 0) {
    return op.operator;
  }
  return `${operandStrings.join(' ')} ${op.operator}`;
}

export function serializeOperand(operand: PdfContentOperand): string {
  switch (operand.kind) {
    case 'number':
      return serializeNumber(operand);

    case 'name':
      return serializeName(operand);

    case 'literal-string':
      return serializeLiteralString(operand);

    case 'hex-string':
      return serializeHexString(operand);

    case 'array':
      return serializeArray(operand);

    case 'dict':
      return serializeDict(operand);

    case 'boolean':
      return operand.value ? 'true' : 'false';

    case 'inline-image-data':
      return bytesToLatin1(operand.bytes);

    default:
      return '';
  }
}

function serializeNumber(operand: PdfNumberOperand): string {
  const value = operand.value;
  if (Number.isInteger(value)) {
    return value.toString();
  }
  // Remove unnecessary trailing zeroes e.g. 12.5000 -> 12.5
  return parseFloat(value.toFixed(6)).toString();
}

function serializeName(operand: PdfNameOperand): string {
  const raw = operand.name;
  // Encode any delimiter or special characters per PDF spec
  const encoded = raw.replace(/[ \t\r\n()<>[\]{}/%#]/g, (char) => {
    const hex = char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0');
    return `#${hex}`;
  });
  return `/${encoded}`;
}

function serializeLiteralString(operand: PdfLiteralStringOperand): string {
  const bytes = operand.bytes;
  let result = '(';

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    switch (byte) {
      case 0x0a: // \n
        result += '\\n';
        break;
      case 0x0d: // \r
        result += '\\r';
        break;
      case 0x09: // \t
        result += '\\t';
        break;
      case 0x08: // \b
        result += '\\b';
        break;
      case 0x0c: // \f
        result += '\\f';
        break;
      case 0x28: // (
        result += '\\(';
        break;
      case 0x29: // )
        result += '\\)';
        break;
      case 0x5c: // \
        result += '\\\\';
        break;
      default:
        if (byte >= 0x20 && byte <= 0x7e) {
          result += String.fromCharCode(byte);
        } else {
          // Octal escape for non-printable characters
          result += `\\${byte.toString(8).padStart(3, '0')}`;
        }
        break;
    }
  }

  result += ')';
  return result;
}

function serializeHexString(operand: PdfHexStringOperand): string {
  const hex = operand.hex.toUpperCase();
  return `<${hex}>`;
}

function serializeArray(operand: PdfArrayOperand): string {
  const items = operand.items.map(serializeOperand);
  return `[${items.join(' ')}]`;
}

function serializeDict(operand: PdfDictOperand): string {
  const entries: string[] = [];
  for (const [key, val] of Object.entries(operand.entries)) {
    entries.push(`/${key} ${serializeOperand(val)}`);
  }
  return `<< ${entries.join(' ')} >>`;
}

export function latin1ToBytes(str: string): Uint8Array {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    bytes[i] = str.charCodeAt(i) & 0xff;
  }
  return bytes;
}
