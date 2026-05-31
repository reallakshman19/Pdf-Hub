import React from 'react';
import type { TextItem } from '../../adapters/pdf-renderer/types';

export interface TextLayerProps {
  items: TextItem[];
  /** Scale of the page, used to position text accurately. */
  scale: number;
}

/**
 * TextLayer renders invisible spans over the page canvas to enable text
 * selection and highlighting.  In preview mode the text layer is empty
 * because the PdfRendererAdapter does not extract any text.  A real
 * implementation would iterate over `items` and position absolutely
 * positioned spans using `transform` or `top/left`.
 */
export const TextLayer: React.FC<TextLayerProps> = () => {
  return <div className="text-layer" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />;
};