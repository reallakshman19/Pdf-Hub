import React, { useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Download,
  FileText,
  MessageSquare,
  RotateCcw,
  Send,
  XCircle,
} from 'lucide-react';

import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';
import { useReviewStore } from '@/core/review/store';
import {
  getAnnotationReviewStatus,
  isReviewConversationAnnotation,
} from '@/core/review/annotationReview';
import { exportReviewSummary, formatReviewSummaryText } from '@/core/review/export';
import { downloadBlob } from '@/core/document/download';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export const CommentsSidebar: React.FC = () => {
  const {
    annotations,
    activeAnnotationId,
    setActiveAnnotationId,
    setReviewStatus,
    addReviewReply,
  } = useAnnotationStore(useShallow((state) => ({
    annotations: state.annotations,
    activeAnnotationId: state.activeAnnotationId,
    setActiveAnnotationId: state.setActiveAnnotationId,
    setReviewStatus: state.setReviewStatus,
    addReviewReply: state.addReviewReply,
  })));
  const { setPage } = useSessionStore(useShallow((state) => ({
    setPage: state.setPage,
  })));
  const { filterStatus, setFilterStatus } = useReviewStore(useShallow((state) => ({
    filterStatus: state.filterStatus,
    setFilterStatus: state.setFilterStatus,
  })));

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');

  const reviewAnnotations = useMemo(
    () => annotations.filter(isReviewConversationAnnotation),
    [annotations],
  );

  const filteredAnnotations = useMemo(() => {
    return reviewAnnotations.filter((annotation) => {
      if (filterStatus === 'all') return true;
      return getAnnotationReviewStatus(annotation) === filterStatus;
    });
  }, [reviewAnnotations, filterStatus]);

  const groupedAnnotations = useMemo(() => {
    const groups: Record<number, typeof annotations> = {};
    for (const annotation of filteredAnnotations) {
      if (!groups[annotation.pageNumber]) groups[annotation.pageNumber] = [];
      groups[annotation.pageNumber].push(annotation);
    }
    return groups;
  }, [filteredAnnotations]);

  const handleExportJson = () => {
    const summary = exportReviewSummary(reviewAnnotations);
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `review-summary-${summary.generatedAt}.json`);
  };

  const handleExportText = () => {
    const summary = exportReviewSummary(reviewAnnotations);
    const text = formatReviewSummaryText(summary);
    const blob = new Blob([text], { type: 'text/plain' });
    downloadBlob(blob, `review-summary-${summary.generatedAt}.txt`);
  };

  const focusThread = (annotationId: string, pageNumber: number) => {
    setActiveAnnotationId(annotationId);
    setPage(pageNumber);
    setExpandedId((current) => current === annotationId ? null : annotationId);
    setReplyDraft('');
  };

  const submitReply = (annotationId: string) => {
    const value = replyDraft.trim();
    if (!value) return;
    addReviewReply(annotationId, value);
    setReplyDraft('');
  };

  if (reviewAnnotations.length === 0) {
    return (
      <div className="h-full flex items-center justify-center p-4">
        <div className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-5 text-center">
          <div className="mx-auto mb-3 h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
            No review conversations
          </div>
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Add a comment, sticky note, callout, or start a review on a markup.
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
      <div
        className="flex items-center gap-2 border-b border-slate-200 bg-white px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950"
      >
        <MessageSquare size={14} className="text-slate-500" />
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
          Comments
        </span>
        <span className="ml-auto text-[11px] text-slate-500">
          {reviewAnnotations.length}
        </span>
      </div>

      <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm text-slate-800 dark:text-slate-100">
            Review threads
          </h3>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleExportText}
              className="h-7 text-xs px-2"
              title="Export review as text"
            >
              <FileText className="w-3 h-3" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportJson}
              className="h-7 text-xs px-2"
              title="Export review as JSON"
            >
              <Download className="w-3 h-3" />
            </Button>
          </div>
        </div>

        <select
          aria-label="Filter review threads"
          value={filterStatus}
          onChange={(event) =>
            setFilterStatus(event.target.value as 'all' | 'open' | 'resolved' | 'rejected')
          }
          className="w-full text-sm p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="all">All threads</option>
          <option value="open">Open</option>
          <option value="resolved">Resolved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {sortedPages.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700">
            No threads match this filter.
          </div>
        ) : null}

        {sortedPages.map((pageNumber) => (
          <section key={pageNumber} className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider sticky top-0 bg-slate-50 dark:bg-slate-900/90 py-1 z-10 backdrop-blur-sm">
              Page {pageNumber}
            </h4>

            <div className="space-y-2">
              {groupedAnnotations[pageNumber]
                .slice()
                .sort((a, b) => b.updatedAt - a.updatedAt)
                .map((annotation) => {
                  const selected = annotation.id === activeAnnotationId;
                  const expanded = annotation.id === expandedId;
                  const review = annotation.data.review;
                  const status = getAnnotationReviewStatus(annotation);
                  const title =
                    review?.title?.trim()
                    || (typeof annotation.data.text === 'string' && annotation.data.text.trim()
                      ? annotation.data.text
                      : annotation.type.replaceAll('-', ' '));
                  const author =
                    review?.author
                    || (typeof annotation.data.author === 'string' ? annotation.data.author : 'Unknown');
                  const replies = review?.replies ?? [];

                  return (
                    <article
                      key={annotation.id}
                      className={`rounded-lg border transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/20'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950'
                      }`}
                      data-testid={`review-thread-${annotation.id}`}
                    >
                      <button
                        type="button"
                        className="w-full p-3 text-left"
                        onClick={() => focusThread(annotation.id, annotation.pageNumber)}
                        aria-expanded={expanded}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex min-w-0 items-center gap-2">
                            <Badge className="text-[10px] px-1.5 py-0 h-4 uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-none">
                              {annotation.type}
                            </Badge>
                            <StatusIcon status={status} />
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-slate-500">
                            {replies.length > 0 ? (
                              <span className="flex items-center gap-0.5">
                                <MessageSquare className="w-3 h-3" />
                                {replies.length}
                              </span>
                            ) : null}
                            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </div>
                        </div>

                        <div className="text-sm font-medium text-slate-800 dark:text-slate-100 line-clamp-2 leading-relaxed">
                          {title}
                        </div>

                        <div className="mt-2 text-[10px] text-slate-500 truncate">
                          {author} · {status}
                        </div>
                      </button>

                      {expanded ? (
                        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
                          {replies.length > 0 ? (
                            <div className="mb-3 space-y-2">
                              {replies.map((reply) => (
                                <div
                                  key={reply.id}
                                  className="rounded-md bg-slate-100 px-2.5 py-2 text-xs dark:bg-slate-900"
                                >
                                  <div className="mb-1 flex items-center justify-between gap-2">
                                    <span className="font-medium text-slate-700 dark:text-slate-200">
                                      {reply.author}
                                    </span>
                                    <span className="text-[10px] text-slate-500">
                                      {new Date(reply.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                                    {reply.content}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mb-3 text-xs italic text-slate-500">
                              No replies yet.
                            </div>
                          )}

                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={replyDraft}
                              onChange={(event) => setReplyDraft(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  submitReply(annotation.id);
                                }
                              }}
                              placeholder="Reply to this thread…"
                              aria-label="Reply to this thread"
                              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                            />
                            <Button
                              size="icon"
                              className="h-8 w-8 shrink-0"
                              onClick={() => submitReply(annotation.id)}
                              disabled={!replyDraft.trim()}
                              title="Send reply"
                            >
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {status === 'open' ? (
                              <>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  className="h-7 text-xs"
                                  onClick={() => setReviewStatus(annotation.id, 'resolved')}
                                >
                                  <CheckCircle2 className="mr-1 h-3 w-3" />
                                  Resolve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-red-600"
                                  onClick={() => setReviewStatus(annotation.id, 'rejected')}
                                >
                                  <XCircle className="mr-1 h-3 w-3" />
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => setReviewStatus(annotation.id, 'open')}
                              >
                                <RotateCcw className="mr-1 h-3 w-3" />
                                Reopen
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

function StatusIcon({ status }: { status: 'open' | 'resolved' | 'rejected' }) {
  if (status === 'resolved') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-green-600" aria-label="Resolved" />;
  }
  if (status === 'rejected') {
    return <XCircle className="w-3.5 h-3.5 text-red-600" aria-label="Rejected" />;
  }
  return <CircleDot className="w-3.5 h-3.5 text-blue-600" aria-label="Open" />;
}
