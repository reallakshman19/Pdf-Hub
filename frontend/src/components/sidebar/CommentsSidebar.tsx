import React, { useMemo } from 'react';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useReviewStore } from '@/core/review/store';
import { exportReviewSummary, formatReviewSummaryText } from '@/core/review/export';
import { MessageSquare, Download, CircleDot, CheckCircle2, XCircle, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export const CommentsSidebar: React.FC = () => {
  const { annotations, activeAnnotationId, setActiveAnnotationId } = useAnnotationStore();
  const { setPage } = useSessionStore();
  const { filterStatus, setFilterStatus } = useReviewStore();

  const filteredAnnotations = useMemo(() => {
    return annotations.filter((a) => {
      if (filterStatus === 'all') return true;
      const status = a.data.review?.status || 'open';
      return status === filterStatus;
    });
  }, [annotations, filterStatus]);

  const groupedAnnotations = useMemo(() => {
    const groups: Record<number, typeof annotations> = {};
    for (const a of filteredAnnotations) {
      if (!groups[a.pageNumber]) groups[a.pageNumber] = [];
      groups[a.pageNumber].push(a);
    }
    return groups;
  }, [filteredAnnotations]);

  const handleExportJson = () => {
    const summary = exportReviewSummary(annotations);
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-summary-${summary.generatedAt}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportText = () => {
    const summary = exportReviewSummary(annotations);
    const text = formatReviewSummaryText(summary);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `review-summary-${summary.generatedAt}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (annotations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">Review Comments</div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Create annotations on the page to see them listed here for review.
          </div>
        </div>
      </div>
    );
  }

  const sortedPages = Object.keys(groupedAnnotations)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm text-slate-800 dark:text-slate-100">Review Filter</h3>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={handleExportText} className="h-7 text-xs px-2" title="Export as Text">
              <FileText className="w-3 h-3" />
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExportJson} className="h-7 text-xs px-2" title="Export as JSON">
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as 'all' | 'open' | 'resolved' | 'rejected')}
          className="w-full text-sm p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All Comments</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {sortedPages.map((pageNumber) => (
          <div key={pageNumber} className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-50 dark:bg-slate-900/90 py-1 z-10 backdrop-blur-sm">
              Page {pageNumber}
            </h4>
            <div className="space-y-2">
              {groupedAnnotations[pageNumber]
                .slice()
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((annotation) => {
                  const selected = annotation.id === activeAnnotationId;
                  const text =
                    typeof annotation.data.text === 'string' && annotation.data.text.trim()
                      ? annotation.data.text
                      : annotation.type.toUpperCase();

                  const status = annotation.data.review?.status || 'open';
                  const repliesCount = annotation.data.review?.replies?.length || 0;

                  return (
                    <button
                      key={annotation.id}
                      className={`w-full text-left rounded-lg border p-3 transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:bg-slate-50 dark:hover:bg-slate-900'
                      }`}
                      onClick={() => {
                        setActiveAnnotationId(annotation.id);
                        setPage(annotation.pageNumber);
                      }}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <Badge className="text-[10px] px-1.5 py-0 h-4 uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-none">
                          {annotation.type}
                        </Badge>
                        <div className="flex items-center space-x-1">
                          {repliesCount > 0 && (
                            <span className="text-[10px] text-slate-500 flex items-center">
                              <MessageSquare className="w-3 h-3 mr-0.5" />
                              {repliesCount}
                            </span>
                          )}
                          {status === 'open' && <CircleDot className="w-3 h-3 text-blue-500" />}
                          {status === 'resolved' && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                          {status === 'rejected' && <XCircle className="w-3 h-3 text-red-500" />}
                        </div>
                      </div>

                      <div className="text-sm text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed">
                        {text}
                      </div>

                      {annotation.data.review?.author && (
                        <div className="mt-2 text-[10px] text-slate-500 truncate">
                          By {annotation.data.review.author}
                        </div>
                      )}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
