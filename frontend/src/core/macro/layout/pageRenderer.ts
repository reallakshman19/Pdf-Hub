import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PageDefinition } from './LayoutEngine';
import { PageLayout } from './LayoutEngine';

const PAGE_SIZES = {
  a4: { width: 794, height: 1123 },
  letter: { width: 816, height: 1056 },
};

// Takes a page definition → returns PNG bytes (Uint8Array)
export async function renderPageToImageBytes(
  definition: PageDefinition,
): Promise<Uint8Array> {
  const size = PAGE_SIZES[definition.size];

  // 1. Create an offscreen container
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '-9999px';
  container.style.left = '-9999px';
  container.style.width = `${size.width}px`;
  container.style.height = `${size.height}px`;
  container.style.overflow = 'hidden';
  document.body.appendChild(container);

  // 2. Render the layout into static HTML so no extra React root is created.
  container.innerHTML = renderToStaticMarkup(React.createElement(PageLayout, { definition }));

  await new Promise<void>((resolve) => {
    // Wait two frames for fonts/images to settle
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  // 3. Use html2canvas to capture the DOM as a canvas
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(container, {
    width: size.width,
    height: size.height,
    scale: 2,          // 2x for retina-quality output
    useCORS: true,
    logging: false,
  });

  // 4. Convert canvas → PNG Uint8Array
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png', 1.0);
  });
  const arrayBuffer = await blob.arrayBuffer();

  // 5. Cleanup
  document.body.removeChild(container);

  return new Uint8Array(arrayBuffer);
}
