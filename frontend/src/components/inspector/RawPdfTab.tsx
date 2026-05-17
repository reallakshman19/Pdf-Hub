/*
 * Raw PDF tab component.
 *
 * Provides a read‑only view of the raw PDF data for the selected object.
 * For now, this component displays a placeholder message because
 * embedding raw PDF streams in the browser is not implemented.
 */

import React from 'react';

export default function RawPdfTab(): JSX.Element {
  return <div className="doccraft-inspector-rawpdf-tab">Raw PDF data not available</div>;
}