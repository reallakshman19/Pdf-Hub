import React from 'react';
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { HeaderFooterDialog } from '@/components/dialogs/HeaderFooterDialog';
import { commandBus } from '@/core/commands/bus';
import { materializePdfCommand } from '@/core/commands/types';
import type { HeaderFooterTemplate } from '@/core/header-footer/types';
import type {
  PageGraph,
  PageId,
  PageNode,
} from '@/core/pages/types';
import { useToastStore } from '@/core/toast/store';

interface AutomateHeaderFooterQuickActionProps {
  disabled: boolean;
  documentKey: string | null;
  fileName: string | null;
  pageGraph: PageGraph<PageNode> | null;
  currentPageId: PageId | null;
  selectedPageIds: PageId[];
}

export const AutomateHeaderFooterQuickAction: React.FC<
  AutomateHeaderFooterQuickActionProps
> = ({
  disabled,
  documentKey,
  fileName,
  pageGraph,
  currentPageId,
  selectedPageIds,
}) => {
  const [open, setOpen] = React.useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const applyTemplate = async (
    template: HeaderFooterTemplate,
    binaryResources?: Readonly<Record<string, Uint8Array>>,
  ): Promise<boolean> => {
    if (!documentKey || !pageGraph) return false;

    const result = await commandBus.execute({
      command: materializePdfCommand(
        {
          type: 'APPLY_HEADER_FOOTER_TEMPLATE',
          payload: { template },
        },
        'macro-runner',
        documentKey,
      ),
      ...(binaryResources
        ? {
            resources: {
              binaries: binaryResources,
            },
          }
        : {}),
    });

    if (!result.success) {
      addToast({
        type: 'error',
        title: 'Header & Footer Failed',
        message: result.error?.message ?? result.message,
      });
      return false;
    }

    addToast({
      type: 'success',
      title: 'Header & Footer Applied',
      message: result.message,
    });
    return true;
  };

  return (
    <section
      className="mb-4"
      aria-label="Automate Header & Footer"
      data-testid="automate-header-footer"
    >
      {pageGraph && (
        <HeaderFooterDialog
          isOpen={open}
          pageGraph={pageGraph}
          currentPageId={currentPageId}
          selectedPageIds={selectedPageIds}
          fileName={fileName ?? 'document.pdf'}
          onClose={() => setOpen(false)}
          onApply={applyTemplate}
        />
      )}

      <article className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start gap-2">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              Header & Footer
            </div>
            <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Configure printed numbering, text and logos with the canonical
              template editor. Logical PageLabels are unchanged.
            </p>
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="mt-3 h-7 text-xs"
          onClick={() => setOpen(true)}
          disabled={disabled || !pageGraph || !documentKey}
        >
          Configure printed content
        </Button>
      </article>
    </section>
  );
};
