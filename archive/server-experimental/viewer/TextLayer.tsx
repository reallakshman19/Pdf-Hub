import React, { useEffect, useState } from 'react';
import { PdfRendererAdapter } from '@/adapters/pdf-renderer/PdfRendererAdapter';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextBlock } from '@/core/ocr/types';
import { useEditorStore } from '@/core/editor/store';

interface TextLayerProps {
  page: PDFPageProxy;
  scale: number;
}

export const TextLayer: React.FC<TextLayerProps> = ({ page, scale }) => {
  const [textItems, setTextItems] = useState<TextBlock[]>([]);
  const { activeTool } = useEditorStore();

  useEffect(() => {
    let mounted = true;
    PdfRendererAdapter.getTextContent(page).then(items => {
      if (mounted) setTextItems(items);
    });
    return () => { mounted = false; };
  }, [page]);


  return (
    <div 
      className="absolute top-0 left-0 w-full h-full overflow-hidden leading-none mix-blend-multiply"
      style={{
        pointerEvents: activeTool === 'select' ? 'auto' : 'none'
      }}
    >
      {textItems.map((item) => {
        return (
          <span
            key={item.id}
            className="absolute text-transparent cursor-text select-text"
            style={{
              left: `${item.rect.x * scale}px`,
              top: `${item.rect.y * scale}px`,
              width: `${item.rect.width * scale}px`,
              height: `${item.rect.height * scale}px`,
              fontSize: `${item.rect.height * scale}px`,
              transformOrigin: 'top left',
            }}
          >
            {item.text}
          </span>
        );
      })}
    </div>
  );
};
