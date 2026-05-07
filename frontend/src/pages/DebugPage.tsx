import React, { useMemo, useState } from 'react';
import { useLoggerStore } from '@/core/logger/store';
import type { AppLogEntry } from '@/core/logger/types';
import { useSessionStore } from '@/core/session/store';
import { useEditorStore } from '@/core/editor/store';
import { useAnnotationStore } from '@/core/annotations/store';
import { useWriterStore } from '@/core/writer/store';
import { useSearchStore } from '@/core/search/store';
import { isDebugRouteEnabled } from '@/core/debug/availability';

type DebugTab = 'logs' | 'state' | 'performance' | 'system';

const DEBUG_TABS: DebugTab[] = ['logs', 'state', 'performance', 'system'];

export const DebugPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<DebugTab>('logs');
  const entries = useLoggerStore((state) => state.entries);
  const clearLogs = useLoggerStore((state) => state.clear);
  const sessionState = useSessionStore();
  const editorState = useEditorStore();
  const annotationState = useAnnotationStore();
  const writerState = useWriterStore();
  const searchState = useSearchStore();

  const sessionSnapshot = useMemo(
    () => ({
      documentKey: sessionState.documentKey,
      fileName: sessionState.fileName,
      pageCount: sessionState.pageCount,
      selectedPages: sessionState.selectedPages,
      isDirty: sessionState.isDirty,
      viewState: sessionState.viewState,
      hasWorkingBytes: sessionState.workingBytes !== null,
    }),
    [sessionState],
  );

  const editorSnapshot = useMemo(
    () => ({
      activeTool: editorState.activeTool,
      sidebarTab: editorState.sidebarTab,
      inspectorTab: editorState.inspectorTab,
      leftPanelWidth: editorState.leftPanelWidth,
      rightPanelWidth: editorState.rightPanelWidth,
    }),
    [editorState],
  );

  const annotationSnapshot = useMemo(
    () => ({
      annotationCount: annotationState.annotations.length,
      selectedAnnotationIds: annotationState.selectedAnnotationIds,
      activeAnnotationId: annotationState.activeAnnotationId,
      historyDepth: annotationState.history.length,
      futureDepth: annotationState.future.length,
    }),
    [annotationState],
  );

  const writerSnapshot = useMemo(
    () => ({
      elementCount: writerState.elements.length,
      selectedIds: writerState.selectedIds,
      activeId: writerState.activeId,
      activeTool: writerState.activeTool,
      undoDepth: writerState.undoStack.length,
      redoDepth: writerState.redoStack.length,
    }),
    [writerState],
  );

  const searchSnapshot = useMemo(
    () => ({
      query: searchState.query,
      hitCount: searchState.hits.length,
      activeHitId: searchState.activeHitId,
      isSearching: searchState.isSearching,
      error: searchState.error,
    }),
    [searchState],
  );

  const performanceSnapshot = useMemo(() => buildPerformanceSnapshot(entries), [entries]);
  const systemSnapshot = useMemo(() => buildSystemSnapshot(), []);

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 font-mono text-sm">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-bold text-slate-100">DocCraft Debug Console</h1>
          <span className="text-xs text-slate-400">
            {new Date().toLocaleString()}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            className="px-3 py-1 rounded-sm text-xs text-slate-300 hover:bg-slate-700/60"
            onClick={clearLogs}
          >
            Clear Logs
          </button>
        </div>
      </div>

      <div className="flex items-center px-4 py-2 bg-slate-900 border-b border-slate-800">
        <div className="flex space-x-1">
          {DEBUG_TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1 rounded-sm capitalize ${
                activeTab === tab
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'logs' && <LogsTab entries={entries} />}
        {activeTab === 'state' && (
          <StateTab
            sessionSnapshot={sessionSnapshot}
            editorSnapshot={editorSnapshot}
            annotationSnapshot={annotationSnapshot}
            writerSnapshot={writerSnapshot}
            searchSnapshot={searchSnapshot}
          />
        )}
        {activeTab === 'performance' && <PerformanceTab snapshot={performanceSnapshot} />}
        {activeTab === 'system' && <SystemTab snapshot={systemSnapshot} />}
      </div>
    </div>
  );
};

