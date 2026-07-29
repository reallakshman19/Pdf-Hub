import { describe, expect, it } from 'vitest';
import {
  JSON_STRUCTURAL_ADMISSION_LIMITS,
  JsonStructuralAdmissionError,
  scanJsonStructure,
} from './jsonStructuralAdmission';

describe('scanJsonStructure', () => {
  it('measures depth, nodes, properties, elements, and string lengths correctly', () => {
    const record = scanJsonStructure(JSON.stringify({
      a: 1,
      b: [1, 2, 3],
      c: { nested: 'hello' },
    }));

    expect(record.measuredDepth).toBe(2); // root object is depth 1; b's array and c's object are depth 2
    expect(record.measuredMaxArrayElements).toBe(3);
    expect(record.measuredMaxObjectProperties).toBe(3); // root object has 3 properties (a, b, c) -- the max across every object in the document
    expect(record.measuredMaxKeyCodeUnits).toBeGreaterThanOrEqual('nested'.length);
    expect(record.measuredMaxStringCodeUnits).toBeGreaterThanOrEqual('hello'.length);
  });

  it('parses successfully and matches JSON.parse-observable structure for ordinary documents', () => {
    const doc = { rows: [{ id: 1, name: 'a' }, { id: 2, name: 'b' }] };
    const text = JSON.stringify(doc);
    expect(() => scanJsonStructure(text)).not.toThrow();
    // Sanity: the text really is valid JSON (scanner doesn't reject real documents)
    expect(JSON.parse(text)).toEqual(doc);
  });

  it('rejects a deeply-nested document before any semantic decoding would happen', () => {
    const depth = JSON_STRUCTURAL_ADMISSION_LIMITS.maxDepth + 10;
    const text = '['.repeat(depth) + ']'.repeat(depth);

    // Prove it's otherwise valid JSON that JSON.parse *would* accept.
    expect(() => JSON.parse(text)).not.toThrow();

    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
    expect(() => scanJsonStructure(text)).toThrow(/REJECTED_DEPTH|depth/i);
  });

  it('rejects a document with more object properties than the limit', () => {
    const entries = Array.from(
      { length: JSON_STRUCTURAL_ADMISSION_LIMITS.maxObjectProperties + 1 },
      (_, i) => [`k${i}`, i] as const,
    );
    const text = JSON.stringify(Object.fromEntries(entries));
    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
  });

  it('rejects a document with more array elements than the limit', () => {
    const text = JSON.stringify(
      Array.from({ length: JSON_STRUCTURAL_ADMISSION_LIMITS.maxArrayElements + 1 }, () => 1),
    );
    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
  });

  it('rejects an oversized key', () => {
    const key = 'k'.repeat(JSON_STRUCTURAL_ADMISSION_LIMITS.maxKeyCodeUnits + 1);
    const text = JSON.stringify({ [key]: 1 });
    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
  });

  it('rejects an oversized string value', () => {
    const value = 'v'.repeat(JSON_STRUCTURAL_ADMISSION_LIMITS.maxStringCodeUnits + 1);
    const text = JSON.stringify({ a: value });
    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
  });

  it('rejects when aggregate string length across the whole document exceeds the limit', () => {
    // Individually-small strings whose sum exceeds the aggregate limit.
    const chunk = 'x'.repeat(1000);
    const count = Math.ceil(JSON_STRUCTURAL_ADMISSION_LIMITS.maxAggregateStringCodeUnits / 1000) + 1;
    const text = JSON.stringify(Array.from({ length: count }, () => chunk));
    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
  });

  it('rejects a total node count above the limit even with shallow, small values', () => {
    const text = JSON.stringify(
      Array.from({ length: JSON_STRUCTURAL_ADMISSION_LIMITS.maxNodes + 10 }, (_, i) => i),
    );
    expect(() => scanJsonStructure(text)).toThrow(JsonStructuralAdmissionError);
  });

  it('honors an already-aborted operation signal', () => {
    const controller = new AbortController();
    controller.abort();
    const operation = {
      operationId: 'test',
      generation: 1,
      signal: controller.signal,
      isCurrent: () => true,
      isMounted: () => true,
    };
    expect(() => scanJsonStructure('{"a":1}', undefined, operation)).toThrow(/cancelled/i);
  });
});
