import React from 'react';
import type { OcrProfileId } from '@/core/ocr/ocrProfiles';

export interface OcrPanelEngineControlsProps {
  engineId: string;
  profileId: OcrProfileId;
  forceOcr: boolean;
  engines: Array<{ id: string; label: string }>;
  profiles: Array<{ id: OcrProfileId; label: string }>;
  onEngineChange: (engineId: string) => void;
  onProfileChange: (profileId: OcrProfileId) => void;
  onForceOcrChange: (forceOcr: boolean) => void;
}

export const OcrPanelEngineControls: React.FC<OcrPanelEngineControlsProps> = ({
  engineId,
  profileId,
  forceOcr,
  engines,
  profiles,
  onEngineChange,
  onProfileChange,
  onForceOcrChange,
}) => {
  return (
    <div className="grid grid-cols-1 gap-2">
      <label className="text-xs text-slate-600 dark:text-slate-300">
        Engine
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={engineId}
          data-testid="ocr-engine-select"
          onChange={(event) => onEngineChange(event.currentTarget.value || 'mock')}
        >
          {engines.map((engine) => (
            <option key={engine.id} value={engine.id}>
              {engine.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs text-slate-600 dark:text-slate-300">
        Profile
        <select
          className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-900"
          value={profileId}
          onChange={(event) => onProfileChange(event.currentTarget.value as OcrProfileId)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.label}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={forceOcr}
          onChange={(event) => onForceOcrChange(event.currentTarget.checked)}
        />
        Force OCR even if embedded text exists
      </label>
    </div>
  );
};

export default OcrPanelEngineControls;
