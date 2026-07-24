import { useEffect, useState } from 'react';
import type React from 'react';
import {
  getState as getRedactionState,
  subscribe as subscribeToRedaction,
  deleteRegions,
  exportPlan,
} from '../../core/redaction/store';
import type { RedactionRegion } from '../../core/redaction/types';
import { VISUAL_MASK_WARNING } from '../../core/redaction/capability';

/**
 * Panel listing regions intended for visual masking. The exported plan contains
 * page numbers and bounding boxes only; it is not evidence that PDF content was
 * permanently removed.
 */
export const RedactionPreviewPanel: React.FC = () => {
  const [regions, setRegions] = useState<RedactionRegion[]>(
    getRedactionState().regions,
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
    window.prompt('Visual mask plan JSON', json);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h3>Visual Mask Plan</h3>
      <p role="note" style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#92400e' }}>
        {VISUAL_MASK_WARNING}
      </p>
      {regions.length === 0 ? (
        <p>No regions marked for visual masking.</p>
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
        Export Visual Mask Plan
      </button>
      <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>
        This plan contains only page numbers and rectangles. A separate verified
        secure-redaction pipeline is required to permanently remove content.
      </p>
    </div>
  );
};

export default RedactionPreviewPanel;
