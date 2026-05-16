import React from 'react';
import { useCapabilities } from '@/core/capabilities/useCapabilities';

export const PreviewModeBanner: React.FC = () => {
  const capabilities = useCapabilities();

  if (!capabilities || capabilities.mode === 'server') {
    return null;
  }

  return (
    <div
      data-testid="preview-mode-banner"
      className="bg-amber-100 text-amber-900 px-4 py-2 text-sm font-medium flex items-center justify-center border-b border-amber-200"
    >
      <svg
        className="w-4 h-4 mr-2 text-amber-600"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>
        Running in preview mode — start the local server for full editing features.{' '}
        <a
          href="https://github.com/doccraft/doccraft"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-amber-700 ml-1"
        >
          View Docs
        </a>
      </span>
    </div>
  );
};