const LogsTab: React.FC<{ entries: AppLogEntry[] }> = ({ entries }) => (
  <div className="h-full overflow-y-auto p-4 space-y-1">
    {entries.map((entry) => (
      <div
        key={entry.id}
        data-testid="log-entry"
        className="flex items-start space-x-4 border-b border-slate-800/50 py-1 hover:bg-slate-800/30"
      >
        <span className="text-slate-500 w-24 shrink-0">
          {new Date(entry.timestamp).toLocaleTimeString()}
        </span>
        <span
          className={`w-16 shrink-0 uppercase text-xs font-bold ${
            entry.level === 'error'
              ? 'text-red-400'
              : entry.level === 'warn'
                ? 'text-amber-400'
                : entry.level === 'debug'
                  ? 'text-slate-400'
                  : 'text-blue-400'
          }`}
        >
          {entry.level}
        </span>
        <span className="w-24 shrink-0 text-purple-400">{entry.source}</span>
        <span className="text-slate-300 flex-1">{entry.message}</span>
      </div>
    ))}
    {entries.length === 0 && <div className="text-slate-500 italic">No logs recorded yet.</div>}
  </div>
);

interface StateTabProps {
  sessionSnapshot: {
    documentKey: string | null;
    fileName: string | null;
    pageCount: number;
    selectedPages: number[];
    isDirty: boolean;
    viewState: {
      currentPage: number;
      zoom: number;
      fitMode: string;
      viewMode: string;
    };
    hasWorkingBytes: boolean;
  };
  editorSnapshot: {
    activeTool: string;
    sidebarTab: string;
    inspectorTab: string;
    leftPanelWidth: number;
    rightPanelWidth: number;
  };
  annotationSnapshot: {
    annotationCount: number;
    selectedAnnotationIds: string[];
    activeAnnotationId: string | null;
    historyDepth: number;
    futureDepth: number;
  };
  writerSnapshot: {
    elementCount: number;
    selectedIds: string[];
    activeId: string | null;
    activeTool: string;
    undoDepth: number;
    redoDepth: number;
  };
  searchSnapshot: {
    query: string;
    hitCount: number;
    activeHitId: string | null;
    isSearching: boolean;
    error: string | null;
  };
}

const StateTab: React.FC<StateTabProps> = ({
  sessionSnapshot,
  editorSnapshot,
  annotationSnapshot,
  writerSnapshot,
  searchSnapshot,
}) => (
  <div className="h-full overflow-y-auto p-4 space-y-4">
    <JsonBlock title="Session Store" data={sessionSnapshot} />
    <JsonBlock title="Editor Store" data={editorSnapshot} />
    <JsonBlock title="Annotation Store" data={annotationSnapshot} />
    <JsonBlock title="Writer Store" data={writerSnapshot} />
    <JsonBlock title="Search Store" data={searchSnapshot} />
  </div>
);

interface PerformanceSnapshot {
  totalLogEntries: number;
  logLevels: Record<string, number>;
  renderEvents: number;
  avgRenderMs: number | null;
  maxRenderMs: number | null;
  minRenderMs: number | null;
  memoryUsedMb: number | null;
  memoryLimitMb: number | null;
  errorCount: number;
  warnCount: number;
}

const PerformanceTab: React.FC<{ snapshot: PerformanceSnapshot }> = ({ snapshot }) => (
  <div className="h-full overflow-y-auto p-4 space-y-4">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <MetricCard label="Log entries" value={String(snapshot.totalLogEntries)} />
      <MetricCard label="Warnings" value={String(snapshot.warnCount)} />
      <MetricCard label="Errors" value={String(snapshot.errorCount)} />
      <MetricCard label="Render events" value={String(snapshot.renderEvents)} />
      <MetricCard
        label="Average render (ms)"
        value={snapshot.avgRenderMs === null ? 'n/a' : snapshot.avgRenderMs.toFixed(2)}
      />
      <MetricCard
        label="Render range (ms)"
        value={
          snapshot.minRenderMs === null || snapshot.maxRenderMs === null
            ? 'n/a'
            : `${snapshot.minRenderMs.toFixed(2)} - ${snapshot.maxRenderMs.toFixed(2)}`
        }
      />
      <MetricCard
        label="Used JS heap (MB)"
        value={snapshot.memoryUsedMb === null ? 'n/a' : snapshot.memoryUsedMb.toFixed(1)}
      />
      <MetricCard
        label="Heap limit (MB)"
        value={snapshot.memoryLimitMb === null ? 'n/a' : snapshot.memoryLimitMb.toFixed(1)}
      />
    </div>
    <JsonBlock title="Log Levels" data={snapshot.logLevels} />
  </div>
);

