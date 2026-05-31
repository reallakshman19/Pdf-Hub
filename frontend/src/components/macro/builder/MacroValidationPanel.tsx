import React from 'react';
import type { ValidationResult } from '../../../core/macro/validator';

export interface MacroValidationPanelProps {
  validation: ValidationResult;
}

export function MacroValidationPanel({
  validation,
}: MacroValidationPanelProps): React.ReactElement {
  if (validation.valid) {
    return (
      <section aria-label="Validation status">
        <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Validation</h2>
        <p style={{ color: '#166534' }}>Recipe is valid.</p>
      </section>
    );
  }

  return (
    <section aria-label="Validation status">
      <h2 style={{ margin: '0 0 8px', fontSize: 16 }}>Validation</h2>
      <p style={{ color: '#b91c1c' }}>
        {validation.errors.length} issue(s) found.
      </p>

      <ul style={{ color: '#b91c1c', paddingLeft: 18 }}>
        {validation.errors.map((error) => (
          <li key={`${error.stepIndex}-${error.field}-${error.message}`}>
            {error.field}: {error.message}
          </li>
        ))}
      </ul>
    </section>
  );
}