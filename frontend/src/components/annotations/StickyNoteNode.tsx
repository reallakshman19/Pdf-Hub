import React from 'react';
import type { AnnotationNodeProps } from '../../core/annotations/types';
import { SelectionHandles } from './shared/SelectionHandles';

/** Returns a slightly darker shade of a hex color for the header strip */
function darken(hex: string, amount = 0.18): string {
  try {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amount));
    const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amount));
    const b = Math.max(0, (n & 0xff) * (1 - amount));
    return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
  } catch {
    return 'rgba(0,0,0,0.15)';
  }
}

export const StickyNoteNode: React.FC<AnnotationNodeProps<'sticky-note'>> = ({
  annotation, rect, isSelected, onSelect, onTransformStart, onDoubleClick,
}) => {
  const bg = annotation.data?.backgroundColor ?? '#fde047';
  const author = annotation.data?.author ?? 'Note';
  const text = annotation.data?.text ?? '';
  const isLocked = annotation.data?.locked === true;
  const collapsed = annotation.data?.isCollapsed !== false;

  /* ── Collapsed: post-it note shape ── */
  if (collapsed) {
    const FOLD = 14; // folded-corner size in px
    const W = 58;
    const H = 62;

    return (
      <div
        className="absolute pointer-events-auto cursor-pointer select-none"
        style={{ left: rect.x, top: rect.y, zIndex: 10 }}
        onPointerDown={e => { onSelect(e); if (!isLocked) onTransformStart(e, 'move'); }}
        onDoubleClick={onDoubleClick}
      >
        {/* Outer glow / selection ring */}
        <div
          style={{
            borderRadius: 3,
            outline: isSelected ? '2px solid #3b82f6' : 'none',
            outlineOffset: 2,
            transform: 'rotate(-1.8deg)',
            transition: 'transform 120ms ease, box-shadow 120ms ease',
            boxShadow: '2px 5px 12px rgba(0,0,0,0.28)',
          }}
          className="hover:-translate-y-0.5 hover:shadow-xl transition-transform"
        >
          {/* Note body — clipped to create folded corner */}
          <div
            style={{
              position: 'relative',
              width: W,
              height: H,
              background: bg,
              borderRadius: 3,
              clipPath: `polygon(0 0, 100% 0, 100% calc(100% - ${FOLD}px), calc(100% - ${FOLD}px) 100%, 0 100%)`,
              overflow: 'hidden',
            }}
          >
            {/* Header strip */}
            <div
              style={{
                background: darken(bg),
                height: 17,
                display: 'flex',
                alignItems: 'center',
                padding: '0 5px',
              }}
            >
              <span style={{
                fontSize: 8,
                fontWeight: 700,
                color: 'rgba(0,0,0,0.65)',
                fontFamily: 'system-ui, sans-serif',
                letterSpacing: '0.03em',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {author}
              </span>
            </div>

            {/* Text preview */}
            <div style={{
              padding: '3px 5px',
              fontSize: 7.5,
              lineHeight: 1.4,
              color: 'rgba(0,0,0,0.72)',
              fontFamily: 'system-ui, sans-serif',
              overflow: 'hidden',
              height: H - 17 - FOLD * 0.6,
              wordBreak: 'break-word',
            }}>
              {text || <span style={{ opacity: 0.4 }}>Empty note</span>}
            </div>

            {/* Folded corner shadow triangle */}
            <div style={{
              position: 'absolute',
              bottom: 0,
              right: 0,
              width: FOLD,
              height: FOLD,
              background: 'rgba(0,0,0,0.22)',
              clipPath: 'polygon(100% 0, 100% 100%, 0 100%)',
            }} />
          </div>
        </div>
      </div>
    );
  }

  /* ── Expanded: full sticky note card ── */
  return (
    <div
      className="absolute pointer-events-auto flex flex-col"
      style={{
        left: rect.x,
        top: rect.y,
        width: rect.width,
        height: rect.height,
        background: bg,
        border: `1.5px solid ${darken(bg, 0.25)}`,
        borderRadius: 6,
        boxShadow: isSelected
          ? '0 0 0 2px #3b82f6, 3px 6px 18px rgba(0,0,0,0.30)'
          : '3px 6px 16px rgba(0,0,0,0.22)',
        overflow: 'hidden',
      }}
      onPointerDown={e => { onSelect(e); if (!isLocked) onTransformStart(e, 'move'); }}
    >
      {/* Header */}
      <div
        style={{
          background: darken(bg),
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          cursor: isLocked ? 'default' : 'move',
        }}
      >
        <span style={{
          fontSize: 10,
          fontWeight: 700,
          color: 'rgba(0,0,0,0.65)',
          fontFamily: 'system-ui, sans-serif',
          letterSpacing: '0.02em',
        }}>
          {author}
        </span>
        <button
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '0 2px',
            lineHeight: 1,
            fontSize: 13,
            color: 'rgba(0,0,0,0.45)',
            borderRadius: 2,
          }}
          onClick={e => { e.stopPropagation(); onDoubleClick?.(); }}
          title="Collapse note"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        padding: '6px 8px',
        fontSize: 11,
        lineHeight: 1.5,
        color: 'rgba(0,0,0,0.78)',
        fontFamily: 'system-ui, sans-serif',
        overflowY: 'auto',
        wordBreak: 'break-word',
      }}>
        {text || <span style={{ opacity: 0.38, fontStyle: 'italic' }}>Double-click to edit…</span>}
      </div>

      {isSelected && !isLocked && (
        <SelectionHandles rect={rect} onTransformStart={onTransformStart} />
      )}
    </div>
  );
};
