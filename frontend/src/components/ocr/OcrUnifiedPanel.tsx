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
  stepLabel: string;
  advanced?: boolean;
}

const OCR_QUICK_STEPS = [
  'Confirm PDF',
  'Run OCR',
  'Review result',
  'Export or send to Writer',
];

export const OcrUnifiedPanel: React.FC<OcrUnifiedPanelProps> = ({
  source,
  run,
  review,
  exportTools,
  project,
  diagnostics,
  title = 'OCR Assistant',
  subtitle = 'Extract text from the current PDF, review the result, then export or insert clean content into Writer.',
  defaultOpenSections = ['source', 'run', 'review'],
  sourceSummary = [],
  runSummary = [],
}) => {
  const summaryItems = [...sourceSummary, ...runSummary];
  const guidance = getOcrGuidance(summaryItems);

  const sections: OcrUnifiedSectionConfig[] = [
    {
      id: 'source',
      title: 'PDF source',
      description: 'Confirm the active PDF and selected pages before OCR starts.',
      stepLabel: 'Source',
      icon: <FileSearch className="h-4 w-4 text-blue-600" />,
      content: source,
      defaultOpen: defaultOpenSections.includes('source'),
    },
    {
      id: 'run',
      title: 'Run OCR',
      description: 'Use the recommended path first. Open advanced settings only when needed.',
      stepLabel: 'Run',
      icon: <PlayCircle className="h-4 w-4 text-emerald-600" />,
      content: run,
      defaultOpen: defaultOpenSections.includes('run'),
    },
    {
      id: 'review',
      title: 'Review result',
      description: 'Verify quality, correct doubtful text, crop regions, and prepare Writer output.',
      stepLabel: 'Review',
      icon: <Layers className="h-4 w-4 text-violet-600" />,
      content: review,
      defaultOpen: defaultOpenSections.includes('review'),
    },
    {
      id: 'export',
      title: 'Export',
      description: 'Create a searchable PDF or save OCR-derived outputs.',
      stepLabel: 'Export',
      icon: <Download className="h-4 w-4 text-sky-600" />,
      content: exportTools,
      defaultOpen: defaultOpenSections.includes('export'),
    },
    {
      id: 'project',
      title: 'Restore OCR project',
      description: 'Reload saved OCR state from a project file.',
      stepLabel: 'Restore',
      icon: <Database className="h-4 w-4 text-orange-600" />,
      content: project,
      defaultOpen: defaultOpenSections.includes('project'),
      advanced: true,
    },
    {
      id: 'diagnostics',
      title: 'Advanced details',
      description: 'Technical source, worker, pipeline, and execution messages for troubleshooting.',
      stepLabel: 'Details',
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
      className="flex h-full flex-col overflow-auto bg-slate-100 dark:bg-slate-950"
      data-testid="ocr-unified-panel"
    >
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm">
              <Workflow className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-950 dark:text-slate-50">
                {title}
              </h3>
              <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600 dark:text-slate-300">
                {subtitle}
              </p>
            </div>
          </div>

          <div
            className={[
              'rounded-2xl border px-3 py-2 text-xs shadow-sm lg:min-w-[260px]',
              guidance.className,
            ].join(' ')}
            data-testid="ocr-guidance-card"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-semibold">
                  {guidance.title}
                </div>
                <div className="mt-0.5 leading-4 opacity-90">
                  {guidance.message}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-4 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 xl:grid-cols-4"
          data-testid="ocr-quick-start-steps"
        >
          {OCR_QUICK_STEPS.map((step, index) => (
            <div
              key={step}
              className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-semibold text-white">
                {index + 1}
              </span>
              <span className="font-medium">
                {step}
              </span>
            </div>
          ))}
        </div>

        {summaryItems.length > 0 ? (
          <div
            className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4"
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

      <div className="grid gap-4 p-4 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden xl:block">
          <div className="sticky top-40 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Workflow
            </div>
            <div className="space-y-1">
              {visibleSections.map((section, index) => (
                <a
                  key={section.id}
                  href={`#ocr-section-${section.id}`}
                  className="flex items-center gap-2 rounded-xl px-2 py-2 text-xs text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-900"
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {index + 1}
                  </span>
                  <span className="truncate">{section.stepLabel}</span>
                </a>
              ))}
            </div>
          </div>
        </aside>

        <main className="space-y-4">
          {primarySections.map((section) => (
            <OcrUnifiedSection
              key={section.id}
              section={section}
            />
          ))}

          {advancedSections.length > 0 ? (
            <details
              className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
              data-testid="ocr-advanced-details-group"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800 dark:text-slate-100">
                Advanced and troubleshooting
              </summary>
              <div className="space-y-3 border-t border-slate-100 p-3 dark:border-slate-800">
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
      className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950"
      data-testid={`ocr-unified-section-${section.id}`}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-900"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        data-testid={`ocr-unified-section-toggle-${section.id}`}
      >
        <span className="flex items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-900">
            {section.icon}
          </span>
          <span>
            <span className="block text-sm font-semibold text-slate-950 dark:text-slate-50">
              {section.title}
            </span>
            <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">
              {section.description}
            </span>
          </span>
        </span>

        <span className="flex items-center gap-1 text-xs text-slate-500">
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
          className="border-t border-slate-100 p-4 dark:border-slate-800"
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
        'rounded-2xl border px-3 py-3 text-xs shadow-sm',
        toneClass,
      ].join(' ')}
      data-testid="ocr-unified-status-tile"
    >
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {item.label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold">
        {item.value}
      </div>
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
      message: 'OCR needs an active PDF. Load a document, then return here to extract text.',
      className: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
    };
  }

  return {
    title: 'Ready for OCR',
    message: selected && selected.value !== 'all'
      ? `OCR will run on ${selected.value} selected page(s).`
      : 'OCR will use the active PDF. Select pages first if you want a smaller job.',
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
