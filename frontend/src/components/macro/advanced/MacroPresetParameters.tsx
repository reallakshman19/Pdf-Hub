import React from 'react';
import { RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import type { MacroRecipe } from '@/core/macro/types';
import type {
  BlankPlacement,
  BlankSizeMode,
  RecipeOverrides,
  SelectorMode,
} from '@/core/macro/presetOverrides';

export interface MacroPresetParametersProps {
  recipe?: MacroRecipe;
  overrides: RecipeOverrides;
  pageCount: number;
  disabled?: boolean;
  onChange: (patch: Partial<RecipeOverrides>) => void;
  onReset?: () => void;
}

export const MacroPresetParameters: React.FC<MacroPresetParametersProps> = ({
  recipe,
  overrides,
  pageCount,
  disabled = false,
  onChange,
  onReset,
}) => {
  const hasRotate =
    recipe?.steps.some((step) => step.op === 'rotate_pages') ?? false;
  const hasExtractOrSplit =
    recipe?.steps.some(
      (step) => step.op === 'extract_pages' || step.op === 'split_pages',
    ) ?? false;
  const hasHeaderFooter =
    recipe?.steps.some((step) => step.op === 'header_footer_text') ?? false;
  const hasBlankInsert =
    recipe?.steps.some((step) => step.op === 'insert_blank_page') ?? false;

  return (
    <section
      className="rounded-lg border border-slate-200 bg-white p-3 space-y-3 dark:border-slate-800 dark:bg-slate-950"
      data-testid="macro-preset-parameters"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Parameters
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          disabled={disabled || !recipe || !onReset}
        >
          <RotateCcw className="mr-1 h-3.5 w-3.5" />
          Reset Parameters
        </Button>
      </div>

      <fieldset
        disabled={disabled || !recipe}
        className="m-0 space-y-3 border-0 p-0 disabled:opacity-60"
      >
        <div className="space-y-2">
          <label className="text-xs text-slate-500">
            Target pages
          </label>
          <select
            aria-label="Target pages"
            value={overrides.selectorMode}
            onChange={(event) =>
              onChange({
                selectorMode: event.target.value as SelectorMode,
              })
            }
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
          >
            <option value="selected">Selected pages</option>
            <option value="current">Current page</option>
            <option value="all">All pages</option>
            <option value="range">Range</option>
          </select>
        </div>

        {overrides.selectorMode === 'range' ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-slate-500">
              From
              <input
                aria-label="Range From"
                type="number"
                min={1}
                max={Math.max(1, pageCount)}
                value={overrides.rangeFrom}
                onChange={(event) =>
                  onChange({
                    rangeFrom: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </label>
            <label className="text-xs text-slate-500">
              To
              <input
                aria-label="Range To"
                type="number"
                min={1}
                max={Math.max(1, pageCount)}
                value={overrides.rangeTo}
                onChange={(event) =>
                  onChange({
                    rangeTo: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </label>
          </div>
        ) : null}

        {hasRotate ? (
          <div className="space-y-2">
            <label className="text-xs text-slate-500">
              Rotate degrees
            </label>
            <select
              aria-label="Rotate degrees"
              value={overrides.rotateDegrees}
              onChange={(event) =>
                onChange({
                  rotateDegrees: Number(event.target.value) as 90 | 180 | 270,
                })
              }
              className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <option value={90}>90</option>
              <option value={180}>180</option>
              <option value={270}>270</option>
            </select>
          </div>
        ) : null}

        {hasExtractOrSplit ? (
          <label className="block text-xs text-slate-500">
            Output file name
            <input
              aria-label="Output file name"
              type="text"
              value={overrides.outputName}
              onChange={(event) =>
                onChange({
                  outputName: event.target.value,
                })
              }
              className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
            />
          </label>
        ) : null}

        {hasHeaderFooter ? (
          <>
            <label className="block text-xs text-slate-500">
              Header/Footer text
              <input
                aria-label="Header/Footer text"
                type="text"
                value={overrides.headerFooterText}
                onChange={(event) =>
                  onChange({
                    headerFooterText: event.target.value,
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Align
                <select
                  aria-label="Header/Footer align"
                  value={overrides.headerFooterAlign}
                  onChange={(event) =>
                    onChange({
                      headerFooterAlign: event.target.value as
                        | 'left'
                        | 'center'
                        | 'right',
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Font size
                <input
                  aria-label="Header/Footer font size"
                  type="number"
                  min={6}
                  max={72}
                  value={overrides.headerFooterFontSize}
                  onChange={(event) =>
                    onChange({
                      headerFooterFontSize: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Margin X
                <input
                  aria-label="Header/Footer margin X"
                  type="number"
                  min={0}
                  value={overrides.headerFooterMarginX}
                  onChange={(event) =>
                    onChange({
                      headerFooterMarginX: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                />
              </label>
              <label className="text-xs text-slate-500">
                Margin Y
                <input
                  aria-label="Header/Footer margin Y"
                  type="number"
                  min={0}
                  value={overrides.headerFooterMarginY}
                  onChange={(event) =>
                    onChange({
                      headerFooterMarginY: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Color
                <input
                  aria-label="Header/Footer color"
                  type="text"
                  value={overrides.headerFooterColor}
                  onChange={(event) =>
                    onChange({
                      headerFooterColor: event.target.value,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                />
              </label>
              <label className="text-xs text-slate-500">
                Opacity
                <input
                  aria-label="Header/Footer opacity"
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  value={overrides.headerFooterOpacity}
                  onChange={(event) =>
                    onChange({
                      headerFooterOpacity: Number(event.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3 text-xs text-slate-500">
              <label className="inline-flex items-center gap-1">
                <input
                  aria-label="Page token"
                  type="checkbox"
                  checked={overrides.headerFooterPageToken}
                  onChange={(event) =>
                    onChange({
                      headerFooterPageToken: event.target.checked,
                    })
                  }
                />
                Page token
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  aria-label="File token"
                  type="checkbox"
                  checked={overrides.headerFooterFileToken}
                  onChange={(event) =>
                    onChange({
                      headerFooterFileToken: event.target.checked,
                    })
                  }
                />
                File token
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  aria-label="Date token"
                  type="checkbox"
                  checked={overrides.headerFooterDateToken}
                  onChange={(event) =>
                    onChange({
                      headerFooterDateToken: event.target.checked,
                    })
                  }
                />
                Date token
              </label>
            </div>
          </>
        ) : null}

        {hasBlankInsert ? (
          <>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-slate-500">
                Position
                <select
                  aria-label="Blank page position"
                  value={overrides.blankPlacement}
                  onChange={(event) =>
                    onChange({
                      blankPlacement: event.target.value as BlankPlacement,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value="before">Before current</option>
                  <option value="after">After current</option>
                </select>
              </label>
              <label className="text-xs text-slate-500">
                Size
                <select
                  aria-label="Blank page size"
                  value={overrides.blankSize}
                  onChange={(event) =>
                    onChange({
                      blankSize: event.target.value as BlankSizeMode,
                    })
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
                >
                  <option value="match-current">Match current</option>
                  <option value="a4">A4</option>
                  <option value="letter">Letter</option>
                </select>
              </label>
            </div>

            <label className="block text-xs text-slate-500">
              Count
              <input
                aria-label="Blank page count"
                type="number"
                min={1}
                max={20}
                value={overrides.blankCount}
                onChange={(event) =>
                  onChange({
                    blankCount: Number(event.target.value),
                  })
                }
                className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm dark:border-slate-800 dark:bg-slate-900"
              />
            </label>
          </>
        ) : null}
      </fieldset>
    </section>
  );
};
