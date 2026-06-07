import React from 'react';
import {
  CheckCircle2,
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
  advanced?: boolean;
}

const OCR_QUICK_STEPS = [
  'PDF',
  'Run',
  'Review',
  'Export',
];

export const OcrUnifiedPanel: React.FC<OcrUnifiedPanelProps> = ({
  source,
  run,
  review,
  exportTools,
  project,
  diagnostics,
  title = 'OCR Assistant',
  subtitle = 'Extract text from this PDF and send clean content to Writer.',
  defaultOpenSections = ['source', 'run', 'review'],
  sourceSummary = [],
  runSummary = [],
}) => {
  const summaryItems = [...sourceSummary, ...runSummary];
  const guidance = getOcrGuidance(summaryItems);

  const sections: OcrUnifiedSectionConfig[] = [
    {
      id: 'run',
      title: 'Run OCR',
      description: 'Start with recommended settings. Advanced controls stay out of the way.',
      icon: <PlayCircle className="h-4 w-4 text-emerald-600" />,
      content: run,
      defaultOpen: defaultOpenSections.includes('run'),
    },
    {
      id: 'source',
      title: 'PDF source',
      description: 'Active PDF and page selection used for OCR.',
      icon: <FileSearch className="h-4 w-4 text-blue-600" />,
      content: source,
      defaultOpen: defaultOpenSections.includes('source'),
    },
    {
      id: 'review',
      title: 'Review result',
      description: 'Search, correct, crop regions, review tables, and send content to Writer.',
      icon: <Layers className="h-4 w-4 text-violet-600" />,
      content: review,
      defaultOpen: defaultOpenSections.includes('review'),
    },
    {
      id: 'export',
      title: 'Export',
      description: 'Create a searchable PDF or save OCR-derived outputs.',
      icon: <Download className="h-4 w-4 text-sky-600" />,
      content: exportTools,
      defaultOpen: defaultOpenSections.includes('export'),
    },
    {
      id: 'project',
      title: 'Restore OCR project',
      description: 'Reload saved OCR state from a project file.',
      icon: <Database className="h-4 w-4 text-orange-600" />,
      content: project,
      defaultOpen: defaultOpenSections.includes('project'),
      advanced: true,
    },
    {
      id: 'diagnostics',
      title: 'Diagnostics',
      description: 'Technical source, worker, pipeline, and execution messages.',
      icon: <Info className="h-4 w-4 text-slate-600" />,
      content: diagnostics,
      defaultOpen: defaultOpenSections.includes('diagnostics'),
      advanced: true,
    },
  ];

  const visibleSections = sections.filter((section) => Boolean(section.content));
  const primarySections = visibleSections.filter((section) => !section.advanced);
  const advancedSections = visibleSections.filter((section) => section.advanced);

  return (
    <div
      className="flex h-full flex-col overflow-auto bg-slate-50 dark:bg-slate-950"
      data-testid="ocr-unified-panel"
    >
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-3 py-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
            <Workflow className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-950 dark:text-slate-50">
                  {title}
                </h3>
                <p className="mt-0.5 max-w-2xl text-xs leading-5 text-slate-600 dark:text-slate-300">
                  {subtitle}
                </p>
              </div>

              <div
                className={[
                  'flex shrink-0 items-start gap-2 rounded-xl border px-2.5 py-2 text-xs shadow-sm lg:max-w-[280px]',
                  guidance.className,
                ].join(' ')}
                data-testid="ocr-guidance-card"
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-semibold leading-4">
                    {guidance.title}
                  </div>
                  <div className="mt-0.5 truncate leading-4 opacity-90">
                    {guidance.message}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300"
              data-testid="ocr-quick-start-steps"
            >
              {OCR_QUICK_STEPS.map((step, index) => (
                <React.Fragment key={step}>
                  <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 font-medium dark:border-slate-800 dark:bg-slate-900">
                    <span className="flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
                      {index + 1}
                    </span>
                    {step}
                  </span>
                  {index < OCR_QUICK_STEPS.length - 1 ? (
                    <span className="text-slate-300 dark:text-slate-700">→</span>
                  ) : null}
                </React.Fragment>
              ))}
            </div>

            {summaryItems.length > 0 ? (
              <div
                className="mt-3 flex flex-wrap gap-1.5"
                data-testid="ocr-unified-summary"
              >
                {summaryItems.map((item) => (
                  <OcrStatusTile
                    key={`${item.label}-${item.value}`}
                    item={item}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <main className="space-y-3 p-3">
        {primarySections.map((section) => (
          <OcrUnifiedSection
            key={section.id}
            section={section}
          />
        ))}

        {advancedSections.length > 0 ? (
          <details
            className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
            data-testid="ocr-advanced-details-group"
          >
            <summary className="cursor-pointer px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Advanced and troubleshooting
            </summary>
            <div className="space-y-2 border-t border-slate-100 p-2 dark:border-slate-800">
              {advancedSections.map((section) => (
                <OcrUnifiedSection
                  key={section.id}
                  section={section}
                />
              ))}
            </div>
          </details>
        ) : null}
      </main>
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
      id={`ocr-section-${section.id}`}
      className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
      data-testid={`ocr-unified-section-${section.id}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid={`ocr-unified-section-toggle-${section.id}`}
      >
        <span className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-900">
            {section.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-950 dark:text-slate-50">
              {section.title}
            </span>
            <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
              {section.description}
            </span>
          </span>
        </span>

        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
          {open ? 'Hide' : 'Show'}
          {open ? (
            <ChevronDown className="h-4 w-4 text-slate-500" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-500" />
          )}
        </span>
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
        'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs shadow-sm',
        toneClass,
      ].join(' ')}
      data-testid="ocr-unified-status-tile"
      title={`${item.label}: ${item.value}`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {item.label}
      </span>
      <span className="max-w-[170px] truncate font-semibold">
        {item.value}
      </span>
    </div>
  );
}

function getOcrGuidance(items: OcrUnifiedStatusItem[]): {
  title: string;
  message: string;
  className: string;
} {
  const pdf = items.find((item) => item.label.toLowerCase() === 'pdf');
  const selected = items.find((item) => item.label.toLowerCase() === 'selected');

  if (pdf?.tone === 'warning' || String(pdf?.value ?? '').toLowerCase() === 'missing') {
    return {
      title: 'Open a PDF first',
      message: 'Load a document to extract text.',
      className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    };
  }

  return {
    title: 'Ready for OCR',
    message: selected && selected.value !== 'all'
      ? `${selected.value} selected page(s).`
      : 'All pages unless you select a range.',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  };
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
