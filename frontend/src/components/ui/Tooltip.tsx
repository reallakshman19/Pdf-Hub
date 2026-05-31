import React, { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip: React.FC<TooltipProps> = ({ children, content, position = 'bottom' }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [followCursor, setFollowCursor] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const showAtCursor = (event: React.MouseEvent<HTMLSpanElement>) => {
    setFollowCursor(true);
    setCursorPos({ x: event.clientX, y: event.clientY });
    timeoutRef.current = window.setTimeout(() => setIsVisible(true), 120);
  };

  const showAtAnchor = () => {
    setFollowCursor(false);
    timeoutRef.current = window.setTimeout(() => setIsVisible(true), 120);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLSpanElement>) => {
    if (!followCursor) return;
    setCursorPos({ x: event.clientX, y: event.clientY });
  };

  const hide = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsVisible(false);
  };

  useLayoutEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      if (!anchorRef.current || !tooltipRef.current) return;

      const tooltip = tooltipRef.current.getBoundingClientRect();
      const padding = 6;
      const gap = 8;
      const cursorOffsetX = 12;
      const cursorOffsetY = 16;

      let left = 0;
      let top = 0;

      if (followCursor && cursorPos) {
        left = cursorPos.x + cursorOffsetX;
        top = cursorPos.y + cursorOffsetY;
      } else {
        const trigger = anchorRef.current.getBoundingClientRect();

        if (position === 'top') {
          left = trigger.left + trigger.width / 2 - tooltip.width / 2;
          top = trigger.top - tooltip.height - gap;
        } else if (position === 'bottom') {
          left = trigger.left + trigger.width / 2 - tooltip.width / 2;
          top = trigger.bottom + gap;
        } else if (position === 'left') {
          left = trigger.left - tooltip.width - gap;
          top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        } else {
          left = trigger.right + gap;
          top = trigger.top + trigger.height / 2 - tooltip.height / 2;
        }
      }

      const clampedLeft = Math.min(
        Math.max(padding, left),
        window.innerWidth - tooltip.width - padding,
      );
      const clampedTop = Math.min(
        Math.max(padding, top),
        window.innerHeight - tooltip.height - padding,
      );

      setTooltipStyle({
        position: 'fixed',
        left: clampedLeft,
        top: clampedTop,
      });
    };

    updatePosition();

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isVisible, position, followCursor, cursorPos]);

  return (
    <span
      ref={anchorRef}
      className="inline-flex"
      onMouseEnter={showAtCursor}
      onMouseMove={handleMouseMove}
      onMouseLeave={hide}
      onFocus={showAtAnchor}
      onBlur={hide}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className="z-[9999] px-2 py-1 text-xs text-white bg-slate-900 dark:bg-slate-800 rounded shadow-md whitespace-nowrap pointer-events-none"
            style={tooltipStyle}
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
};
