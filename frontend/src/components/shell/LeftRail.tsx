import React from 'react';
import { Bookmark, Layers, MessageSquare, Search, Sparkles, HelpCircle, ScanText } from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEditorStore } from '@/core/editor/store';
import { useCapabilities } from '@/hooks/useCapabilities';
import type { SidebarTab } from '@/core/editor/types';

const allTabs: Array<{ id: SidebarTab; icon: React.ComponentType<{ className?: string }>; label: string }> = [
  { id: 'thumbnails', icon: Layers,        label: 'Pages' },
  { id: 'search',     icon: Search,        label: 'Search' },
  { id: 'comments',   icon: MessageSquare, label: 'Comments' },
  { id: 'macros',     icon: Sparkles,      label: 'Macros' },
  { id: 'bookmarks',  icon: Bookmark,      label: 'Bookmarks' },
  { id: 'ocr',        icon: ScanText,      label: 'OCR' },
];

export const LeftRail: React.FC = () => {
  const { sidebarTab, setSidebarTab } = useEditorStore();
  const capabilities = useCapabilities();
  const visibleTabs = React.useMemo(
    () => allTabs.filter((tab) => {
      if (tab.id === 'macros') return capabilities.hasMacroConsole;
      return true;
    }),
    [capabilities.hasMacroConsole],
  );

  React.useEffect(() => {
    if (visibleTabs.some((tab) => tab.id === sidebarTab)) return;
    setSidebarTab('thumbnails');
  }, [setSidebarTab, sidebarTab, visibleTabs]);

  return (
    <div className="w-12 h-full flex flex-col items-center py-2 gap-0.5 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 shrink-0">
      {visibleTabs.map(({ id, icon: Icon, label }) => {
        const isActive = sidebarTab === id;
        return (
          <Tooltip key={id} content={label} position="right">
            <button
              onClick={() => setSidebarTab(id)}
              className={[
                'relative w-[34px] h-[34px] flex items-center justify-center rounded-md transition-all',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400'
                  : 'text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300',
              ].join(' ')}
            >
              {/* Active indicator line */}
              {isActive && (
                <span className="absolute left-[-1px] top-1/2 -translate-y-1/2 w-[3px] h-[18px] bg-blue-500 rounded-r-sm" />
              )}
              <Icon className="w-[17px] h-[17px]" />
            </button>
          </Tooltip>
        );
      })}

      <div className="flex-1" />

      <Tooltip content="Help" position="right">
        <button className="w-[34px] h-[34px] flex items-center justify-center rounded-md text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-all">
          <HelpCircle className="w-[17px] h-[17px]" />
        </button>
      </Tooltip>
    </div>
  );
};
