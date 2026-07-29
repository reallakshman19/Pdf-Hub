import { throwIfAborted, OperationCancelledError } from '@/core/cancellation/operationCancellation';
import type { WriterProjectMemberAdmissionOperation } from './writerProjectMemberAdmission';
import type { AdmittedWriterProjectJsonSourceSet } from './writerProjectJsonSourceSet';
import type { WriterProjectJsonSourcePath } from './writerProjectJsonSourcePolicy';

export const JSON_STRUCTURAL_ADMISSION_LIMITS = Object.freeze({
  maxDepth: 64,
  maxNodes: 200_000,
  maxObjectProperties: 10_000,
  maxArrayElements: 100_000,
  maxKeyCodeUnits: 256,
  maxStringCodeUnits: 1_000_000,
  maxAggregateStringCodeUnits: 50_000_000,
});

export type JsonStructuralAdmissionOutcome =
  | 'ADMITTED'
  | 'REJECTED_DEPTH'
  | 'REJECTED_NODE_COUNT'
  | 'REJECTED_OBJECT_PROPERTIES'
  | 'REJECTED_ARRAY_ELEMENTS'
  | 'REJECTED_KEY_LENGTH'
  | 'REJECTED_STRING_LENGTH'
  | 'REJECTED_AGGREGATE_STRING_LENGTH';

export interface JsonStructuralMeasurement {
  readonly metric: string;
  readonly actual: number;
  readonly limit: number;
}

export class JsonStructuralAdmissionError extends Error {
  readonly outcome: JsonStructuralAdmissionOutcome;
  readonly path: WriterProjectJsonSourcePath | undefined;
  readonly measured: JsonStructuralMeasurement;

  constructor(
    outcome: JsonStructuralAdmissionOutcome,
    measured: JsonStructuralMeasurement,
    path?: WriterProjectJsonSourcePath,
  ) {
    super(
      `JSON structural admission rejected (${outcome}) for ${path ?? 'document'}: ` +
      `${measured.metric} measured ${measured.actual}, limit is ${measured.limit}.`,
    );
    this.name = 'JsonStructuralAdmissionError';
    this.outcome = outcome;
    this.path = path;
    this.measured = Object.freeze({ ...measured });
  }
}

export const JSON_STRUCTURAL_ADMISSION_EVIDENCE_PROFILE_ID =
  'JSON_STRUCTURAL_ADMISSION_EVIDENCE_V1' as const;

export interface JsonStructuralSourceRecord {
  readonly path?: WriterProjectJsonSourcePath;
  readonly measuredDepth: number;
  readonly measuredNodes: number;
  readonly measuredMaxObjectProperties: number;
  readonly measuredMaxArrayElements: number;
  readonly measuredMaxKeyCodeUnits: number;
  readonly measuredMaxStringCodeUnits: number;
  readonly measuredAggregateStringCodeUnits: number;
}

export interface JsonStructuralAdmissionEvidence {
  readonly evidenceProfileId: typeof JSON_STRUCTURAL_ADMISSION_EVIDENCE_PROFILE_ID;
  readonly limits: typeof JSON_STRUCTURAL_ADMISSION_LIMITS;
  readonly sourceRecords: readonly JsonStructuralSourceRecord[];
  readonly aggregateNodes: number;
  readonly aggregateStringCodeUnits: number;
  readonly admissionOutcome: JsonStructuralAdmissionOutcome;
}

function freezeEvidence(
  evidence: JsonStructuralAdmissionEvidence,
): JsonStructuralAdmissionEvidence {
  return Object.freeze({
    ...evidence,
    sourceRecords: evidence.sourceRecords.map((record) => Object.freeze({ ...record })),
  });
}

interface StructuralFrame {
  readonly kind: 'object' | 'array';
  count: number;
  awaitingKey: boolean;
}

const WHITESPACE = new Set([' ', '\t', '\n', '\r']);

/**
 * Bounded, iterative (non-recursive, so it cannot itself stack-overflow on
 * pathological input) structural scan of a JSON document's raw text. Rejects
 * before any value is ever allocated -- this never calls JSON.parse and never
 * builds an object graph. Intended to run after byte/UTF-8 admission (3B.3B)
 * and before the real JSON.parse that performs semantic decoding.
 */
