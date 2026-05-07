import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useSessionStore } from '@/core/session/store';
import { useAnnotationStore } from '@/core/annotations/store';

const CommentsSidebar: React.FC = () => {
  const { annotations, activeAnnotationId, setActiveAnnotationId } = useAnnotationStore();
  const { setPage } = useSessionStore();

  if (annotations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Comments</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create annotations on the page to see them listed here.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      {annotations
        .slice()
        .sort((a, b) => a.pageNumber - b.pageNumber || b.updatedAt - a.updatedAt)
        .map((annotation) => {
          const selected = annotation.id === activeAnnotationId;
          const text =
            typeof annotation.data.text === 'string' && annotation.data.text.trim()
              ? annotation.data.text
              : annotation.type.toUpperCase();

          return (
            <button
              key={annotation.id}
              className={`w-full text-left rounded-lg border p-3 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                selected
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
              }`}
              onClick={() => {
                setActiveAnnotationId(annotation.id);
                setPage(annotation.pageNumber);
              }}
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Page {annotation.pageNumber} · {annotation.type}
              </div>
              <div className="mt-1 text-sm text-slate-800 dark:text-slate-100 truncate">{text}</div>
            </button>
          );
        })}
    </div>
  );
};

export default CommentsSidebar;
