import React, { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({ isOpen, onClose, children }) => {
  const drawerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<number | null>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [isOpen]);

  // Focus trapping & ESC key support
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

  // Touch handlers for swipe-to-close
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = e.touches[0].clientX;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartRef.current === null || e.touches.length !== 1 || !drawerRef.current) return;
    
    const touchX = e.touches[0].clientX;
    const diffX = touchX - touchStartRef.current;

    // Only track leftward swipes (negative values)
    if (diffX < 0) {
      drawerRef.current.style.transform = `translateX(${diffX}px)`;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartRef.current === null || !drawerRef.current) return;

    const touchX = e.changedTouches[0].clientX;
    const diffX = touchX - touchStartRef.current;
    touchStartRef.current = null;

    // Reset styles
    drawerRef.current.style.transform = '';

    // If swipe left is past threshold (80px), close it
    if (diffX < -80) {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-hidden={!isOpen}
      className={[
        'fixed inset-0 z-50 flex overflow-hidden pointer-events-none transition-all duration-300',
        isOpen ? 'visible' : 'invisible',
      ].join(' ')}
    >
      {/* Backdrop */}
      <div
        data-testid="drawer-backdrop"
        onClick={onClose}
        className={[
          'fixed inset-0 bg-black/40 transition-opacity duration-300 ease-out pointer-events-auto',
          isOpen ? 'opacity-100' : 'opacity-0',
        ].join(' ')}
      />

      {/* Drawer content pane */}
      <div
        ref={drawerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className={[
          'relative flex flex-col w-[280px] max-w-[85vw] h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 pointer-events-auto shadow-2xl transition-transform duration-300 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
        ].join(' ')}
      >
        {/* Drawer Header with Close Button */}
        <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">Navigation</span>
          <Button
            data-testid="drawer-close"
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-11 w-11"
          >
            <X className="w-5 h-5 text-slate-500" />
          </Button>
        </div>

        {/* Scrollable Children content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};