export function scanJsonStructure(
  text: string,
  path?: WriterProjectJsonSourcePath,
  operation?: WriterProjectMemberAdmissionOperation,
): JsonStructuralSourceRecord {
  const limits = JSON_STRUCTURAL_ADMISSION_LIMITS;
  const stack: StructuralFrame[] = [];
  let totalNodes = 0;
  let maxDepthSeen = 0;
  let maxObjectPropertiesSeen = 0;
  let maxArrayElementsSeen = 0;
  let maxKeyCodeUnitsSeen = 0;
  let maxStringCodeUnitsSeen = 0;
  let aggregateStringCodeUnits = 0;

  function checkCancellation(): void {
    throwIfAborted(operation?.signal, `scan JSON structure for ${path ?? 'document'}`);
    if (operation && !operation.isCurrent()) {
      throw new OperationCancelledError(`scan JSON structure for ${path ?? 'document'}`);
    }
  }

  function reject(outcome: JsonStructuralAdmissionOutcome, metric: string, actual: number, limit: number): never {
    throw new JsonStructuralAdmissionError(outcome, { metric, actual, limit }, path);
  }

  /** Called at the first character of every value (object/array/string/number/bool/null). */
  function enterValue(): boolean {
    totalNodes += 1;
    if (totalNodes > limits.maxNodes) {
      reject('REJECTED_NODE_COUNT', 'nodeCount', totalNodes, limits.maxNodes);
    }

    const parent = stack[stack.length - 1];
    if (!parent) return false;

    if (parent.kind === 'array') {
      parent.count += 1;
      maxArrayElementsSeen = Math.max(maxArrayElementsSeen, parent.count);
      if (parent.count > limits.maxArrayElements) {
        reject('REJECTED_ARRAY_ELEMENTS', 'arrayElements', parent.count, limits.maxArrayElements);
      }
      return false;
    }

    if (parent.awaitingKey) {
      return true;
    }

    parent.count += 1;
    maxObjectPropertiesSeen = Math.max(maxObjectPropertiesSeen, parent.count);
    if (parent.count > limits.maxObjectProperties) {
      reject('REJECTED_OBJECT_PROPERTIES', 'objectProperties', parent.count, limits.maxObjectProperties);
    }
    return false;
  }

  function consumeString(isKey: boolean, index: number): number {
    let cursor = index + 1;
    while (cursor < text.length) {
      const ch = text[cursor];
      if (ch === '\\') {
        cursor += 2;
        continue;
      }
      if (ch === '"') break;
      cursor += 1;
    }
    const contentLength = cursor - index - 1;

    aggregateStringCodeUnits += contentLength;
    if (aggregateStringCodeUnits > limits.maxAggregateStringCodeUnits) {
      reject(
        'REJECTED_AGGREGATE_STRING_LENGTH',
        'aggregateStringCodeUnits',
        aggregateStringCodeUnits,
        limits.maxAggregateStringCodeUnits,
      );
    }

    if (isKey) {
      maxKeyCodeUnitsSeen = Math.max(maxKeyCodeUnitsSeen, contentLength);
      if (contentLength > limits.maxKeyCodeUnits) {
        reject('REJECTED_KEY_LENGTH', 'keyCodeUnits', contentLength, limits.maxKeyCodeUnits);
      }
    } else {
      maxStringCodeUnitsSeen = Math.max(maxStringCodeUnitsSeen, contentLength);
      if (contentLength > limits.maxStringCodeUnits) {
        reject('REJECTED_STRING_LENGTH', 'stringCodeUnits', contentLength, limits.maxStringCodeUnits);
      }
    }

    return cursor + 1;
  }

  let index = 0;
  const length = text.length;

  while (index < length) {
    const ch = text[index];

    if (WHITESPACE.has(ch)) {
      index += 1;
      continue;
    }

    if (ch === ':') {
      index += 1;
      continue;
    }

    if (ch === ',') {
      const top = stack[stack.length - 1];
      if (top?.kind === 'object') top.awaitingKey = true;
      index += 1;
      continue;
    }

    if (ch === '{' || ch === '[') {
      checkCancellation();
      enterValue();
      stack.push({ kind: ch === '{' ? 'object' : 'array', count: 0, awaitingKey: ch === '{' });
      if (stack.length > limits.maxDepth) {
        reject('REJECTED_DEPTH', 'depth', stack.length, limits.maxDepth);
      }
      maxDepthSeen = Math.max(maxDepthSeen, stack.length);
      index += 1;
      continue;
    }

    if (ch === '}' || ch === ']') {
      stack.pop();
      index += 1;
      continue;
    }

    if (ch === '"') {
      const parent = stack[stack.length - 1];
      const isKey = parent?.kind === 'object' && parent.awaitingKey;
      enterValue();
      index = consumeString(isKey, index);
      if (isKey && parent) parent.awaitingKey = false;
      continue;
    }

    // Numbers, true/false/null: skip to the next structural delimiter.
    enterValue();
    index += 1;
    while (index < length && !'{}[],:'.includes(text[index]) && !WHITESPACE.has(text[index])) {
      index += 1;
    }
  }

  return {
    path,
    measuredDepth: maxDepthSeen,
    measuredNodes: totalNodes,
    measuredMaxObjectProperties: maxObjectPropertiesSeen,
    measuredMaxArrayElements: maxArrayElementsSeen,
    measuredMaxKeyCodeUnits: maxKeyCodeUnitsSeen,
    measuredMaxStringCodeUnits: maxStringCodeUnitsSeen,
    measuredAggregateStringCodeUnits: aggregateStringCodeUnits,
  };
}

/**
 * Scans every admitted JSON project member's decoded text structurally,
 * before any of them are handed to the real JSON.parse-based Writer/OCR
 * semantic decoders. Throws JsonStructuralAdmissionError on the first
 * source that violates a bound.
 */
export async function admitJsonStructuralBounds(
  jsonSources: AdmittedWriterProjectJsonSourceSet,
  operation?: WriterProjectMemberAdmissionOperation,
): Promise<JsonStructuralAdmissionEvidence> {
  const sourceRecords: JsonStructuralSourceRecord[] = [];
  let aggregateNodes = 0;
  let aggregateStringCodeUnits = 0;

  for (const source of jsonSources.sources) {
    throwIfAborted(operation?.signal, `read JSON source ${source.path} for structural scan`);
    if (operation && !operation.isCurrent()) {
      throw new OperationCancelledError(`read JSON source ${source.path} for structural scan`);
    }

    const text = await jsonSources.reader.readText(source.path);
    const record = scanJsonStructure(text, source.path, operation);
    sourceRecords.push(record);
    aggregateNodes += record.measuredNodes;
    aggregateStringCodeUnits += record.measuredAggregateStringCodeUnits;
  }

  return freezeEvidence({
    evidenceProfileId: JSON_STRUCTURAL_ADMISSION_EVIDENCE_PROFILE_ID,
    limits: JSON_STRUCTURAL_ADMISSION_LIMITS,
    sourceRecords,
    aggregateNodes,
    aggregateStringCodeUnits,
    admissionOutcome: 'ADMITTED',
  });
}
