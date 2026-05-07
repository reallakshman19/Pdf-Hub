import React from 'react';
import {
  Bookmark,
  Layers,
  MessageSquare,
  Search,
  Sparkles,
} from 'lucide-react';
import { Tooltip } from '@/components/ui/Tooltip';
import { useEditorStore } from '@/core/editor/store';
import type { SidebarTab } from '@/core/editor/types';

export const LeftRail: React.FC = () => {
  const { sidebarTab, setSidebarTab } = useEditorStore();

  const allTabs: Array<{
    id: SidebarTab;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }> = [
    { id: 'thumbnails', icon: Layers, label: 'Pages' },
    { id: 'bookmarks', icon: Bookmark, label: 'Bookmarks' },
    { id: 'comments', icon: MessageSquare, label: 'Comments' },
    { id: 'search', icon: Search, label: 'Search' },
    { id: 'macros', icon: Sparkles, label: 'Macros' },
  ];

  return (
    <div className="w-12 h-full flex flex-col items-center py-4 bg-slate-50 dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
      {allTabs.map((tab) => {
        const isActive = sidebarTab === tab.id;
        const Icon = tab.icon;

        return (
          <Tooltip key={tab.id} content={tab.label} position="right">
            <button
              onClick={() => setSidebarTab(tab.id)}
              className={`relative p-2 rounded-md transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-5 h-5" />
              {isActive && (
                <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-600 dark:bg-blue-500 rounded-r-md" />
              )}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
};
