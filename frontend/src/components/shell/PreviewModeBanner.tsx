import React from 'react';

/**
 * Always-visible indicator for preview mode.
 */
export const PreviewModeBanner: React.FC = () => (
  <div
    role="status"
    aria-live="polite"
    className="shrink-0 w-full bg-amber-400 text-amber-950 px-4 py-1.5 text-center text-xs font-semibold select-none"
  >
    Running in preview mode. Start the local server for full features.
  </div>
);
