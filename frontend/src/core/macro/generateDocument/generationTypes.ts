import type { MacroRecipe } from '@/core/macro/types';

export type GenerationFieldType = 'text' | 'textarea' | 'date' | 'select';

export interface GenerationFieldOption {
  value: string;
  label: string;
}

export interface GenerationField {
  key: string;
  label: string;
  type: GenerationFieldType;
  defaultValue?: string;
  required?: boolean;
  options?: GenerationFieldOption[];
}

export interface GenerationTemplate {
  id: string;
  name: string;
  description: string;
  fields: GenerationField[];
  recipe: MacroRecipe;
}

export interface BuildGenerationRecipeInput {
  template: GenerationTemplate;
  values: Record<string, string>;
  fileName?: string;
  pageCount?: number;
  now?: Date;
  brandImageDataUrl?: string | null;
}
