import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useSessionStore } from '@/core/session/store';
import { useToastStore } from '@/core/toast/store';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import { scanDocumentForFindReplaceMatches } from '@/core/existing-text/batchFindReplace';
import type { FindReplaceMatch } from '@/core/existing-text/batchFindReplaceTypes';
import { Search, Replace, Loader2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const FindReplaceDialog: React.FC<Props> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [matchWholeWord, setMatchWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const [matches, setMatches] = useState<FindReplaceMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const workingBytes = useSessionStore((state) => state.workingBytes);
  const documentKey = useSessionStore((state) => state.documentKey);
  const pageGraph = useSessionStore((state) => state.pageGraph);
  const addToast = useToastStore((state) => state.addToast);

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query || !workingBytes || !documentKey || !pageGraph) return;

    setSearching(true);
    try {
      const result = await scanDocumentForFindReplaceMatches(
        workingBytes,
        documentKey,
        pageGraph,
        {
          query,
          replacement,
          caseSensitive,
          matchWholeWord,
          useRegex,
        },
        true, // evaluate capabilities
      );

      setMatches(result.allMatches);
      if (result.allMatches.length === 0) {
        addToast({
          type: 'info',
          title: 'Find & Replace',
          message: `No matches found for "${query}".`,
        });
      }
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Search failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setSearching(false);
    }
  };

  const handleToggleSelectMatch = (matchId: string) => {
    setMatches((prev) =>
      prev.map((m) => (m.matchId === matchId ? { ...m, selected: !m.selected } : m)),
    );
  };

  const handleToggleSelectAll = () => {
    const allSelected = matches.every((m) => m.selected);
    setMatches((prev) => prev.map((m) => ({ ...m, selected: !allSelected })));
  };

  const handleReplaceAll = async () => {
    const selectedMatches = matches.filter((m) => m.selected);
    if (selectedMatches.length === 0 || !workingBytes || !documentKey) return;

    setReplacing(true);
    try {
      const result = await commandBus.execute({
        workingBytes,
        command: materializePdfCommand(
          {
            type: 'BATCH_REPLACE_EXISTING_TEXT',
            payload: {
              schemaVersion: 1,
              items: selectedMatches.map((m) => ({
                pageIndex: m.pageIndex,
                pageId: m.pageId,
                span: m.span,
                replacementText: m.replacementSpanText,
                capability: m.capability,
              })),
            },
          },
          'toolbar',
          documentKey,
        ),
      });

      if (!result.success) {
        addToast({
          type: 'error',
          title: 'Batch replacement failed',
          message: result.error?.message ?? result.message,
        });
        return;
      }

      addToast({
        type: 'success',
        title: 'Batch replacement complete',
        message: result.message,
      });

      onClose();
    } catch (error) {
      addToast({
        type: 'error',
        title: 'Batch replacement failed',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setReplacing(false);
    }
  };

  const selectedCount = matches.filter((m) => m.selected).length;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Find & Replace in Document">
      <div className="space-y-4">
        {/* Search Inputs */}
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Find text
            </label>
            <div className="relative mt-1">
              <input
                data-testid="find-query-input"
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleSearch();
                }}
                placeholder="Search across all pages..."
                className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-3 pr-8 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void handleSearch()}
                disabled={searching || !query}
                className="absolute right-2 top-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Replace with
            </label>
            <input
              data-testid="replace-text-input"
              type="text"
              value={replacement}
              onChange={(e) => setReplacement(e.target.value)}
              placeholder="Enter replacement text..."
              className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          {/* Search Options / Flags */}
          <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                data-testid="find-case-toggle"
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Match case (Aa)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                data-testid="find-whole-word-toggle"
                type="checkbox"
                checked={matchWholeWord}
                onChange={(e) => setMatchWholeWord(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Whole word (\b)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                data-testid="find-regex-toggle"
                type="checkbox"
                checked={useRegex}
                onChange={(e) => setUseRegex(e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Regular expression (.*)</span>
            </label>
          </div>
        </div>

        {/* Action Button: Find All */}
        <div className="flex justify-between items-center pt-1 border-t border-slate-200 dark:border-slate-800">
          <Button
            data-testid="find-all-button"
            variant="secondary"
            onClick={() => void handleSearch()}
            disabled={searching || !query}
          >
            {searching ? 'Scanning pages…' : 'Find All'}
          </Button>

          {matches.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleSelectAll}
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                {matches.every((m) => m.selected) ? 'Deselect all' : 'Select all'}
              </button>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {selectedCount} of {matches.length} selected
              </span>
            </div>
          )}
        </div>

        {/* Matches List Preview */}
        {matches.length > 0 && (
          <div
            data-testid="find-matches-list"
            className="max-h-60 overflow-y-auto space-y-1.5 rounded-md border border-slate-200 p-2 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50"
          >
            {matches.map((m) => (
              <label
                key={m.matchId}
                data-testid={`find-match-row-${m.matchId}`}
                className="flex items-start gap-2 p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer text-xs"
              >
                <input
                  type="checkbox"
                  checked={m.selected}
                  onChange={() => handleToggleSelectMatch(m.matchId)}
                  className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="rounded bg-slate-200 px-1 py-0.2 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      Page {m.pageIndex + 1}
                    </span>
                    {m.capability?.status === 'native' ? (
                      <span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                        Native in-place
                      </span>
                    ) : m.capability?.status === 'fallback-proved' ? (
                      <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                        Proved clearance
                      </span>
                    ) : (
                      <span className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                        Reconstructed
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-slate-800 dark:text-slate-200 truncate">
                    {m.originalSpanText.slice(0, m.matchStartIndex)}
                    <mark className="bg-yellow-200 text-slate-900 dark:bg-yellow-500/30 dark:text-yellow-200 px-0.5 rounded">
                      {m.matchedSubstring}
                    </mark>
                    {m.originalSpanText.slice(m.matchEndIndex)}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    → {m.replacementSpanText}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {/* Footer Actions */}
        <div className="mt-4 flex justify-end gap-2 border-t border-slate-200 pt-3 dark:border-slate-800">
          <Button variant="ghost" type="button" onClick={onClose} disabled={replacing}>
            Cancel
          </Button>
          <Button
            data-testid="replace-all-button"
            variant="primary"
            onClick={() => void handleReplaceAll()}
            disabled={replacing || selectedCount === 0}
          >
            {replacing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-4 w-4 animate-spin" />
                Replacing…
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Replace className="h-4 w-4" />
                Replace Selected ({selectedCount})
              </span>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
