import { create } from 'zustand';
import type { AdmissionResult } from '@/core/admission/types';

export interface PdfPasswordPromptRequest {
  readonly fileName: string;
  readonly incorrectAttempt: boolean;
}

interface PasswordPromptStoreState {
  activeRequest: (PdfPasswordPromptRequest & {
    resolve: (password: string | null) => void;
  }) | null;
  queue: Array<PdfPasswordPromptRequest & {
    resolve: (password: string | null) => void;
  }>;
  hostMountCount: number;
  registerHost: () => () => void;
  requestPassword: (options: {
    fileName: string;
    incorrectAttempt?: boolean;
  }) => Promise<string | null>;
  submitPassword: (password: string) => void;
  cancelPrompt: () => void;
}

export const usePasswordPromptStore = create<PasswordPromptStoreState>((set, get) => ({
  activeRequest: null,
  queue: [],
  hostMountCount: 0,

  registerHost: () => {
    set((state) => ({ hostMountCount: state.hostMountCount + 1 }));
    return () => {
      set((state) => {
        const nextCount = Math.max(0, state.hostMountCount - 1);
        if (nextCount === 0) {
          state.activeRequest?.resolve(null);
          for (const queued of state.queue) {
            queued.resolve(null);
          }
          return { hostMountCount: 0, activeRequest: null, queue: [] };
        }
        return { hostMountCount: nextCount };
      });
    };
  },

  requestPassword: ({ fileName, incorrectAttempt = false }) => {
    if (get().hostMountCount === 0) {
      return Promise.resolve(null);
    }

    return new Promise<string | null>((resolve) => {
      const nextRequest = {
        fileName,
        incorrectAttempt,
        resolve,
      };
      set((state) => {
        if (!state.activeRequest) {
          return { activeRequest: nextRequest };
        }
        return { queue: [...state.queue, nextRequest] };
      });
    });
  },

  submitPassword: (password) => {
    const current = get().activeRequest;
    const [next, ...rest] = get().queue;
    set({
      activeRequest: next ?? null,
      queue: rest,
    });
    current?.resolve(password);
  },

  cancelPrompt: () => {
    const current = get().activeRequest;
    const [next, ...rest] = get().queue;
    set({
      activeRequest: next ?? null,
      queue: rest,
    });
    current?.resolve(null);
  },
}));

export function requestPdfPassword(options: {
  fileName: string;
  incorrectAttempt?: boolean;
}): Promise<string | null> {
  return usePasswordPromptStore.getState().requestPassword(options);
}

export function getAdmissionPasswordRequirement(
  result: AdmissionResult<unknown>,
): { required: boolean; incorrectAttempt: boolean } {
  const diagnostics = result.evidence.diagnostics;
  if (diagnostics.some((diagnostic) => diagnostic.code === 'PDF_PASSWORD_INCORRECT')) {
    return { required: true, incorrectAttempt: true };
  }
  if (diagnostics.some((diagnostic) => diagnostic.code === 'PDF_PASSWORD_REQUIRED')) {
    return { required: true, incorrectAttempt: false };
  }
  return { required: false, incorrectAttempt: false };
}

export async function openWithPasswordRetry<T extends AdmissionResult<unknown>>(
  openAttempt: (password?: string) => Promise<T>,
  fileName: string,
): Promise<{ result: T; cancelledByPasswordPrompt: boolean }> {
  let password: string | undefined;

  while (true) {
    const result = await openAttempt(password);
    if (result.outcome === 'ACCEPTED' || result.outcome === 'CANCELLED') {
      return { result, cancelledByPasswordPrompt: false };
    }

    const requirement = getAdmissionPasswordRequirement(result);
    if (!requirement.required || usePasswordPromptStore.getState().hostMountCount === 0) {
      return { result, cancelledByPasswordPrompt: false };
    }

    const entered = await requestPdfPassword({
      fileName,
      incorrectAttempt: requirement.incorrectAttempt,
    });
    if (entered === null) {
      return { result, cancelledByPasswordPrompt: true };
    }
    password = entered;
  }
}