interface SystemSnapshot {
  host: string;
  href: string;
  hash: string;
  userAgent: string;
  language: string;
  online: boolean;
  timezone: string;
  viewport: string;
  devicePixelRatio: number;
  logicalCores: number | null;
  debugRouteEnabled: boolean;
  devMode: boolean;
}

const SystemTab: React.FC<{ snapshot: SystemSnapshot }> = ({ snapshot }) => (
  <div className="h-full overflow-y-auto p-4 space-y-4">
    <JsonBlock title="System" data={snapshot} />
  </div>
);

const JsonBlock: React.FC<{ title: string; data: unknown }> = ({ title, data }) => (
  <section className="rounded border border-slate-700 bg-slate-950/60">
    <header className="px-3 py-2 border-b border-slate-800 text-slate-300 font-semibold">
      {title}
    </header>
    <pre className="px-3 py-2 text-xs text-slate-300 whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  </section>
);

const MetricCard: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded border border-slate-700 bg-slate-950/60 p-3">
    <div className="text-xs text-slate-400">{label}</div>
    <div className="text-lg text-slate-100 mt-1">{value}</div>
  </div>
);

interface BrowserPerformanceMemory {
  usedJSHeapSize: number;
  jsHeapSizeLimit: number;
}

function buildPerformanceSnapshot(entries: AppLogEntry[]): PerformanceSnapshot {
  const logLevels: Record<string, number> = {};
  const renderTimes: number[] = [];
  let warnCount = 0;
  let errorCount = 0;

  for (const entry of entries) {
    logLevels[entry.level] = (logLevels[entry.level] ?? 0) + 1;
    if (entry.level === 'warn') warnCount += 1;
    if (entry.level === 'error') errorCount += 1;

    if (entry.source === 'pdf-renderer' && entry.data) {
      const value = entry.data.renderTimeMs;
      if (typeof value === 'number' && Number.isFinite(value)) {
        renderTimes.push(value);
      }
    }
  }

  const avgRenderMs =
    renderTimes.length > 0
      ? renderTimes.reduce((sum, value) => sum + value, 0) / renderTimes.length
      : null;
  const minRenderMs = renderTimes.length > 0 ? Math.min(...renderTimes) : null;
  const maxRenderMs = renderTimes.length > 0 ? Math.max(...renderTimes) : null;

  const perfMemory = readPerformanceMemory();

  const memoryUsedMb =
    perfMemory && typeof perfMemory.usedJSHeapSize === 'number'
      ? perfMemory.usedJSHeapSize / (1024 * 1024)
      : null;

  const memoryLimitMb =
    perfMemory && typeof perfMemory.jsHeapSizeLimit === 'number'
      ? perfMemory.jsHeapSizeLimit / (1024 * 1024)
      : null;

  return {
    totalLogEntries: entries.length,
    logLevels,
    renderEvents: renderTimes.length,
    avgRenderMs,
    minRenderMs,
    maxRenderMs,
    memoryUsedMb,
    memoryLimitMb,
    warnCount,
    errorCount,
  };
}

function readPerformanceMemory(): BrowserPerformanceMemory | null {
  if (typeof performance === 'undefined') {
    return null;
  }

  const candidate = (performance as Performance & { memory?: unknown }).memory;
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const used = (candidate as { usedJSHeapSize?: unknown }).usedJSHeapSize;
  const limit = (candidate as { jsHeapSizeLimit?: unknown }).jsHeapSizeLimit;
  if (typeof used !== 'number' || typeof limit !== 'number') {
    return null;
  }

  return {
    usedJSHeapSize: used,
    jsHeapSizeLimit: limit,
  };
}

function buildSystemSnapshot(): SystemSnapshot {
  const logicalCores =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : null;

  return {
    host: window.location.host,
    href: window.location.href,
    hash: window.location.hash,
    userAgent: navigator.userAgent,
    language: navigator.language,
    online: navigator.onLine,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    devicePixelRatio: window.devicePixelRatio,
    logicalCores,
    debugRouteEnabled: isDebugRouteEnabled(window.location.hostname, import.meta.env.DEV),
    devMode: import.meta.env.DEV,
  };
}
