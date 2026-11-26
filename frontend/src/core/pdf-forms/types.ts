import type { Rect } from '@/core/annotations/types';

export type AcroFormFieldKind =
  | 'text'
  | 'checkbox'
  | 'dropdown'
  | 'option-list'
  | 'radio';

export type AcroFormFieldValue = string | boolean | string[];

export interface AcroFormWidgetDescriptor {
  readonly widgetId: string;
  readonly pageNumber: number;
  readonly rect: Rect;
  readonly onValue?: string;
}

export interface AcroFormFieldDescriptor {
  readonly name: string;
  readonly kind: AcroFormFieldKind;
  readonly readOnly: boolean;
  readonly required: boolean;
  readonly multiline?: boolean;
  readonly maxLength?: number;
  readonly options?: readonly string[];
  readonly value: AcroFormFieldValue;
  readonly widgets: readonly AcroFormWidgetDescriptor[];
}

export interface AcroFormExtractionResult {
  readonly hasForm: boolean;
  readonly fields: readonly AcroFormFieldDescriptor[];
}
