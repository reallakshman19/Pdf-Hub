import React from 'react';

export interface PageDefinition {
  size: 'a4' | 'letter';
  background?: string;
  blocks: ContentBlock[];
}

export type ContentBlock =
  | { type: 'image-header'; src: string; height?: number; fit?: 'cover' | 'contain' }
  | { type: 'heading'; text: string; level: 1 | 2 | 3; color?: string }
  | { type: 'rich-text'; markdown: string; fontSize?: number; color?: string }
  | { type: 'divider'; color?: string }
  | { type: 'spacer'; height: number }
  | { type: 'columns'; columns: ContentBlock[][] }
  | { type: 'table'; headers: string[]; rows: string[][] };

const PAGE_SIZES = {
  a4: { width: 794, height: 1123 },    // 96 DPI equivalent of 210×297mm
  letter: { width: 816, height: 1056 }, // 96 DPI equivalent of 8.5×11"
};

// Markdown renderer — handles **bold**, *italic*, # headings, - lists
function renderMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, i) => {
    if (line.startsWith('# ')) {
      return <h1 key={i} style={{ fontSize: 28, fontWeight: 700, margin: '16px 0 8px' }}>{line.slice(2)}</h1>;
    }
    if (line.startsWith('## ')) {
      return <h2 key={i} style={{ fontSize: 20, fontWeight: 600, margin: '12px 0 6px' }}>{line.slice(3)}</h2>;
    }
    if (line.startsWith('### ')) {
      return <h3 key={i} style={{ fontSize: 16, fontWeight: 600, margin: '8px 0 4px' }}>{line.slice(4)}</h3>;
    }
    if (line.startsWith('- ')) {
      return <li key={i} style={{ marginLeft: 20 }}>{parseInline(line.slice(2))}</li>;
    }
    if (line.trim() === '') {
      return <br key={i} />;
    }
    return <p key={i} style={{ margin: '4px 0', lineHeight: 1.6 }}>{parseInline(line)}</p>;
  });
}

function parseInline(text: string): React.ReactNode {
  const boldParts = text.split(/\*\*(.+?)\*\*/g);
  return boldParts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

function RenderBlock({ block }: { block: ContentBlock }): React.ReactNode {
  switch (block.type) {
    case 'image-header':
      return (
        <div style={{ width: '100%', height: block.height ?? 200, overflow: 'hidden', marginBottom: 24 }}>
          <img
            src={block.src}
            style={{ width: '100%', height: '100%', objectFit: block.fit ?? 'cover' }}
            crossOrigin="anonymous"
          />
        </div>
      );
    case 'heading': {
      const sizes = { 1: 32, 2: 24, 3: 18 };
      return (
        <div style={{ fontSize: sizes[block.level], fontWeight: 700, color: block.color ?? '#0f172a', margin: '20px 0 10px' }}>
          {block.text}
        </div>
      );
    }
    case 'rich-text':
      return (
        <div style={{ fontSize: block.fontSize ?? 13, color: block.color ?? '#1e293b', lineHeight: 1.7 }}>
          {renderMarkdown(block.markdown)}
        </div>
      );
    case 'divider':
      return <hr style={{ border: 'none', borderTop: `1px solid ${block.color ?? '#e2e8f0'}`, margin: '16px 0' }} />;
    case 'spacer':
      return <div style={{ height: block.height }} />;
    case 'table':
      return (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              {block.headers.map((h, i) => (
                <th key={i} style={{ background: '#f1f5f9', padding: '8px 12px', textAlign: 'left', border: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff' }}>
                {row.map((cell, j) => (
                  <td key={j} style={{ padding: '7px 12px', border: '1px solid #e2e8f0' }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    default:
      return null;
  }
}

export const PageLayout: React.FC<{
  definition: PageDefinition;
  padding?: number;
}> = ({ definition, padding = 56 }) => {
  const size = PAGE_SIZES[definition.size];
  return (
    <div
      style={{
        width: size.width,
        height: size.height,
        background: definition.background ?? '#ffffff',
        padding,
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {definition.blocks.map((block, i) => (
        <RenderBlock key={i} block={block} />
      ))}
    </div>
  );
};
