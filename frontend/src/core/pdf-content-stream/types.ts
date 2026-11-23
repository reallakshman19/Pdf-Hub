/**
 * PDF Content Stream Abstract Syntax Tree (AST) & Intermediate Representation (IR) Types.
 * Strictly adheres to ISO 32000-1 §7.2 (Lexical Conventions) and §7.8 (Content Streams).
 */

export type PdfOperandKind =
  | 'number'
  | 'name'
  | 'literal-string'
  | 'hex-string'
  | 'array'
  | 'dict'
  | 'boolean'
  | 'inline-image-data';

export interface PdfNumberOperand {
  kind: 'number';
  value: number;
  raw: string;
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfNameOperand {
  kind: 'name';
  name: string;
  raw: string;
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfLiteralStringOperand {
  kind: 'literal-string';
  bytes: Uint8Array;
  decodedText?: string;
  raw: string;
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfHexStringOperand {
  kind: 'hex-string';
  bytes: Uint8Array;
  hex: string;
  decodedText?: string;
  raw: string;
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfArrayOperand {
  kind: 'array';
  items: PdfContentOperand[];
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfDictOperand {
  kind: 'dict';
  entries: Record<string, PdfContentOperand>;
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfBooleanOperand {
  kind: 'boolean';
  value: boolean;
  raw: string;
  rawStart?: number;
  rawEnd?: number;
}

export interface PdfInlineImageDataOperand {
  kind: 'inline-image-data';
  bytes: Uint8Array;
  raw: string;
  rawStart?: number;
  rawEnd?: number;
}

export type PdfContentOperand =
  | PdfNumberOperand
  | PdfNameOperand
  | PdfLiteralStringOperand
  | PdfHexStringOperand
  | PdfArrayOperand
  | PdfDictOperand
  | PdfBooleanOperand
  | PdfInlineImageDataOperand;

export interface PdfContentOperation {
  type: 'operation';
  id: string;
  operator: string;
  operands: PdfContentOperand[];
  streamIndex: number;
  streamRef?: string | null;
  rawStart?: number;
  rawEnd?: number;
}

export type PdfContentTransform = [
  number,
  number,
  number,
  number,
  number,
  number,
];

export interface PdfTextObjectNode {
  type: 'text-object';
  id: string;
  streamIndex: number;
  streamRef?: string | null;
  fontResourceName: string | null;
  fontSizePt: number | null;
  fontResource?: string | null;
  fontSize?: number | null;
  textMatrix: PdfContentTransform;
  textLineMatrix: PdfContentTransform;
  operations: PdfContentOperation[];
}

export interface PdfGraphicsBlockNode {
  type: 'graphics-block';
  id: string;
  streamIndex: number;
  streamRef?: string | null;
  ctm: PdfContentTransform;
  children: PdfContentNode[];
}

export type PdfContentNode =
  | PdfContentOperation
  | PdfTextObjectNode
  | PdfGraphicsBlockNode;

export interface ContentStreamScanDiagnostic {
  code: string;
  message: string;
  streamIndex: number;
  streamRef?: string | null;
  byteOffset?: number;
}

export interface PdfContentStreamAST {
  complete: boolean;
  operations: PdfContentOperation[];
  structuredNodes: PdfContentNode[];
  textObjects: PdfTextObjectNode[];
  diagnostics: ContentStreamScanDiagnostic[];
  streamCount: number;
}

export interface DecodedPageContentStreamInput {
  streamIndex: number;
  streamRef?: string | null;
  decodedBytes: Uint8Array;
}
