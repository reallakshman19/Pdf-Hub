import React from 'react';
import {
  FolderOpen,
  MousePointer2,
  Highlighter,
  PenTool,
  Type,
  Layers,
  Sparkles,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useEditorStore } from '@/core/editor/store';
import type { ActiveMode } from '@/core/editor/types';
import { useIsMobile } from '@/hooks/useIsMobile';

const MODES: Array<{ id: ActiveMode; icon: React.ComponentType<{ className?: string }>; label: string; ai?: boolean }> = [
  { id: 'file',     icon: FolderOpen,    label: 'File' },
  { id: 'view',     icon: MousePointer2, label: 'View' },
  { id: 'annotate', icon: Highlighter,   label: 'Annotate' },
  { id: 'draw',     icon: PenTool,       label: 'Draw' },
  { id: 'write',    icon: Type,          label: 'Write' },
  { id: 'organize', icon: Layers,        label: 'Organize' },
  { id: 'generate', icon: Sparkles,      label: 'Automate', ai: true },
];

export const ModeBar: React.FC = () => {
  const {
    activeMode,
    setActiveMode,
    setSidebarTab,
    setMobileDrawerOpen,
    setMobileSheetOpen,
  } = useEditorStore(useShallow((state) => ({
    activeMode: state.activeMode,
    setActiveMode: state.setActiveMode,
    setSidebarTab: state.setSidebarTab,
    setMobileDrawerOpen: state.setMobileDrawerOpen,
    setMobileSheetOpen: state.setMobileSheetOpen,
  })));
  const isMobile = useIsMobile();

  if (!isMobile) {
    return null;
  }

  return (
    <div
      className="flex items-center w-full gap-2 overflow-x-auto snap-x snap-mandatory px-3 py-2 scrollbar-none"
      style={{ overscrollBehavior: 'contain' }}
    >
      {MODES.map(({ id, icon: Icon, label, ai }) => {
        const isActive = activeMode === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              setActiveMode(id);
              setMobileSheetOpen(false);
              if (id === 'generate') {
                setSidebarTab('macros');
                setMobileDrawerOpen(true);
              }
            }}
            className={[
              'flex items-center justify-center gap-2 px-5 py-0 min-h-[44px] min-w-[100px] rounded-full text-sm font-medium whitespace-nowrap snap-center shrink-0 transition-all border border-slate-200 dark:border-slate-800 cursor-pointer bg-white dark:bg-slate-900',
              isActive
                ? ai
                  ? 'bg-purple-100 dark:bg-purple-950 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800'
                  : 'bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/80',
            ].join(' ')}
          >
            <Icon className="w-4 h-4 shrink-0" />
            {label}
          </button>
        );
      })}
    </div>
  );
};
