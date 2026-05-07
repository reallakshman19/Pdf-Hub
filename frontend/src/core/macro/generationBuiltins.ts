import type { MacroRecipe } from './types';

export const GENERATION_MACROS: Record<string, MacroRecipe> = {
  branded_cover_page: {
    id: 'branded_cover_page',
    name: '✦ Insert Branded Cover Page',
    steps: [
      {
        op: 'add_image_header_page',
        position: { mode: 'start' },
        // user will paste their logo as a data URL in the sidebar UI
        imageSrc: 'BRAND_IMAGE_PLACEHOLDER',
        headerHeight: 220,
        title: 'Technical Design Report',
        subtitle: 'Prepared by DocCraft — {date}',
        bodyMarkdown: `
## Contents
- Executive Summary
- Architecture Overview
- Implementation Details
- Verification Results
        `,
        size: 'a4',
      },
    ],
  },

  professional_report_full: {
    id: 'professional_report_full',
    name: '✦ Generate Full Report (3 pages)',
    steps: [
      // Page 1: Cover
      {
        op: 'add_content_page',
        position: { mode: 'end' },
        size: 'a4',
        background: '#0f172a',
        blocks: [
          { type: 'spacer', height: 180 },
          {
            type: 'heading',
            text: 'SYSTEM ARCHITECTURE REPORT',
            level: 1,
            color: '#f8fafc',
          },
          { type: 'spacer', height: 12 },
          {
            type: 'heading',
            text: 'PDF Hub — Build {date}',
            level: 3,
            color: '#94a3b8',
          },
          { type: 'spacer', height: 40 },
          { type: 'divider', color: '#334155' },
          { type: 'spacer', height: 20 },
          {
            type: 'rich-text',
            markdown: 'DocCraft Automation Engine  •  Confidential',
            color: '#64748b',
            fontSize: 11,
          },
        ],
      },
      // Page 2: Executive Summary
      {
        op: 'add_content_page',
        position: { mode: 'end' },
        size: 'a4',
        blocks: [
          { type: 'heading', text: 'Executive Summary', level: 1 },
          { type: 'divider' },
          {
            type: 'rich-text',
            markdown: `
## Overview

This document describes the **macro automation system** embedded in PDF Hub.

## Key Capabilities

- **Document Generation** — Create multi-page PDFs from scratch
- **Batch Editing** — Apply headers, footers, watermarks across all pages
- **Rich Layouts** — Inject branded cover pages with images, headings, and tables
- **Chained Workflows** — Combine any operations into a single one-click macro

## Architecture

The system uses a **two-phase pipeline**:

1. Render layout to an offscreen HTML DOM (with real CSS typography)
2. Capture via html2canvas and embed as high-fidelity PNG in the PDF
            `,
          },
        ],
      },
      // Page 3: Data Table
      {
        op: 'add_content_page',
        position: { mode: 'end' },
        size: 'a4',
        blocks: [
          { type: 'heading', text: 'Performance Benchmarks', level: 1 },
          { type: 'divider' },
          { type: 'spacer', height: 16 },
          {
            type: 'table',
            headers: ['Feature', 'Previous', 'Current', 'Delta'],
            rows: [
              ['Annotation Render', '120ms', '18ms', '↓ 85%'],
              ['OCR Accuracy', '72%', '91%', '↑ 19%'],
              ['Export Speed', '4.2s', '0.8s', '↓ 81%'],
              ['Memory Usage', '340MB', '85MB', '↓ 75%'],
            ],
          },
          { type: 'spacer', height: 40 },
          {
            type: 'rich-text',
            markdown: '*All benchmarks measured on a 100-page test document at 150% zoom.*',
            fontSize: 10,
            color: '#94a3b8',
          },
        ],
      },
      // Apply footer to all pages
      {
        op: 'header_footer_text',
        selector: { mode: 'all' },
        zone: 'footer',
        text: 'Confidential — PDF Hub  |  Page {page} of {pages}',
        align: 'center',
        marginX: 50,
        marginY: 28,
        fontSize: 9,
        color: '#94a3b8',
        opacity: 0.85,
        pageNumberToken: true,
      },
    ],
  },
};
