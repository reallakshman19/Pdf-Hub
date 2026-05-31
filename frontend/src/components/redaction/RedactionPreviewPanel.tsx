import { useEffect, useState } from 'react';
import type React from 'react';
import {
  getState as getRedactionState,
  subscribe as subscribeToRedaction,
  deleteRegions,
  exportPlan,
} from '../../core/redaction/store';
import type { RedactionRegion } from '../../core/redaction/types';

/**
 * Panel listing all redaction preview regions. Provides controls to remove
 * individual regions and export a JSON redaction plan. The exported plan
 * contains only page numbers and bounding boxes; the user must manually
 * merge it with the appropriate document key when sending to a server.
 */
export const RedactionPreviewPanel: React.FC = () => {
  const [regions, setRegions] = useState<RedactionRegion[]>(
    getRedactionState().regions
  );

  useEffect(() => {
    return subscribeToRedaction(() => {
      setRegions(getRedactionState().regions);
    });
  }, []);

  const handleDelete = (id: string) => {
    deleteRegions([id]);
  };

  const handleExport = () => {
    const plan = exportPlan();
    const json = JSON.stringify(plan, null, 2);
    window.prompt('Redaction plan JSON', json);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h3>Redaction Preview</h3>
      {regions.length === 0 ? (
        <p>No regions marked for redaction.</p>
      ) : (
        <ul style={{ listStyle: 'none', paddingLeft: 0 }}>
          {regions.map((region) => (
            <li
              key={region.id}
              style={{
                padding: '0.5rem',
                borderBottom: '1px solid #ddd',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                Page {region.pageNumber}:{' '}
                {region.rect.x.toFixed(2)},{' '}
                {region.rect.y.toFixed(2)}{' '}
                {region.rect.width.toFixed(2)}×{region.rect.height.toFixed(2)}
                {region.reason ? ` — ${region.reason}` : ''}
              </span>
              <button
                onClick={() => handleDelete(region.id)}
                style={{ marginLeft: '1rem' }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={handleExport}
        disabled={regions.length === 0}
        style={{ marginTop: '1rem' }}
      >
        Export JSON Plan
      </button>
      <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
        Note: This plan contains only page numbers and rectangles. Final
        redaction must be performed by a trusted server.
      </p>
    </div>
  );
};

export default RedactionPreviewPanel;
