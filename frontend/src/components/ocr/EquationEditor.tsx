/*
 * EquationEditor component.
 *
 * This stub editor allows users to manually edit or correct LaTeX
 * expressions extracted by OCR.  In preview mode we do not provide
 * real editing or validation; instead this component displays the
 * current LaTeX source and calls an optional callback when
 * changed.  A more sophisticated editor could integrate a
 * formula bar or WYSIWYG interface.
 */

import { useState, type ChangeEvent } from 'react';
import type { JSX } from 'react';

export interface EquationEditorProps {
  initialValue: string;
  onChange?: (latex: string) => void;
}

export default function EquationEditor({
  initialValue,
  onChange,
}: EquationEditorProps): JSX.Element {
  const [value, setValue] = useState(initialValue);
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setValue(newValue);
    if (onChange) onChange(newValue);
  };
  return (
    <div className="doccraft-equation-editor">
      <textarea
        value={value}
        onChange={handleChange}
        rows={4}
        cols={40}
        style={{ width: '100%' }}
      />
    </div>
  );
}