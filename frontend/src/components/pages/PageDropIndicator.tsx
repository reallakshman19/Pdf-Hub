/*
 * Visual indicator for page drop insertion point.
 *
 * This component renders a horizontal bar or highlight to indicate where
 * pages will be inserted during drag‑and‑drop operations.  It is kept
 * simple to avoid dependencies on any drag library; the parent should
 * control its visibility.
 */

import React from 'react';

export interface PageDropIndicatorProps {
  visible: boolean;
}

export default function PageDropIndicator({ visible }: PageDropIndicatorProps): JSX.Element | null {
  if (!visible) {
    return null;
  }
  return <div className="doccraft-page-drop-indicator" />;
}