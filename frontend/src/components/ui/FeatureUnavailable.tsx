import React from 'react';

interface FeatureUnavailableProps {
  reason: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Placeholder for unavailable server-only features in preview mode.
 */
export const FeatureUnavailable: React.FC<FeatureUnavailableProps> = ({
  reason,
  actionLabel,
  onAction,
}) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
      <span className="text-sm text-slate-400">-</span>
    </div>
    <p className="max-w-48 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{reason}</p>
    {actionLabel && onAction ? (
      <button onClick={onAction} className="text-xs text-blue-600 hover:underline">
        {actionLabel}
      </button>
    ) : null}
  </div>
);
