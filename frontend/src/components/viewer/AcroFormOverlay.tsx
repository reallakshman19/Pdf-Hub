import React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAcroFormStore } from '@/core/pdf-forms/store';
import type { AcroFormFieldDescriptor, AcroFormWidgetDescriptor } from '@/core/pdf-forms/types';

export interface AcroFormOverlayProps {
  pageNumber: number;
  scale: number;
}

export const AcroFormOverlay: React.FC<AcroFormOverlayProps> = ({ pageNumber, scale }) => {
  const { fields, values, highlightFields, setFieldValue } = useAcroFormStore(
    useShallow((state) => ({
      fields: state.fields,
      values: state.values,
      highlightFields: state.highlightFields,
      setFieldValue: state.setFieldValue,
    })),
  );

  const pageWidgets = React.useMemo(() => {
    const items: Array<{ field: AcroFormFieldDescriptor; widget: AcroFormWidgetDescriptor }> = [];
    for (const field of fields) {
      for (const widget of field.widgets) {
        if (widget.pageNumber === pageNumber) {
          items.push({ field, widget });
        }
      }
    }
    return items;
  }, [fields, pageNumber]);

  if (pageWidgets.length === 0) {
    return null;
  }

  const stopBubble = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <div
      className="absolute inset-0 pointer-events-none z-25"
      data-testid={`acroform-overlay-page-${pageNumber}`}
    >
      {pageWidgets.map(({ field, widget }) => {
        const left = widget.rect.x * scale;
        const top = widget.rect.y * scale;
        const width = Math.max(12, widget.rect.width * scale);
        const height = Math.max(12, widget.rect.height * scale);
        const fontSize = Math.max(9, Math.min(14, Math.round(height * 0.58)));
        const currentValue = values[field.name];
        const surfaceClasses = highlightFields
          ? 'bg-blue-50/80 border border-blue-400/80 focus:bg-white focus:border-blue-600 focus:ring-2 focus:ring-blue-500/30'
          : 'bg-transparent border border-slate-300/60 focus:bg-white/95 focus:border-blue-600';

        return (
          <div
            key={widget.widgetId}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
            }}
            className="pointer-events-auto"
            onMouseDown={stopBubble}
            onClick={stopBubble}
            onDoubleClick={stopBubble}
          >
            {field.kind === 'text' && field.multiline ? (
              <textarea
                aria-label={field.name}
                data-testid={`acroform-field-${field.name}`}
                value={typeof currentValue === 'string' ? currentValue : ''}
                readOnly={field.readOnly}
                maxLength={field.maxLength}
                onChange={(e) => setFieldValue(field.name, e.target.value)}
                onKeyDown={stopBubble}
                style={{ fontSize: Math.max(9, Math.min(13, Math.round(11 * scale))) }}
                className={[
                  'w-full h-full px-1 py-0.5 rounded-[2px] text-slate-900 resize-none outline-none leading-tight transition-colors',
                  surfaceClasses,
                ].join(' ')}
              />
            ) : null}

            {field.kind === 'text' && !field.multiline ? (
              <input
                type="text"
                aria-label={field.name}
                data-testid={`acroform-field-${field.name}`}
                value={typeof currentValue === 'string' ? currentValue : ''}
                readOnly={field.readOnly}
                maxLength={field.maxLength}
                onChange={(e) => setFieldValue(field.name, e.target.value)}
                onKeyDown={stopBubble}
                style={{ fontSize }}
                className={[
                  'w-full h-full px-1 rounded-[2px] text-slate-900 outline-none transition-colors',
                  surfaceClasses,
                ].join(' ')}
              />
            ) : null}

            {field.kind === 'checkbox' ? (
              <label className="w-full h-full flex items-center justify-center cursor-pointer">
                <input
                  type="checkbox"
                  aria-label={field.name}
                  data-testid={`acroform-field-${field.name}`}
                  checked={Boolean(currentValue)}
                  disabled={field.readOnly}
                  onChange={(e) => setFieldValue(field.name, e.target.checked)}
                  className="w-full h-full max-w-[20px] max-h-[20px] accent-blue-600 cursor-pointer"
                />
              </label>
            ) : null}

            {field.kind === 'dropdown' ? (
              <select
                aria-label={field.name}
                data-testid={`acroform-field-${field.name}`}
                value={typeof currentValue === 'string' ? currentValue : ''}
                disabled={field.readOnly}
                onChange={(e) => setFieldValue(field.name, e.target.value)}
                onKeyDown={stopBubble}
                style={{ fontSize }}
                className={[
                  'w-full h-full px-1 rounded-[2px] text-slate-900 outline-none transition-colors',
                  surfaceClasses,
                ].join(' ')}
              >
                <option value="">-- Select --</option>
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : null}

            {field.kind === 'option-list' ? (
              <select
                aria-label={field.name}
                data-testid={`acroform-field-${field.name}`}
                multiple
                value={Array.isArray(currentValue) ? currentValue : []}
                disabled={field.readOnly}
                onChange={(e) =>
                  setFieldValue(
                    field.name,
                    Array.from(e.target.selectedOptions).map((opt) => opt.value),
                  )
                }
                onKeyDown={stopBubble}
                style={{ fontSize: Math.max(9, Math.min(12, Math.round(10 * scale))) }}
                className={[
                  'w-full h-full px-1 rounded-[2px] text-slate-900 outline-none transition-colors',
                  surfaceClasses,
                ].join(' ')}
              >
                {(field.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : null}

            {field.kind === 'radio' ? (
              <label className="w-full h-full flex items-center justify-center cursor-pointer">
                <input
                  type="radio"
                  name={`acro-radio-${field.name}`}
                  aria-label={`${field.name} (${widget.onValue ?? widget.widgetId})`}
                  data-testid={`acroform-field-${field.name}-${widget.onValue ?? widget.widgetId}`}
                  checked={
                    widget.onValue !== undefined && currentValue === widget.onValue
                  }
                  disabled={field.readOnly}
                  onChange={() => {
                    if (widget.onValue !== undefined) {
                      setFieldValue(field.name, widget.onValue);
                    }
                  }}
                  className="w-full h-full max-w-[18px] max-h-[18px] accent-blue-600 cursor-pointer"
                />
              </label>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
