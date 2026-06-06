import React from 'react';
import {
  ChevronDown,
  ChevronRight,
  Database,
  Download,
  FileSearch,
  FlaskConical,
  Info,
  Layers,
  PlayCircle,
  RotateCcw,
  Settings2,
  Workflow,
} from 'lucide-react';

export type OcrUnifiedSectionId =
  | 'source'
  | 'run'
  | 'review'
  | 'export'
  | 'project'
  | 'diagnostics';

export interface OcrUnifiedPanelProps {
  source?: React.ReactNode;
  run?: React.ReactNode;
  review?: React.ReactNode;
  exportTools?: React.ReactNode;
  project?: React.ReactNode;
  diagnostics?: React.ReactNode;

  title?: string;
  subtitle?: string;

  defaultOpenSections?: OcrUnifiedSectionId[];
  sourceSummary?: OcrUnifiedStatusItem[];
  runSummary?: OcrUnifiedStatusItem[];
}

export interface OcrUnifiedStatusItem {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
}

interface OcrUnifiedSectionConfig {
  id: OcrUnifiedSectionId;
  title: string;
  description: string;
  icon: React.ReactNode;
  content: React.ReactNode;
  defaultOpen: boolean;
}

export const OcrUnifiedPanel: React.FC<OcrUnifiedPanelProps> = ({
  source,
  run,
  review,
  exportTools,
  project,
  diagnostics,
  title = 'OCR Workspace',
  subtitle = 'Run OCR, review results, export searchable PDFs, and send OCR content to Writer.',
  defaultOpenSections = ['source', 'run', 'review'],
  sourceSummary = [],
  runSummary = [],
}) => {
  const sections: OcrUnifiedSectionConfig[] = [
    {
      id: 'source',
      title: 'Source',
      description: 'Active PDF, selected pages, demo fixtures, and PDF byte status.',
      icon: <FileSearch className="h-4 w-4 text-blue-600" />,
      content: source,
      defaultOpen: defaultOpenSections.includes('source'),
    },
    {
      id: 'run',
      title: 'Run',
      description: 'OCR engine, profile, pipeline mode, execution policy, and batch queue.',
      icon: <PlayCircle className="h-4 w-4 text-emerald-600" />,
      content: run,
      defaultOpen: defaultOpenSections.includes('run'),
    },
    {
      id: 'review',
      title: 'Review',
      description: 'OCR result review, regions, corrections, table review, and Writer insertion.',
      icon: <Layers className="h-4 w-4 text-violet-600" />,
      content: review,
      defaultOpen: defaultOpenSections.includes('review'),
    },
    {
      id: 'export',
      title: 'Export',
      description: 'Searchable PDF, OCR project payload, and OCR-derived outputs.',
      icon: <Download className="h-4 w-4 text-sky-600" />,
      content: exportTools,
      defaultOpen: defaultOpenSections.includes('export'),
    },
    {
      id: 'project',
      title: 'Project',
      description: 'Restore OCR state from project payload and hydrate OCR session data.',
      icon: <Database className="h-4 w-4 text-orange-600" />,
      content: project,
      defaultOpen: defaultOpenSections.includes('project'),
    },
    {
      id: 'diagnostics',
      title: 'Diagnostics',
      description: 'Pipeline, source, worker, certification, and execution messages.',
      icon: <Info className="h-4 w-4 text-slate-600" />,
      content: diagnostics,
      defaultOpen: defaultOpenSections.includes('diagnostics'),
    },
  ];

  return (
    <div
      className="flex h-full flex-col overflow-auto bg-slate-50 dark:bg-slate-950"
      data-testid="ocr-unified-panel"
    >
      <div className="border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-2">
          <Workflow className="mt-0.5 h-5 w-5 text-blue-600" />
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {title}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          </div>
        </div>

        {(sourceSummary.length > 0 || runSummary.length > 0) ? (
          <div
            className="mt-3 grid grid-cols-2 gap-2"
            data-testid="ocr-unified-summary"
          >
            {[...sourceSummary, ...runSummary].map((item) => (
              <OcrStatusTile
                key={`${item.label}-${item.value}`}
                item={item}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-3">
        {sections.map((section) => (
          <OcrUnifiedSection
            key={section.id}
            section={section}
          />
        ))}
      </div>
    </div>
  );
};

function OcrUnifiedSection({
  section,
}: {
  section: OcrUnifiedSectionConfig;
}) {
  const [open, setOpen] = React.useState(section.defaultOpen);

  if (!section.content) {
    return null;
  }

  return (
    <section
      className="rounded border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950"
      data-testid={`ocr-unified-section-${section.id}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((value) => !value)}
        data-testid={`ocr-unified-section-toggle-${section.id}`}
      >
        <span className="flex items-start gap-2">
          {section.icon}
          <span>
            <span className="block text-xs font-semibold text-slate-900 dark:text-slate-50">
              {section.title}
            </span>
            <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
              {section.description}
            </span>
          </span>
        </span>

        {open ? (
          <ChevronDown className="h-4 w-4 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 text-slate-500" />
        )}
      </button>

      {open ? (
        <div
          className="border-t border-slate-100 p-3 dark:border-slate-800"
          data-testid={`ocr-unified-section-content-${section.id}`}
        >
          {section.content}
        </div>
      ) : null}
    </section>
  );
}

function OcrStatusTile({
  item,
}: {
  item: OcrUnifiedStatusItem;
}) {
  const toneClass = getToneClass(item.tone ?? 'neutral');

  return (
    <div
      className={[
        'rounded border px-2 py-2 text-xs',
        toneClass,
      ].join(' ')}
      data-testid="ocr-unified-status-tile"
    >
      <div className="text-[10px] uppercase tracking-wide opacity-70">
        {item.label}
      </div>
      <div className="mt-0.5 truncate font-semibold">
        {item.value}
      </div>
    </div>
  );
}

function getToneClass(
  tone: NonNullable<OcrUnifiedStatusItem['tone']>,
): string {
  if (tone === 'success') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200';
  }

  if (tone === 'warning') {
    return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200';
  }

  if (tone === 'danger') {
    return 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200';
  }

  return 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
}

export const OcrUnifiedIcons = {
  Source: FileSearch,
  Run: PlayCircle,
  Review: Layers,
  Export: Download,
  Project: Database,
  Diagnostics: Info,
  Settings: Settings2,
  Demo: FlaskConical,
  Restore: RotateCcw,
};

// Static check markers:
// ocr-unified-section-source
// ocr-unified-section-run
// ocr-unified-section-diagnostics
