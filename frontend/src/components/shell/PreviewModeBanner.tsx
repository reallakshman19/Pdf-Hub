import React from 'react';
import type { AppMode } from '@/hooks/useCapabilities';

interface ModeBannerProps {
  mode: AppMode;
}

const BANNER_TEXT: Record<Exclude<AppMode, 'server'>, string> = {
  static: 'Running in static mode. Some features require a local server.',
  preview: 'Running in preview mode. Start the local server for full features.',
};

/**
 * Always-visible indicator for non-server modes. INV-9: non-dismissible.
 */
export const PreviewModeBanner: React.FC<ModeBannerProps> = ({ mode }) => {
  if (mode === 'server') return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="shrink-0 w-full bg-amber-400 text-amber-950 px-4 py-1.5 text-center text-xs font-semibold select-none"
    >
      {BANNER_TEXT[mode]}
    </div>
  );
};
