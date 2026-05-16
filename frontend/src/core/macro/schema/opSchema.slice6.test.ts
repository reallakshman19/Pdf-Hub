import { describe, expect, it } from 'vitest';
import {
  buildDefaultStep,
  getAllMacroOpSchemas,
  getMacroOpSchema,
} from './opSchema';
import {
  SUPPORTED_MACRO_OPS,
  validateMacroSchemaCoverage,
} from './schemaCoverage';
import { macroValidator } from '../validator';

describe('macro op schema slice 6', () => {
  it('covers every supported op exactly once', () => {
    const result = validateMacroSchemaCoverage();

    expect(result.ok).toBe(true);
    expect(result.missingSchemas).toEqual([]);
    expect(result.extraSchemas).toEqual([]);
    expect(result.duplicateSchemas).toEqual([]);

    expect(getAllMacroOpSchemas().length).toBe(SUPPORTED_MACRO_OPS.length);
  });

  it('has accessible schemas for every supported op', () => {
    for (const op of SUPPORTED_MACRO_OPS) {
      const schema = getMacroOpSchema(op);

      expect(schema.op).toBe(op);
      expect(schema.label.length).toBeGreaterThan(0);
      expect(schema.description.length).toBeGreaterThan(0);
      expect(schema.fields).toBeInstanceOf(Array);
    }
  });

  it('can build a validator-accepted default step for every op', () => {
    for (const op of SUPPORTED_MACRO_OPS) {
      const step = buildDefaultStep(op);
      const result = macroValidator.validate({
        id: `default-${op}`,
        name: `Default ${op}`,
        steps: [step],
      });

      expect(result.valid, `${op}: ${JSON.stringify(result.errors)}`).toBe(true);
    }
  });
});