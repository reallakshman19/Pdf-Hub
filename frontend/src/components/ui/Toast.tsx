import React from 'react';
import { useToastStore } from '@/core/toast/store';
import type { Toast as ToastType } from '@/core/toast/store';
import { X, CheckCircle, AlertCircle, Info, Loader2 } from 'lucide-react';
import { createPortal } from 'react-dom';

const ToastIcon = ({ type }: { type: ToastType['type'] }) => {
  switch (type) {
    case 'success':
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    case 'error':
      return <AlertCircle className="w-5 h-5 text-red-500" />;
    case 'info':
      return <Info className="w-5 h-5 text-blue-500" />;
    case 'progress':
      return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
  }
};

const ToastItem = ({ toast }: { toast: ToastType }) => {
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div
      className={`pointer-events-auto flex w-full max-w-md rounded-lg bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black ring-opacity-5 overflow-hidden transform transition-all duration-300 ${
        toast.type === 'error' ? 'border-l-4 border-red-500' :
        toast.type === 'success' ? 'border-l-4 border-green-500' :
        toast.type === 'progress' ? 'border-l-4 border-blue-500' : ''
      }`}
      role="alert"
    >
      <div className="p-4 w-full">
        <div className="flex items-start">
          <div className="flex-shrink-0">
            <ToastIcon type={toast.type} />
          </div>
          <div className="ml-3 w-0 flex-1 pt-0.5">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
              {toast.title}
            </p>
            {toast.message && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {toast.message}
              </p>
            )}
            {toast.type === 'progress' && toast.progress !== undefined && (
              <div className="mt-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }}
                />
              </div>
            )}
          </div>
          <div className="ml-4 flex-shrink-0 flex">
            <button
              className="bg-white dark:bg-slate-800 rounded-md inline-flex text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              onClick={() => removeToast(toast.id)}
            >
              <span className="sr-only">Close</span>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const ToastProvider: React.FC = () => {
  const toasts = useToastStore((state) => state.toasts);

  return createPortal(
    <div
      aria-live="assertive"
      className="fixed inset-0 flex items-end px-4 py-6 pointer-events-none sm:p-6 sm:items-start z-[100]"
    >
      <div className="w-full flex flex-col items-center space-y-4 sm:items-end">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </div>
    </div>,
    document.body
  );
};
