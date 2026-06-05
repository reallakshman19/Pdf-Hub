import React from 'react';
import { WriterLayersPanel } from './WriterLayersPanel';
import { WriterQuickTemplatesPanel } from './WriterQuickTemplatesPanel';
import { WriterObjectSearchPanel } from './WriterObjectSearchPanel';
import { consolidateCurrentPageLegacyWriterObjects } from '@/core/writer-v2/writerLegacyObjectConsolidation';
import { useSessionStore } from '@/core/session/store';

type WriterToolsTab = 'objects' | 'templates' | 'search';

const STORAGE_KEY = 'writer-v2-tools-hub';

const loadInitialState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {
        collapsed: false,
        tab: 'objects' as WriterToolsTab,
        position: null as { x: number; y: number } | null,
      };
    }

    const parsed = JSON.parse(raw) as {
      collapsed?: boolean;
      tab?: WriterToolsTab;
      position?: { x: number; y: number } | null;
    };

    return {
      collapsed: parsed.collapsed ?? false,
      tab: parsed.tab ?? 'objects',
      position: parsed.position ?? null,
    };
  } catch {
    return {
      collapsed: false,
      tab: 'objects' as WriterToolsTab,
      position: null,
    };
  }
};

export const WriterToolsHub: React.FC = () => {
  const beginExportOperation = useSessionStore((state) => state.beginExportOperation);
  const completeSaveOperation = useSessionStore((state) => state.completeSaveOperation);
  const failSaveOperation = useSessionStore((state) => state.failSaveOperation);

  const [initialState] = React.useState(loadInitialState);
  const [collapsed, setCollapsed] = React.useState(initialState.collapsed);
  const [tab, setTab] = React.useState<WriterToolsTab>(initialState.tab);
  const [position, setPosition] = React.useState<{ x: number; y: number } | null>(initialState.position);
  const [isDragging, setIsDragging] = React.useState(false);
  const dragStartRef = React.useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);
  const dragDistanceRef = React.useRef(0);
  const asideRef = React.useRef<HTMLElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  const consolidateLegacyObjects = async () => {
    try {
      beginExportOperation('Consolidating legacy Writer objects...');
      const result = await consolidateCurrentPageLegacyWriterObjects();

      if (result.changed) {
        completeSaveOperation(result.message);
      } else {
        failSaveOperation(result.message);
      }
    } catch (error) {
      failSaveOperation(error instanceof Error ? error.message : String(error));
    }
  };

  React.useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        collapsed,
        tab,
        position,
      }),
    );
  }, [collapsed, tab, position]);

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      e.preventDefault();
      const { x, y, startX, startY } = dragStartRef.current;
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      dragDistanceRef.current = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
      setPosition({ x: x + deltaX, y: y + deltaY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      dragStartRef.current = null;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (collapsed) {
    return (
      <button
        ref={buttonRef}
        type="button"
        data-writer-tools-hub-collapsed="true"
        aria-label="Expand Writer tools"
        onClick={(e) => {
          if (dragDistanceRef.current > 5) {
            e.preventDefault();
            e.stopPropagation();
            return;
          }
          setCollapsed(false);
        }}
        onMouseDown={(e) => {
          if (!buttonRef.current) return;
          dragDistanceRef.current = 0;
          const rect = buttonRef.current.getBoundingClientRect();
          setIsDragging(true);
          dragStartRef.current = {
            x: position?.x ?? rect.left,
            y: position?.y ?? rect.top,
            startX: e.clientX,
            startY: e.clientY,
          };
        }}
        style={{
          position: 'fixed',
          right: position ? undefined : 18,
          left: position ? position.x : undefined,
          top: position ? position.y : 96,
          zIndex: 230,
          height: 34,
          padding: '0 12px',
          borderRadius: 999,
          border: '1px solid #cbd5e1',
          background: '#ffffff',
          color: '#0f172a',
          fontSize: 12,
          fontWeight: 800,
          boxShadow: '0 8px 24px rgba(15, 23, 42, 0.18)',
          cursor: isDragging ? 'grabbing' : 'pointer',
          userSelect: 'none',
        }}
      >
        Writer Tools
      </button>
    );
  }

  return (
    <aside
      ref={asideRef}
      data-writer-tools-hub="true"
      aria-label="Writer tools"
      style={{
        position: 'fixed',
        right: position ? undefined : 18,
        left: position ? position.x : undefined,
        top: position ? position.y : 92,
        zIndex: 230,
        width: 340,
        maxHeight: 'calc(100vh - 120px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: 12,
        boxShadow: '0 16px 44px rgba(15, 23, 42, 0.22)',
        overflow: 'hidden',
      }}
    >
      <header
        onMouseDown={(e) => {
          if ((e.target as HTMLElement).tagName.toLowerCase() === 'button') return;
          if (!asideRef.current) return;
          dragDistanceRef.current = 0;
          const rect = asideRef.current.getBoundingClientRect();
          setIsDragging(true);
          dragStartRef.current = {
            x: position?.x ?? rect.left,
            y: position?.y ?? rect.top,
            startX: e.clientX,
            startY: e.clientY,
          };
        }}
        style={{
          height: 40,
          padding: '0 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
      >
        <strong
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            color: '#0f172a',
          }}
        >
          Writer Tools
        </strong>

        <button
          type="button"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse Writer tools"
          title="Collapse"
          style={headerButtonStyle}
        >
          −
        </button>
      </header>

      <nav
        aria-label="Writer tool tabs"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 4,
          padding: 8,
          borderBottom: '1px solid #e2e8f0',
          background: '#ffffff',
        }}
      >
        <TabButton active={tab === 'objects'} onClick={() => setTab('objects')}>
          Objects
        </TabButton>
        <TabButton active={tab === 'templates'} onClick={() => setTab('templates')}>
          Templates
        </TabButton>
        <TabButton active={tab === 'search'} onClick={() => setTab('search')}>
          Search
        </TabButton>
      </nav>

      <div
        style={{
          padding: '8px 10px',
          borderBottom: '1px solid #e2e8f0',
          background: '#f8fafc',
        }}
      >
        <button
          type="button"
          onClick={() => {
            void consolidateLegacyObjects();
          }}
          style={{
            width: '100%',
            height: 28,
            borderRadius: 7,
            border: '1px solid #93c5fd',
            background: '#eff6ff',
            color: '#1d4ed8',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          Convert page objects to Rich Box
        </button>
      </div>

      <section
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          background: '#ffffff',
        }}
      >
        {tab === 'objects' ? <WriterLayersPanel embedded /> : null}
        {tab === 'templates' ? <WriterQuickTemplatesPanel embedded /> : null}
        {tab === 'search' ? <WriterObjectSearchPanel embedded /> : null}
      </section>
    </aside>
  );
};

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        height: 28,
        borderRadius: 7,
        border: active ? '1px solid #2563eb' : '1px solid #cbd5e1',
        background: active ? '#eff6ff' : '#ffffff',
        color: active ? '#1d4ed8' : '#334155',
        fontSize: 11,
        fontWeight: 800,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

const headerButtonStyle: React.CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 7,
  border: '1px solid #cbd5e1',
  background: '#ffffff',
  color: '#334155',
  cursor: 'pointer',
  fontSize: 16,
  lineHeight: 1,
};
