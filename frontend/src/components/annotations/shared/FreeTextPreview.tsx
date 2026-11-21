import { useLayoutEffect, useRef, useState } from 'react';

interface FreeTextPreviewProps {
  text: string;
  /** Change when text styling changes without changing the element's dimensions. */
  styleKey: string;
  className?: string;
}

/**
 * The editor and the PDF viewer use different text layout engines. Keep the
 * preview bounded to the annotation and tell the user when its text is hidden;
 * this does not predict how the PDF appearance will fit or wrap the text.
 */
export function FreeTextPreview({ text, styleKey, className }: FreeTextPreviewProps) {
  const textRef = useRef<HTMLDivElement>(null);
  const [measurement, setMeasurement] = useState({ clipped: false, width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) return;
    let active = true;
    const measure = () => {
      if (active) {
        const width = element.clientWidth;
        const height = element.clientHeight;
        const clipped = element.scrollWidth > width || element.scrollHeight > height;
        setMeasurement((previous) => previous.clipped === clipped && previous.width === width && previous.height === height
          ? previous : { clipped, width, height });
      }
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    // Font loading can change line wrapping without changing the box itself.
    document.fonts?.ready.then(measure).catch(() => {});
    document.fonts?.addEventListener('loadingdone', measure);
    return () => {
      active = false;
      observer?.disconnect();
      document.fonts?.removeEventListener('loadingdone', measure);
    };
  }, [text, styleKey]);

  const warning = 'The preview is clipped. The saved PDF may fit the text differently; enlarge the box to see the full preview.';
  const compactWarning = measurement.width < 95 || measurement.height < 18;
  const warningFontSize = Math.max(1, Math.min(10, measurement.width - 2, measurement.height - 2));
  return (
    <div title={measurement.clipped ? warning : undefined} style={{ width: '100%', height: '100%', position: 'relative', minHeight: 0 }}>
      <div
        ref={textRef}
        data-freetext-content="true"
        className={className}
        style={{ width: '100%', height: '100%', boxSizing: 'border-box', overflow: 'hidden',
          lineHeight: 1.25, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
      >
        {text}
      </div>
      {measurement.clipped && (
        <span
          role="status"
          aria-label={warning}
          title={warning}
          style={{ position: 'absolute', bottom: 0, right: 0, background: '#fff3c4', color: '#4a3000',
            border: '1px solid #9a6700', borderRadius: 2, padding: compactWarning ? 0 : '1px 3px',
            font: `${warningFontSize}px sans-serif`, lineHeight: 1, whiteSpace: 'nowrap',
            boxSizing: 'border-box', maxWidth: '100%', maxHeight: '100%', overflow: 'hidden' }}
        >
          {compactWarning ? '!' : 'Preview clipped'}
        </span>
      )}
    </div>
  );
}
