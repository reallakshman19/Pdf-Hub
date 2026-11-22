import React, { useEffect, useRef, useState } from 'react';
import { FloatingFormatToolbar } from './FloatingFormatToolbar';

export interface InlineTextEditorProps {
  defaultValue: string;
  style: {
    fontSize: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: string;
    color?: string;
    backgroundColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    opacity?: number;
  };
  bounds: { width: number; height: number };
  scale: number;
  rotation?: number;
  allowToolbar?: boolean;
  onCommit: (text: string, stylePatch?: Record<string, unknown>) => void;
  onCancel: () => void;
  onChangeStyle?: (stylePatch: Record<string, unknown>) => void;
}

export const InlineTextEditor: React.FC<InlineTextEditorProps> = ({
  defaultValue,
  style,
  bounds,
  scale,
  rotation = 0,
  allowToolbar = true,
  onCommit,
  onCancel,
  onChangeStyle,
}) => {
  const [text, setText] = useState(defaultValue);
  const [stylePatch, setStylePatch] = useState<Record<string, unknown>>({});
  const [isUnrotated, setIsUnrotated] = useState(false);
  const [measuredHeight, setMeasuredHeight] = useState(bounds.height);
  const [measuredWidth, setMeasuredWidth] = useState(bounds.width);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);

  // Merged live typography
  const liveFontSize = (typeof stylePatch.fontSize === 'number' ? stylePatch.fontSize : style.fontSize) || 12;
  const liveFontWeight = stylePatch.fontWeight !== undefined ? (stylePatch.fontWeight as string | number) : (style.fontWeight ?? 'normal');
  const liveFontStyle = stylePatch.fontStyle !== undefined ? (stylePatch.fontStyle as string) : (style.fontStyle ?? 'normal');
  const liveColor = (stylePatch.textColor as string) || (stylePatch.color as string) || style.color || '#111827';
  const liveTextAlign = (stylePatch.textAlign as 'left' | 'center' | 'right') || style.textAlign || 'left';
  const liveBg = stylePatch.backgroundColor !== undefined ? (stylePatch.backgroundColor as string) : style.backgroundColor;
  const isTransparentBg = liveBg === 'transparent';

  // Dynamic non-clipping text expansion measurement
  useEffect(() => {
    if (measureRef.current) {
      const scrollH = measureRef.current.scrollHeight;
      const scrollW = measureRef.current.scrollWidth;
      // Option A (Adaptive CAD Wrap): Maintain at least bounds width, expand height downward
      setMeasuredHeight(Math.max(bounds.height, scrollH + 4));
      // Expand width gracefully if text exceeds single line without wrapping space
      setMeasuredWidth(Math.max(bounds.width, Math.min(scrollW + 6, Math.max(bounds.width, 420))));
    }
  }, [text, liveFontSize, bounds.width, bounds.height, scale]);

  // Initial caret focus to end of text
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.selectionStart = el.value.length;
      el.selectionEnd = el.value.length;
    }
  }, []);

  const handleUpdateStyle = (patch: Record<string, unknown>) => {
    setStylePatch((prev) => ({ ...prev, ...patch }));
    onChangeStyle?.(patch);
  };

  const handleInsertSymbol = (symbol: string) => {
    const el = textareaRef.current;
    if (!el) {
      setText((prev) => prev + symbol);
      return;
    }
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const nextText = el.value.substring(0, start) + symbol + el.value.substring(end);
    setText(nextText);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.selectionStart = start + symbol.length;
        textareaRef.current.selectionEnd = start + symbol.length;
      }
    }, 0);
  };

  const handleCommit = () => {
    if (Object.keys(stylePatch).length > 0) {
      onCommit(text, stylePatch);
    } else {
      onCommit(text);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposingRef.current) return;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    // If focus moved to floating toolbar or its popovers, do not commit yet
    if (containerRef.current && containerRef.current.contains(e.relatedTarget as Node)) {
      return;
    }
    handleCommit();
  };

  const effectiveRotation = isUnrotated ? 0 : rotation;

  return (
    <div
      ref={containerRef}
      data-testid="inline-text-editor-container"
      className="absolute top-0 left-0 z-40"
      style={{
        width: measuredWidth,
        minHeight: measuredHeight,
        transformOrigin: 'top left',
        transform: effectiveRotation ? `rotate(${effectiveRotation}deg)` : undefined,
        pointerEvents: 'all',
      }}
    >
      {/* Off-screen measurement div for accurate font metrics & expansion */}
      <div
        ref={measureRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          visibility: 'hidden',
          top: 0,
          left: 0,
          width: bounds.width,
          fontSize: liveFontSize * scale,
          fontFamily: style.fontFamily ?? 'Helvetica, Arial, sans-serif',
          fontWeight: liveFontWeight,
          fontStyle: liveFontStyle,
          lineHeight: 1.15,
          padding: '1px 3px',
          boxSizing: 'border-box',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {text || ' '}
      </div>

      {/* Floating Formatting Mini-Toolbar */}
      {allowToolbar && (
        <FloatingFormatToolbar
          fontSize={liveFontSize}
          fontWeight={liveFontWeight}
          fontStyle={liveFontStyle}
          textColor={liveColor}
          backgroundColor={liveBg}
          textAlign={liveTextAlign}
          rotation={rotation}
          isUnrotated={isUnrotated}
          onToggleUnrotate={() => setIsUnrotated((prev) => !prev)}
          onUpdateStyle={handleUpdateStyle}
          onInsertSymbol={handleInsertSymbol}
          onCommit={handleCommit}
          onCancel={onCancel}
        />
      )}

      {/* Active Polished Textarea */}
      <textarea
        ref={textareaRef}
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          width: '100%',
          height: measuredHeight,
          boxSizing: 'border-box',
          resize: 'none',
          overflow: 'hidden',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          border: 'none',
          outline: '1.5px solid #2563eb',
          outlineOffset: '0px',
          padding: '1px 3px',
          margin: 0,
          lineHeight: 1.15,
          fontSize: liveFontSize * scale,
          fontFamily: style.fontFamily ?? 'Helvetica, Arial, sans-serif',
          fontWeight: liveFontWeight,
          fontStyle: liveFontStyle,
          textAlign: liveTextAlign,
          color: liveColor,
          background: isTransparentBg
            ? 'rgba(255, 255, 255, 0.85)'
            : (liveBg ?? 'rgba(255, 255, 255, 0.95)'),
          backdropFilter: 'blur(2px)',
          borderRadius: 2,
        }}
      />
    </div>
  );
};
