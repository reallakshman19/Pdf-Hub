import React, { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  DEFAULT_SCALE_CALIBRATION,
  STANDARD_CALIBRATION_PRESETS,
  type DimensionUnit,
  type ScaleCalibration,
} from '@/core/annotations/calibration';

export interface ScaleCalibrationDialogProps {
  isOpen: boolean;
  currentPage: number;
  totalDocumentPages: number;
  currentCalibration?: ScaleCalibration;
  onClose: () => void;
  onApply: (calibration: ScaleCalibration, scope: 'page' | 'all') => void;
}

export const ScaleCalibrationDialog: React.FC<ScaleCalibrationDialogProps> = ({
  isOpen,
  currentPage,
  totalDocumentPages,
  currentCalibration = DEFAULT_SCALE_CALIBRATION,
  onClose,
  onApply,
}) => {
  const [selectedPreset, setSelectedPreset] = useState<string>(() => {
    const match = STANDARD_CALIBRATION_PRESETS.find(
      (p) => p.scaleRatio === currentCalibration.scaleRatio && p.unit === currentCalibration.unit,
    );
    return match ? match.label : 'custom';
  });

  const [scaleRatio, setScaleRatio] = useState<number>(currentCalibration.scaleRatio);
  const [unit, setUnit] = useState<DimensionUnit>(currentCalibration.unit);
  const [precision, setPrecision] = useState<number>(currentCalibration.precision);
  const [scope, setScope] = useState<'page' | 'all'>('page');

  // Interactive 2-point calculation sub-panel
  const [showTwoPointCalc, setShowTwoPointCalc] = useState(false);
  const [knownDist, setKnownDist] = useState<string>('2200');
  const [measuredPtDist, setMeasuredPtDist] = useState<string>('62.36');

  const handlePresetChange = (label: string) => {
    setSelectedPreset(label);
    if (label !== 'custom') {
      const preset = STANDARD_CALIBRATION_PRESETS.find((p) => p.label === label);
      if (preset) {
        setScaleRatio(preset.scaleRatio);
        setUnit(preset.unit);
        setPrecision(preset.precision);
      }
    }
  };

  const handleComputeFromPoints = () => {
    const pt = parseFloat(measuredPtDist);
    const real = parseFloat(knownDist);
    if (!Number.isFinite(pt) || pt <= 0 || !Number.isFinite(real) || real <= 0) return;

    // Convert points (1/72 in) to mm on paper
    const sheetMm = (pt / 72) * 25.4;
    let realMm = real;
    if (unit === 'cm') realMm = real * 10;
    else if (unit === 'm') realMm = real * 1000;
    else if (unit === 'in') realMm = real * 25.4;
    else if (unit === 'ft') realMm = real * 304.8;

    const computedRatio = Math.max(1, Math.round(realMm / sheetMm));
    setScaleRatio(computedRatio);
    setSelectedPreset('custom');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onApply(
      {
        scaleRatio: Math.max(1, scaleRatio),
        unit,
        precision: Math.max(0, Math.min(3, precision)),
      },
      scope,
    );
    onClose();
  };

  const scaleDescription = useMemo(() => {
    if (unit === 'ft' || unit === 'in') {
      return `1 inch on sheet = ${(scaleRatio / 12).toFixed(1)} feet in real world (1:${scaleRatio})`;
    }
    return `1 mm on sheet = ${scaleRatio.toLocaleString()} mm in real world (1:${scaleRatio})`;
  }, [scaleRatio, unit]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Drawing Scale Calibration">
      <form onSubmit={handleSubmit} className="space-y-4" data-testid="scale-calibration-dialog">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Calibrate drawing scale for engineering calipers, dimension lines, and area takeoffs.
          Scale parameters synchronize with ISO 32000 Viewport (<code className="text-blue-600 font-mono">/VP</code>) dictionaries.
        </p>

        {/* Preset Selector */}
        <div>
          <label htmlFor="scale-preset-select" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
            Standard Scale Preset
          </label>
          <select
            id="scale-preset-select"
            aria-label="Standard Scale Preset"
            value={selectedPreset}
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STANDARD_CALIBRATION_PRESETS.map((p) => (
              <option key={p.label} value={p.label}>
                {p.label}
              </option>
            ))}
            <option value="custom">Custom Scale...</option>
          </select>
        </div>

        {/* Scale Ratio & Units */}
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label htmlFor="scale-ratio-input" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Scale Ratio (1:X)
            </label>
            <input
              id="scale-ratio-input"
              aria-label="Scale Ratio (1:X)"
              type="number"
              min="1"
              max="100000"
              value={scaleRatio}
              onChange={(e) => {
                setScaleRatio(Math.max(1, Number(e.target.value)));
                setSelectedPreset('custom');
              }}
              className="w-full text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label htmlFor="scale-display-unit" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Display Unit
            </label>
            <select
              id="scale-display-unit"
              aria-label="Display Unit"
              value={unit}
              onChange={(e) => {
                setUnit(e.target.value as DimensionUnit);
                setSelectedPreset('custom');
              }}
              className="w-full text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="mm">Millimeters (mm)</option>
              <option value="cm">Centimeters (cm)</option>
              <option value="m">Meters (m)</option>
              <option value="in">Inches (in)</option>
              <option value="ft">Feet (ft)</option>
            </select>
          </div>

          <div>
            <label htmlFor="scale-precision" className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Precision
            </label>
            <select
              id="scale-precision"
              aria-label="Precision"
              value={precision}
              onChange={(e) => setPrecision(Number(e.target.value))}
              className="w-full text-xs rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={0}>0 (1200 mm)</option>
              <option value={1}>1 (1200.5 mm)</option>
              <option value={2}>2 (1200.50 mm)</option>
            </select>
          </div>
        </div>

        {/* Live Scale Readout */}
        <div className="p-2.5 rounded-md bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-200">
          <span className="font-semibold">Calculated Scale: </span>
          <span>{scaleDescription}</span>
        </div>

        {/* 2-Point Measurement Calibration Expander */}
        <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setShowTwoPointCalc(!showTwoPointCalc)}
            className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
          >
            <span>{showTwoPointCalc ? '▾ Hide' : '▸ Calibrate by known measurement (2 points)'}</span>
          </button>

          {showTwoPointCalc && (
            <div className="mt-2 p-2.5 rounded-md bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-2">
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                Enter a known distance across a measured drawing segment to calculate the exact scale ratio:
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="known-real-dist" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                    Known Real Distance ({unit})
                  </label>
                  <input
                    id="known-real-dist"
                    aria-label={`Known Real Distance (${unit})`}
                    type="number"
                    value={knownDist}
                    onChange={(e) => setKnownDist(e.target.value)}
                    className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1"
                  />
                </div>
                <div>
                  <label htmlFor="measured-pts-len" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-0.5">
                    Measured Points Length (pt)
                  </label>
                  <input
                    id="measured-pts-len"
                    aria-label="Measured Points Length (pt)"
                    type="number"
                    value={measuredPtDist}
                    onChange={(e) => setMeasuredPtDist(e.target.value)}
                    className="w-full text-xs rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={handleComputeFromPoints}
                className="px-2.5 py-1 text-xs font-medium rounded bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Compute & Apply Ratio
              </button>
            </div>
          )}
        </div>

        {/* Scope Selector */}
        <div className="pt-1 border-t border-slate-200 dark:border-slate-800">
          <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Calibration Scope
          </span>
          <div className="flex items-center gap-4 text-xs text-slate-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="scope"
                value="page"
                checked={scope === 'page'}
                onChange={() => setScope('page')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>Current Page only (Page {currentPage})</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input
                type="radio"
                name="scope"
                value="all"
                checked={scope === 'all'}
                onChange={() => setScope('all')}
                className="text-blue-600 focus:ring-blue-500"
              />
              <span>All Pages ({totalDocumentPages} pages)</span>
            </label>
          </div>
        </div>

        {/* Buttons */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary">
            Apply Calibration
          </Button>
        </div>
      </form>
    </Modal>
  );
};
