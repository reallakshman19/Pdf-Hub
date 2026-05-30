import { describe, expect, it } from 'vitest';
import { MacroStepRegistry, type StepResult } from './registry';
import type { MacroStep } from './types';

const success = (): StepResult => ({ status: 'success', sideEffects: [] });

describe('MacroStepRegistry', () => {
  it('throws on duplicate registration unless override is explicit', () => {
    const registry = new MacroStepRegistry();
    registry.register<Extract<MacroStep, { op: 'select_pages' }>>('select_pages', success);

    expect(() => {
      registry.register<Extract<MacroStep, { op: 'select_pages' }>>('select_pages', success);
    }).toThrow(/Duplicate registration for op "select_pages"/);
  });

  it('allows explicit duplicate overrides', () => {
    const registry = new MacroStepRegistry();
    registry.register<Extract<MacroStep, { op: 'select_pages' }>>('select_pages', success);
    registry.register<Extract<MacroStep, { op: 'select_pages' }>>('select_pages', success, { override: true });

    expect(registry.getRegisteredOps()).toEqual(['select_pages']);
  });
});
