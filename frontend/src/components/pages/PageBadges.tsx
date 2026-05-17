/*
 * Page badges component.
 *
 * Displays small badges for rotation, OCR status and annotation count on
 * a page thumbnail.  Each badge is optional and only shown when the
 * corresponding value is meaningful.
 */

import type React from 'react';
import type { PageDescriptor } from '../../core/pages/types';

export interface PageBadgesProps {
  page: PageDescriptor;
}

export default function PageBadges({ page }: PageBadgesProps): React.JSX.Element {
  const badges: React.ReactNode[] = [];

  if (page.rotation) {
    badges.push(
      <span key="rotation" className="doccraft-page-badge rotation">
        {page.rotation}°
      </span>
    );
  }

  if (page.ocrStatus && page.ocrStatus !== 'none') {
    badges.push(
      <span key="ocr" className={`doccraft-page-badge ocr ${page.ocrStatus}`}>
        {page.ocrStatus}
      </span>
    );
  }

  if (page.annotationCount > 0) {
    badges.push(
      <span key="annots" className="doccraft-page-badge annotations">
        {page.annotationCount}
      </span>
    );
  }

  return <>{badges}</>;
}