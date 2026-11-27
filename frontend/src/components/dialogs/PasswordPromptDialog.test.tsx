import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PasswordPromptDialog } from './PasswordPromptDialog';
import {
  openWithPasswordRetry,
  requestPdfPassword,
  usePasswordPromptStore,
} from '@/core/pdf/passwordPromptBridge';
import type { AdmissionResult } from '@/core/admission/types';

function makePasswordRejection(code: 'PDF_PASSWORD_REQUIRED' | 'PDF_PASSWORD_INCORRECT'): AdmissionResult<never> {
  return {
    outcome: 'REJECTED_INVALID_FORMAT',
    evidence: {
      profileId: 'OPEN_PDF',
      policyVersion: 'test',
      authority: { kind: 'EXISTING_SOURCE_POLICY', sourceId: 'test' },
      measurements: [],
      diagnostics: [
        {
          severity: 'error',
          code,
          phase: 'VALIDATION',
          message: code === 'PDF_PASSWORD_INCORRECT' ? 'Incorrect password' : 'Password required',
        },
      ],
    },
  };
}

describe('PasswordPromptDialog & openWithPasswordRetry', () => {
  afterEach(() => {
    usePasswordPromptStore.setState({
      activeRequest: null,
      queue: [],
      hostMountCount: 0,
    });
  });

  it('resolves entered password and supports incorrect retry message', async () => {
    render(<PasswordPromptDialog />);

    let attempt!: Promise<string | null>;
    act(() => {
      attempt = requestPdfPassword({ fileName: 'secret.pdf', incorrectAttempt: true });
    });

    expect(await screen.findByTestId('pdf-password-prompt-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('pdf-password-error-banner')).toHaveTextContent(/Incorrect password/i);
    expect(screen.getByTestId('pdf-unlock-submit-btn')).toBeDisabled();

    fireEvent.change(screen.getByTestId('pdf-unlock-password-input'), {
      target: { value: 'open-sesame' },
    });
    expect(screen.getByTestId('pdf-unlock-submit-btn')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('pdf-unlock-submit-btn'));

    await expect(attempt).resolves.toBe('open-sesame');
  });

  it('retries openWithPasswordRetry across incorrect attempt until unlocked', async () => {
    render(<PasswordPromptDialog />);

    const attempts: Array<string | undefined> = [];
    const retryPromise = openWithPasswordRetry(async (password) => {
      attempts.push(password);
      if (password === undefined) {
        return makePasswordRejection('PDF_PASSWORD_REQUIRED');
      }
      if (password !== 'correct-pw') {
        return makePasswordRejection('PDF_PASSWORD_INCORRECT');
      }
      return {
        outcome: 'ACCEPTED',
        value: { ok: true },
        evidence: {
          profileId: 'OPEN_PDF',
          policyVersion: 'test',
          authority: { kind: 'EXISTING_SOURCE_POLICY', sourceId: 'test' },
          measurements: [],
          diagnostics: [],
        },
      };
    }, 'locked.pdf');

    await screen.findByTestId('pdf-password-prompt-dialog');
    expect(screen.queryByTestId('pdf-password-error-banner')).not.toBeInTheDocument();

    fireEvent.change(screen.getByTestId('pdf-unlock-password-input'), {
      target: { value: 'wrong-pw' },
    });
    fireEvent.click(screen.getByTestId('pdf-unlock-submit-btn'));

    await screen.findByTestId('pdf-password-error-banner');
    fireEvent.change(screen.getByTestId('pdf-unlock-password-input'), {
      target: { value: 'correct-pw' },
    });
    fireEvent.click(screen.getByTestId('pdf-unlock-submit-btn'));

    const outcome = await retryPromise;
    expect(outcome.cancelledByPasswordPrompt).toBe(false);
    expect(outcome.result.outcome).toBe('ACCEPTED');
    expect(attempts).toEqual([undefined, 'wrong-pw', 'correct-pw']);
  });
});
