import React from 'react';
import type { MacroStep } from '../../../core/macro/types';
import type {
  MacroOpCategory,
  MacroOpSchema,
} from '../../../core/macro/schema/opSchema';

export interface MacroStepPaletteProps {
  groupedSchemas: Record<MacroOpCategory, MacroOpSchema[]>;
  onAddStep: (op: MacroStep['op']) => void;
}

const CATEGORY_LABELS: Record<MacroOpCategory, string> = {
  page: 'Page Operations',
  document: 'Document Operations',
  content: 'Content Operations',
  logic: 'Logic',
};

export function MacroStepPalette({
  groupedSchemas,
  onAddStep,
}: MacroStepPaletteProps): React.ReactElement {
  return (
    <div>
      {Object.entries(groupedSchemas).map(([category, schemas]) => (
        <section key={category} style={{ marginBottom: 12 }}>
          <h3 style={{ margin: '8px 0', fontSize: 13 }}>
            {CATEGORY_LABELS[category as MacroOpCategory]}
          </h3>

          <div style={{ display: 'grid', gap: 6 }}>
            {schemas.map((schema) => (
              <button
                key={schema.op}
                type="button"
                aria-label={`Add ${schema.label}`}
                onClick={() => onAddStep(schema.op)}
                title={schema.description}
                style={{
                  textAlign: 'left',
                  border: '1px solid #d1d5db',
                  borderRadius: 6,
                  padding: '6px 8px',
                  background: '#f9fafb',
                  cursor: 'pointer',
                }}
              >
                {schema.label}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}