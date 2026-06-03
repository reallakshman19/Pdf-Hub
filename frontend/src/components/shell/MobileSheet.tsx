import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MobileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}

export const MobileSheet: React.FC<MobileSheetProps> = ({
  isOpen,
  onClose,
  title = 'Inspector',
  children,
}) => {
  const sheetRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number | null>(null);

  // Lock body scroll when sheet is open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Escape key support
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Touch handlers for swipe-to-close (drag down)
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === null || e.touches.length !== 1 || !sheetRef.current) return;

    const touchY = e.touches[0].clientY;
    const diffY = touchY - touchStartRef.current;

    // Only track downward swipes (positive values)
    if (diffY > 0) {
      sheetRef.current.style.transform = `translateY(${diffY}px)`;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null || !sheetRef.current) return;

    const touchY = e.changedTouches[0].clientY;
    const diffY = touchY - touchStartRef.current;
    touchStartRef.current = null;

    // Reset styles
    sheetRef.current.style.transform = '';

    // If swipe down is past threshold (80px), close it
    if (diffY > 80) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!isOpen}
      className={[
        'fixed inset-0 z-50 flex flex-col justify-end pointer-events-none transition-all duration-300',
        isOpen ? 'visible' : 'invisible',
      ].join(' ')}
    >
      {/* Backdrop */}
      <div
        data-testid="sheet-backdrop"
        onClick={onClose}
        className={[
          'fixed inset-0 bg-black/40 transition-opacity duration-300 ease-out pointer-events-auto',
          isOpen ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      {/* Bottom Sheet pane */}
      <div
        ref={sheetRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={[
          'relative flex flex-col w-full max-h-[60vh] bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pointer-events-auto rounded-t-xl shadow-2xl transition-transform duration-300 ease-out safe-bottom',
          isOpen ? 'translate-y-0' : 'translate-y-full',
        ].join(' ')}
      >
        {/* Drag handle */}
        <div
          data-testid="sheet-handle"
          className="w-full flex justify-center py-2 shrink-0 cursor-row-resize"
        >
          <div className="w-10 h-1 bg-slate-300 dark:bg-slate-700 rounded-full" />
        </div>

        {/* Sheet Header */}
        <div className="flex items-center justify-between px-4 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">{title}</span>
          <Button
            data-testid="sheet-close"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-11 w-11"
          >
            <X className="w-5 h-5 text-slate-500" />
          </Button>
        </div>

        {/* Scrollable Children Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </div>
  );
};
