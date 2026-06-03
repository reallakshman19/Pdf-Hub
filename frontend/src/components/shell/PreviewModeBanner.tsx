import React from 'react';
import type { AppMode } from '@/hooks/useCapabilities';
import { useIsMobile } from '@/hooks/useIsMobile';

interface ModeBannerProps {
  mode: AppMode;
}

const BANNER_TEXT: Record<Exclude<AppMode, 'server'>, string> = {
  static: 'Running in static mode. Some features require a local server.',
  preview: 'Running in preview mode. Start the local server for full features.',
};

/**
 * Subtle indicator for non-server modes. On desktop, we show this in the StatusBar.
 * On mobile, since there's no status bar, we show a highly elegant subtle banner.
 */
export const PreviewModeBanner: React.FC<ModeBannerProps> = ({ mode }) => {
  const isMobile = useIsMobile();
  if (mode === 'server') return null;

  // On desktop, the status message is already integrated into the StatusBar
  if (!isMobile) return null;

  return (
    <div
      role="status"
      className="bg-amber-50/85 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[11px] font-medium text-center py-1.5 px-3 border-b border-amber-100 dark:border-amber-900/40 select-none"
    >
      {BANNER_TEXT[mode]}
    </div>
  );
};
