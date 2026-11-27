import { create } from 'zustand';
import { useSessionStore } from '@/core/session/store';
import { extractPdfFormFields } from './acroFormEngine';
import type { AcroFormFieldDescriptor, AcroFormFieldValue } from './types';

export interface AcroFormState {
  documentKey: string | null;
  fields: AcroFormFieldDescriptor[];
  initialValues: Record<string, AcroFormFieldValue>;
  values: Record<string, AcroFormFieldValue>;
  dirtyFieldNames: string[];
  highlightFields: boolean;
  loading: boolean;
}

export interface AcroFormActions {
  hydrateFromBytes: (documentKey: string, bytes: Uint8Array) => Promise<void>;
  setFieldValue: (fieldName: string, value: AcroFormFieldValue) => void;
  resetFormValues: () => void;
  markSaved: () => void;
  toggleHighlightFields: () => void;
  clearForm: () => void;
  getChangedFieldValues: () => Record<string, AcroFormFieldValue>;
}

function valuesEqual(a: AcroFormFieldValue | undefined, b: AcroFormFieldValue | undefined): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, idx) => v === b[idx]);
  }
  return a === b;
}

let hydrationSeq = 0;

export const useAcroFormStore = create<AcroFormState & AcroFormActions>((set, get) => ({
  documentKey: null,
  fields: [],
  initialValues: {},
  values: {},
  dirtyFieldNames: [],
  highlightFields: true,
  loading: false,

  hydrateFromBytes: async (documentKey, bytes) => {
    const seq = ++hydrationSeq;
    set({
      documentKey,
      loading: true,
    });
    const extracted = await extractPdfFormFields(bytes);
    if (seq !== hydrationSeq) return;

    const initialValues: Record<string, AcroFormFieldValue> = {};
    for (const field of extracted.fields) {
      initialValues[field.name] = Array.isArray(field.value)
        ? [...field.value]
        : field.value;
    }

    set({
      documentKey,
      fields: [...extracted.fields],
      initialValues,
      values: { ...initialValues },
      dirtyFieldNames: [],
      loading: false,
    });
  },

  setFieldValue: (fieldName, value) => {
    set((state) => {
      const nextValues = {
        ...state.values,
        [fieldName]: Array.isArray(value) ? [...value] : value,
      };
      const dirtyFieldNames = Object.keys(nextValues).filter(
        (name) => !valuesEqual(nextValues[name], state.initialValues[name]),
      );
      return {
        values: nextValues,
        dirtyFieldNames,
      };
    });
    if (get().dirtyFieldNames.length > 0) {
      const session = useSessionStore.getState();
      session.setDocumentDirty(true);
      session.setDirty(true);
    }
  },

  resetFormValues: () => {
    set((state) => ({
      values: { ...state.initialValues },
      dirtyFieldNames: [],
    }));
  },

  markSaved: () => {
    set((state) => ({
      initialValues: { ...state.values },
      dirtyFieldNames: [],
    }));
  },

  toggleHighlightFields: () => {
    set((state) => ({ highlightFields: !state.highlightFields }));
  },

  clearForm: () => {
    hydrationSeq += 1;
    set({
      documentKey: null,
      fields: [],
      initialValues: {},
      values: {},
      dirtyFieldNames: [],
      loading: false,
    });
  },

  getChangedFieldValues: () => {
    const state = get();
    const out: Record<string, AcroFormFieldValue> = {};
    for (const fieldName of state.dirtyFieldNames) {
      if (fieldName in state.values) {
        out[fieldName] = state.values[fieldName]!;
      }
    }
    return out;
  },
}));
