import React from 'react';

import type { PageNode } from '@/core/pages/types';
import type {
  ResolvedHeaderFooterBand,
  ResolvedHeaderFooterContent,
  ResolvedHeaderFooterPage,
} from '@/core/header-footer/resolutionTypes';
import { createHeaderFooterVisualGeometry } from '@/core/header-footer/pdfWriterGeometry';

interface HeaderFooterPreviewProps {
  page: ResolvedHeaderFooterPage;
  pageNode: PageNode;
  imageUrls?: Readonly<Record<string, string>>;
}

export const HeaderFooterPreview: React.FC<
  HeaderFooterPreviewProps
> = ({ page, pageNode, imageUrls = {} }) => {
  const geometry = createHeaderFooterVisualGeometry(
    pageNode.width,
    pageNode.height,
    pageNode.rotation,
  );
  const leftPercent =
    (page.layout.leftMarginPt / geometry.visualWidth) * 100;
  const rightPercent =
    (page.layout.rightMarginPt / geometry.visualWidth) * 100;
  const headerTopPercent =
    (page.layout.headerOffsetFromTopPt / geometry.visualHeight) * 100;
  const footerBottomPercent =
    (page.layout.footerOffsetFromBottomPt / geometry.visualHeight) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-slate-500">
        <span>Physical page {page.physicalPageNumber}</span>
        <span>
          Logical label: {page.logicalPageLabel || '—'}
        </span>
      </div>
      <div
        className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-sm border border-slate-300 bg-white shadow-sm dark:border-slate-600"
        style={{
          aspectRatio: `${geometry.visualWidth} / ${geometry.visualHeight}`,
        }}
        data-testid="header-footer-page-preview"
      >
        <div className="absolute inset-[12%] rounded border border-dashed border-slate-200 bg-slate-50/40 dark:border-slate-700 dark:bg-slate-800/20">
          <div className="flex h-full items-center justify-center px-3 text-center text-[10px] text-slate-300 dark:text-slate-600">
            Document content
          </div>
        </div>

        {page.header && (
          <PreviewBand
            band={page.header}
            position="header"
            leftPercent={leftPercent}
            rightPercent={rightPercent}
            offsetPercent={headerTopPercent}
            imageUrls={imageUrls}
          />
        )}
        {page.footer && (
          <PreviewBand
            band={page.footer}
            position="footer"
            leftPercent={leftPercent}
            rightPercent={rightPercent}
            offsetPercent={footerBottomPercent}
            imageUrls={imageUrls}
          />
        )}
      </div>
    </div>
  );
};

const PreviewBand: React.FC<{
  band: ResolvedHeaderFooterBand;
  position: 'header' | 'footer';
  leftPercent: number;
  rightPercent: number;
  offsetPercent: number;
  imageUrls: Readonly<Record<string, string>>;
}> = ({
  band,
  position,
  leftPercent,
  rightPercent,
  offsetPercent,
  imageUrls,
}) => {
  const positionStyle =
    position === 'header'
      ? { top: `${offsetPercent}%` }
      : { bottom: `${offsetPercent}%` };

  return (
    <div
      className="absolute"
      style={{
        left: `${leftPercent}%`,
        right: `${rightPercent}%`,
        ...positionStyle,
      }}
    >
      {band.separator && position === 'footer' && (
        <Separator band={band} />
      )}
      <div className="grid grid-cols-3 items-start gap-1">
        <Content content={band.left} align="left" imageUrls={imageUrls} />
        <Content content={band.center} align="center" imageUrls={imageUrls} />
        <Content content={band.right} align="right" imageUrls={imageUrls} />
      </div>
      {band.separator && position === 'header' && (
        <Separator band={band} />
      )}
    </div>
  );
};

const Separator: React.FC<{
  band: ResolvedHeaderFooterBand;
}> = ({ band }) => (
  <div
    className="my-1 w-full border-t"
    style={{
      borderColor: band.separator?.color,
      borderTopWidth: Math.max(
        1,
        Math.round(band.separator?.thicknessPt ?? 1),
      ),
      opacity: band.separator?.opacity ?? 1,
    }}
  />
);

const Content: React.FC<{
  content?: ResolvedHeaderFooterContent;
  align: 'left' | 'center' | 'right';
  imageUrls: Readonly<Record<string, string>>;
}> = ({ content, align, imageUrls }) => {
  if (!content) return <span />;

  if (content.kind === 'image') {
    const imageUrl = imageUrls[content.binaryResourceId];
    const justifySelf =
      align === 'left'
        ? 'start'
        : align === 'center'
          ? 'center'
          : 'end';

    return imageUrl ? (
      <img
        src={imageUrl}
        alt={content.altText || 'Header/footer image'}
        className="max-h-8 max-w-full object-contain"
        style={{ justifySelf, opacity: content.opacity }}
      />
    ) : (
      <span
        className="inline-flex min-h-4 items-center rounded border border-dashed border-slate-400 px-1 text-[8px] text-slate-500"
        style={{ justifySelf, opacity: content.opacity }}
      >
        Image
      </span>
    );
  }

  return (
    <span
      className="block truncate"
      title={content.text}
      style={{
        color: content.style.color,
        opacity: content.style.opacity,
        fontFamily: content.style.fontFamily,
        fontWeight: content.style.fontWeight,
        fontStyle: content.style.fontStyle,
        fontSize: `${Math.max(
          7,
          Math.min(14, content.style.fontSizePt),
        )}px`,
        textAlign: align,
      }}
    >
      {content.text || ' '}
    </span>
  );
};
