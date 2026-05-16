import React, { useMemo, useState } from 'react';
import type {
  InsertPosition,
  MacroCondition,
  PageSelector,
} from '../../../core/macro/types';
import type { MacroFieldSchema } from '../../../core/macro/schema/opSchema';

export interface MacroFieldEditorProps {
  field: MacroFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}

export function MacroFieldEditor({
  field,
  value,
  onChange,
}: MacroFieldEditorProps): React.ReactElement {
  const id = `macro-field-${field.name}`;

  return (
    <label
      htmlFor={id}
      style={{
        display: 'block',
        marginBottom: 10,
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: 12,
          color: '#4b5563',
          marginBottom: 4,
        }}
      >
        {field.label}
        {field.required ? ' *' : ''}
      </span>

      {renderFieldControl({
        id,
        field,
        value,
        onChange,
      })}

      {field.help ? (
        <span
          style={{
            display: 'block',
            fontSize: 11,
            color: '#6b7280',
            marginTop: 4,
          }}
        >
          {field.help}
        </span>
      ) : null}
    </label>
  );
}

function renderFieldControl(args: {
  id: string;
  field: MacroFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}): React.ReactElement {
  const { id, field, value, onChange } = args;

  if (field.kind === 'string') {
    return (
      <textarea
        id={id}
        aria-label={field.label}
        rows={field.name === 'content' || field.name === 'bodyMarkdown' ? 4 : 2}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.currentTarget.value)}
        style={textareaStyle}
      />
    );
  }

  if (field.kind === 'number') {
    return (
      <input
        id={id}
        aria-label={field.label}
        type="number"
        value={typeof value === 'number' && Number.isFinite(value) ? String(value) : ''}
        min={field.min}
        max={field.max}
        onChange={(event) => {
          const text = event.currentTarget.value;
          onChange(text === '' ? undefined : Number(text));
        }}
        style={inputStyle}
      />
    );
  }

  if (field.kind === 'boolean') {
    return (
      <input
        id={id}
        aria-label={field.label}
        type="checkbox"
        checked={Boolean(value)}
        onChange={(event) => onChange(event.currentTarget.checked)}
      />
    );
  }

  if (field.kind === 'select') {
    return (
      <select
        id={id}
        aria-label={field.label}
        value={typeof value === 'string' || typeof value === 'number' ? String(value) : ''}
        onChange={(event) => {
          const selected = event.currentTarget.value;
          onChange(numericSelectValue(field.name, selected));
        }}
        style={inputStyle}
      >
        <option value="">Select...</option>
        {(field.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  }

  if (field.kind === 'string-list') {
    return (
      <StringListEditor
        id={id}
        label={field.label}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'number-list') {
    return (
      <NumberListEditor
        id={id}
        label={field.label}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'json') {
    return (
      <JsonFieldEditor
        id={id}
        label={field.label}
        value={value}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'page-selector') {
    return (
      <PageSelectorEditor
        id={id}
        value={normalizePageSelector(value)}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'insert-position') {
    return (
      <InsertPositionEditor
        id={id}
        value={normalizeInsertPosition(value)}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'condition') {
    return (
      <ConditionEditor
        id={id}
        value={normalizeCondition(value)}
        onChange={onChange}
      />
    );
  }

  if (field.kind === 'macro-steps') {
    return (
      <div
        id={id}
        aria-label={field.label}
        style={{
          border: '1px solid #d1d5db',
          borderRadius: 6,
          padding: 8,
          background: '#f9fafb',
          color: '#374151',
          fontSize: 12,
        }}
      >
        Nested step editing is handled by the nested branch controls in the builder state slice.
        Current count: {Array.isArray(value) ? value.length : 0}
      </div>
    );
  }

  return (
    <input
      id={id}
      aria-label={field.label}
      value={String(value ?? '')}
      onChange={(event) => onChange(event.currentTarget.value)}
      style={inputStyle}
    />
  );
}

function JsonFieldEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}): React.ReactElement {
  const initialText = useMemo(() => {
    try {
      return JSON.stringify(value ?? {}, null, 2);
    } catch {
      return '{}';
    }
  }, [value]);

  const [text, setText] = useState(initialText);
  const [error, setError] = useState<string | null>(null);

  if (text !== initialText && document.activeElement?.id !== id && error === null) {
      setText(initialText);
  }

  function commit(nextText: string): void {
    setText(nextText);

    try {
      const parsed = JSON.parse(nextText);
      setError(null);
      onChange(parsed);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <textarea
        id={id}
        aria-label={label}
        rows={7}
        value={text}
        onChange={(event) => commit(event.currentTarget.value)}
        style={{
          ...textareaStyle,
          fontFamily: 'monospace',
          fontSize: 12,
        }}
      />
      {error ? (
        <div role="alert" style={{ color: '#b91c1c', fontSize: 12, marginTop: 4 }}>
          Invalid JSON: {error}
        </div>
      ) : null}
    </div>
  );
}

function PageSelectorEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: PageSelector;
  onChange: (value: PageSelector) => void;
}): React.ReactElement {
  function changeMode(mode: PageSelector['mode']): void {
    if (mode === 'range') {
      onChange({ mode: 'range', from: 1, to: 1 });
      return;
    }

    if (mode === 'list') {
      onChange({ mode: 'list', pages: [1] });
      return;
    }

    onChange({ mode });
  }

  return (
    <div id={id} style={boxStyle}>
      <select
        aria-label="Selector Mode"
        value={value.mode}
        onChange={(event) => changeMode(event.currentTarget.value as PageSelector['mode'])}
        style={inputStyle}
      >
        <option value="all">all</option>
        <option value="current">current</option>
        <option value="selected">selected</option>
        <option value="range">range</option>
        <option value="list">list</option>
        <option value="odd">odd</option>
        <option value="even">even</option>
      </select>

      {value.mode === 'range' ? (
        <div style={rowStyle}>
          <input
            aria-label="Range From"
            type="number"
            min={1}
            value={value.from}
            onChange={(event) => onChange({
              ...value,
              from: Number(event.currentTarget.value),
            })}
            style={inputStyle}
          />
          <input
            aria-label="Range To"
            type="number"
            min={1}
            value={value.to}
            onChange={(event) => onChange({
              ...value,
              to: Number(event.currentTarget.value),
            })}
            style={inputStyle}
          />
        </div>
      ) : null}

      {value.mode === 'list' ? (
        <textarea
          aria-label="Page List"
          rows={2}
          value={value.pages.join(', ')}
          onChange={(event) =>
            onChange({
              mode: 'list',
              pages: event.currentTarget.value
                .split(/,|\n/)
                .map((item) => Number(item.trim()))
                .filter((item) => Number.isFinite(item)),
            })
          }
          style={textareaStyle}
        />
      ) : null}
    </div>
  );
}

function InsertPositionEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: InsertPosition;
  onChange: (value: InsertPosition) => void;
}): React.ReactElement {
  function changeMode(mode: InsertPosition['mode']): void {
    if (mode === 'before' || mode === 'after') {
      onChange({ mode, page: 'page' in value ? value.page : 1 });
      return;
    }

    onChange({ mode });
  }

  return (
    <div id={id} style={boxStyle}>
      <select
        aria-label="Insert Position Mode"
        value={value.mode}
        onChange={(event) => changeMode(event.currentTarget.value as InsertPosition['mode'])}
        style={inputStyle}
      >
        <option value="start">start</option>
        <option value="end">end</option>
        <option value="before">before</option>
        <option value="after">after</option>
      </select>

      {(value.mode === 'before' || value.mode === 'after') ? (
        <input
          aria-label="Insert Position Page"
          type="number"
          min={1}
          value={value.page}
          onChange={(event) =>
            onChange({
              mode: value.mode,
              page: Number(event.currentTarget.value),
            })
          }
          style={inputStyle}
        />
      ) : null}
    </div>
  );
}

function ConditionEditor({
  id,
  value,
  onChange,
}: {
  id: string;
  value: MacroCondition;
  onChange: (value: MacroCondition) => void;
}): React.ReactElement {
  function changeType(type: MacroCondition['type']): void {
    if (type === 'custom_var_equals') {
      onChange({ type, key: 'status', value: 'REVIEWED' });
      return;
    }

    if (type === 'filename_contains') {
      onChange({ type, value: 'IFC' });
      return;
    }

    onChange({ type, value: 1 });
  }

  return (
    <div id={id} style={boxStyle}>
      <select
        aria-label="Condition Type"
        value={value.type}
        onChange={(event) => changeType(event.currentTarget.value as MacroCondition['type'])}
        style={inputStyle}
      >
        <option value="page_count_gt">page_count_gt</option>
        <option value="page_count_lt">page_count_lt</option>
        <option value="filename_contains">filename_contains</option>
        <option value="custom_var_equals">custom_var_equals</option>
      </select>

      {value.type === 'custom_var_equals' ? (
        <div style={rowStyle}>
          <input
            aria-label="Condition Key"
            value={value.key}
            onChange={(event) =>
              onChange({
                ...value,
                key: event.currentTarget.value,
              })
            }
            style={inputStyle}
          />
          <input
            aria-label="Condition Value"
            value={value.value}
            onChange={(event) =>
              onChange({
                ...value,
                value: event.currentTarget.value,
              })
            }
            style={inputStyle}
          />
        </div>
      ) : null}

      {value.type === 'filename_contains' ? (
        <input
          aria-label="Condition Value"
          value={value.value}
          onChange={(event) =>
            onChange({
              type: 'filename_contains',
              value: event.currentTarget.value,
            })
          }
          style={inputStyle}
        />
      ) : null}

      {(value.type === 'page_count_gt' || value.type === 'page_count_lt') ? (
        <input
          aria-label="Condition Value"
          type="number"
          value={value.value}
          onChange={(event) =>
            onChange({
              type: value.type,
              value: Number(event.currentTarget.value),
            })
          }
          style={inputStyle}
        />
      ) : null}
    </div>
  );
}

function normalizePageSelector(value: unknown): PageSelector {
  if (value && typeof value === 'object' && 'mode' in value) {
    return value as PageSelector;
  }

  return { mode: 'selected' };
}

function normalizeInsertPosition(value: unknown): InsertPosition {
  if (value && typeof value === 'object' && 'mode' in value) {
    return value as InsertPosition;
  }

  return { mode: 'end' };
}

function normalizeCondition(value: unknown): MacroCondition {
  if (value && typeof value === 'object' && 'type' in value) {
    return value as MacroCondition;
  }

  return { type: 'page_count_gt', value: 1 };
}

function numericSelectValue(fieldName: string, selected: string): string | number {
  if (fieldName === 'degrees') {
    return Number(selected);
  }

  return selected;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 8px',
};

const textareaStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  padding: '6px 8px',
};

const boxStyle: React.CSSProperties = {
  display: 'grid',
  gap: 6,
  border: '1px solid #e5e7eb',
  borderRadius: 6,
  padding: 8,
  background: '#f9fafb',
};

const rowStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 6,
};
function StringListEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}): React.ReactElement {
  const initialText = Array.isArray(value) ? value.join('\n') : '';
  const [text, setText] = useState(initialText);

  // Sync state manually if upstream resets entirely
  if (text !== initialText && document.activeElement?.id !== id) {
     setText(initialText);
  }

  function commit(nextText: string): void {
    setText(nextText);
    onChange(
      nextText
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean),
    );
  }

  return (
    <textarea
      id={id}
      aria-label={label}
      rows={4}
      value={text}
      onChange={(event) => commit(event.currentTarget.value)}
      style={textareaStyle}
    />
  );
}

function NumberListEditor({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: unknown;
  onChange: (value: unknown) => void;
}): React.ReactElement {
  const initialText = Array.isArray(value) ? value.join(', ') : '';
  const [text, setText] = useState(initialText);

  if (text !== initialText && document.activeElement?.id !== id) {
     setText(initialText);
  }

  function commit(nextText: string): void {
    setText(nextText);
    onChange(
      nextText
        .split(/,|\n/)
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item)),
    );
  }

  return (
    <textarea
      id={id}
      aria-label={label}
      rows={3}
      value={text}
      onChange={(event) => commit(event.currentTarget.value)}
      style={textareaStyle}
    />
  );
}
