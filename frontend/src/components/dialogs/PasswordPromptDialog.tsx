import React, { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { usePasswordPromptStore } from '@/core/pdf/passwordPromptBridge';

interface PasswordPromptFormProps {
  activeRequest: {
    fileName: string;
    incorrectAttempt: boolean;
  };
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

const PasswordPromptForm: React.FC<PasswordPromptFormProps> = ({
  activeRequest,
  onSubmit,
  onCancel,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(timer);
  }, []);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length === 0) {
      return;
    }
    const submitted = password;
    setPassword('');
    onSubmit(submitted);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 text-slate-700 dark:text-slate-200"
      data-testid="pdf-password-prompt-dialog"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
          <Lock className="w-5 h-5" />
        </div>
        <div className="text-xs leading-relaxed">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            {activeRequest.fileName || 'This PDF'} is encrypted.
          </p>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Enter the document password to view, search, and print it in PDF Hub.
          </p>
        </div>
      </div>

      {activeRequest.incorrectAttempt ? (
        <div
          role="alert"
          data-testid="pdf-password-error-banner"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300"
        >
          Incorrect password. Check Caps Lock and try again.
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label
          htmlFor="pdf-unlock-password-input"
          className="block text-xs font-medium text-slate-700 dark:text-slate-300"
        >
          Document Password
        </label>
        <div className="relative flex items-center">
          <input
            ref={inputRef}
            id="pdf-unlock-password-input"
            data-testid="pdf-unlock-password-input"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            placeholder="Enter PDF password…"
            className="w-full rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 pr-9 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            className="absolute right-2 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-transparent border-none cursor-pointer"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={password.length === 0}
          data-testid="pdf-unlock-submit-btn"
        >
          Unlock PDF
        </Button>
      </div>
    </form>
  );
};

export const PasswordPromptDialog: React.FC = () => {
  const activeRequest = usePasswordPromptStore((state) => state.activeRequest);
  const registerHost = usePasswordPromptStore((state) => state.registerHost);
  const submitPassword = usePasswordPromptStore((state) => state.submitPassword);
  const cancelPrompt = usePasswordPromptStore((state) => state.cancelPrompt);

  useEffect(() => registerHost(), [registerHost]);

  return (
    <Modal
      isOpen={Boolean(activeRequest)}
      onClose={cancelPrompt}
      title="Unlock Password-Protected PDF"
      size="md"
    >
      {activeRequest ? (
        <PasswordPromptForm
          key={`${activeRequest.fileName}:${activeRequest.incorrectAttempt ? 'retry' : 'first'}`}
          activeRequest={activeRequest}
          onSubmit={submitPassword}
          onCancel={cancelPrompt}
        />
      ) : null}
    </Modal>
  );
};
