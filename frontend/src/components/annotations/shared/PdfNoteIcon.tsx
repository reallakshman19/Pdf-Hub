import React from 'react';

/**
 * Collapsed rendering of a native PDF /Text annotation: the standard icon named
 * by /Name (ISO 32000-1 12.5.6.4) drawn in the note's /C colour, the way other
 * PDF viewers show a closed comment. Unknown names fall back to Note.
 */
const GLYPHS: Record<string, React.ReactNode> = {
  Comment: (
    <path d="M5 6.5h14a1.5 1.5 0 0 1 1.5 1.5v7a1.5 1.5 0 0 1-1.5 1.5h-7l-4 3v-3H5A1.5 1.5 0 0 1 3.5 15V8A1.5 1.5 0 0 1 5 6.5Z" />
  ),
  Note: (
    <>
      <path d="M6.5 4h8l4 4v12h-12Z" />
      <path d="M9 11h6M9 14h6M9 17h4" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </>
  ),
  Key: (
    <>
      <circle cx="8.5" cy="12" r="4" />
      <path d="M12 11h8v2.2h-1.6v2.3h-2v-2.3H12Z" />
    </>
  ),
  Help: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 16.6v.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none" />
    </>
  ),
  NewParagraph: (
    <>
      <path d="M12 4 18 12H6Z" />
      <path d="M8 14.5v5.5M8 14.5l4 5.5v-5.5M14.5 20v-5.5h2a1.6 1.6 0 0 1 0 3.2h-2" stroke="#fff" strokeWidth="1.3" fill="none" />
    </>
  ),
  Paragraph: (
    <path d="M11 5h7v1.8h-1.6V19h-1.8V6.8h-1.8V19H11v-6.5a3.75 3.75 0 0 1 0-7.5Z" />
  ),
  Insert: (
    <path d="M12 6 19 18h-3.2L12 11.2 8.2 18H5Z" />
  ),
};

export const PDF_NOTE_ICON_NAMES = Object.keys(GLYPHS);

export function resolvePdfNoteIconName(name: string | undefined): string {
  return name && name in GLYPHS ? name : 'Note';
}

export const PdfNoteIcon: React.FC<{
  name: string | undefined;
  color: string;
  size: number;
}> = ({ name, color, size }) => {
  const resolved = resolvePdfNoteIconName(name);
  return (
    <svg
      data-note-icon={resolved}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: 'block', color, overflow: 'visible' }}
    >
      <rect x="0.75" y="0.75" width="22.5" height="22.5" rx="3" fill={color} stroke="rgba(0,0,0,0.35)" strokeWidth="0.75" />
      <g fill="#fff">{GLYPHS[resolved]}</g>
    </svg>
  );
};
