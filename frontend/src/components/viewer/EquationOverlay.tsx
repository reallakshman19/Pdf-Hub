/*
 * EquationOverlay component.
 *
 * Renders absolutely-positioned wrappers for equation blocks discovered
 * during OCR, applying MathJax rendering inside the view.
 */

import React, { useState, useEffect } from 'react';
import type { OcrStore } from '../../core/ocr/store';
import type { LegacyOcrBlock as OcrBlock } from '../../core/ocr/store';
import EquationEditor from '../ocr/EquationEditor';
import { renderToSvg } from '../../adapters/equation/MathJaxAdapter';

export interface EquationOverlayProps {
  ocrStore: OcrStore;
  pageNumber: number;
  scale: number;
}

interface EquationBlockRendererProps {
  block: OcrBlock;
  pageNumber: number;
  scale: number;
  ocrStore: OcrStore;
}

function EquationBlockRenderer({
  block,
  pageNumber,
  scale,
  ocrStore,
}: EquationBlockRendererProps): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [svgHtml, setSvgHtml] = useState<string | null>(null);

  const left = block.rect.x * scale;
  const top = block.rect.y * scale;
  const width = block.rect.width * scale;
  const height = block.rect.height * scale;

  useEffect(() => {
    let cancelled = false;
    const fetchSvg = async () => {
      try {
        const svg = await renderToSvg(block.latex || block.text || '');
        if (!cancelled) setSvgHtml(svg);
      } catch {
        if (!cancelled) setSvgHtml(`<span style="color:red">Failed rendering math</span>`);
      }
    };
    fetchSvg();
    return () => {
      cancelled = true;
    };
  }, [block.latex, block.text]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(true);
  };

  const handleSave = (newLatex: string) => {
    ocrStore.updateBlock(pageNumber, block.id, { latex: newLatex });
    setEditing(false);
  };

  const isFailed = block.source === 'pix2tex' && (!block.latex || block.latex.trim() === '');

  return (
    <div
      className="absolute border border-blue-500 bg-blue-50/15 group pointer-events-auto"
      style={{
        left,
        top,
        width,
        height,
        boxSizing: 'border-box',
      }}
    >
      {/* SVG Math rendering or empty fallback */}
      {isFailed ? (
        <div className="w-full h-full flex items-center justify-center bg-red-50/50 text-[10px] text-red-600 font-semibold p-1">
          Equation Failed
        </div>
      ) : (
        /* SECURITY: svgHtml is rendered unsanitised. It is safe today only because
           MathJaxAdapter.renderToSvg is a placeholder that escapes & < > and returns
           static SVG. Any real MathJax (or other) renderer wired in here MUST have
           its output pass through a sanitizer that permits SVG, or this becomes an
           XSS sink fed by OCR-extracted LaTeX. */
        <div
          className="w-full h-full flex items-center justify-center overflow-hidden"
          dangerouslySetInnerHTML={{ __html: svgHtml || '' }}
        />
      )}

      {/* Edit button */}
      <button
        className="absolute right-1 top-1 bg-white hover:bg-slate-50 text-blue-600 hover:text-blue-700 text-[10px] font-medium border border-slate-200 rounded px-1.5 py-0.5 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer z-10"
        onClick={handleEditClick}
      >
        [Edit]
      </button>

      {/* Interactive Editor Modal / Popover */}
      {editing && (
        <div
          className="absolute z-50 top-full left-0 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl p-3 w-80 max-w-sm flex flex-col gap-2 pointer-events-auto"
          onMouseDown={e => e.stopPropagation()}
        >
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Edit Equation (LaTeX)
          </div>
          <EquationEditor
            initialValue={block.latex || block.text || ''}
            onChange={() => {
              // Standard change event
            }}
          />
          <div className="flex gap-2 justify-end mt-1 shrink-0">
            <button
              className="px-2 py-1 text-[11px] font-medium rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-pointer"
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
            <button
              className="px-2 py-1 text-[11px] font-medium rounded bg-blue-600 hover:bg-blue-700 text-white cursor-pointer"
              onClick={() => {
                const textarea = document.querySelector('.doccraft-equation-editor textarea') as HTMLTextAreaElement;
                if (textarea) handleSave(textarea.value);
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EquationOverlay({
  ocrStore,
  pageNumber,
  scale,
}: EquationOverlayProps): React.JSX.Element | null {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    return ocrStore.subscribe(() => {
      forceUpdate({});
    });
  }, [ocrStore]);

  const results = ocrStore.getResultsByPage()[pageNumber];
  if (!results || !results.blocks) return null;

  const equationBlocks = results.blocks.filter((block) => block.type === 'equation');
  if (equationBlocks.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-visible">
      {equationBlocks.map((block) => (
        <EquationBlockRenderer
          key={block.id}
          block={block}
          pageNumber={pageNumber}
          scale={scale}
          ocrStore={ocrStore}
        />
      ))}
    </div>
  );
}