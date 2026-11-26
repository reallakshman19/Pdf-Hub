import { beforeEach, describe, expect, it } from 'vitest';
import { useEditorStore } from './store';
import { resetInteractionState } from './resetInteraction';
import { useAnnotationStore } from '@/core/annotations/store';
import { useCalloutStore } from '@/core/callout/store';
import { useWriterV2Store } from '@/core/writer-v2/writerV2Store';

describe('core/editor/store & resetInteractionState', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTool: 'select',
      activeMode: 'annotate',
      sidebarTab: 'thumbnails',
      inspectorTab: 'properties',
      workspaceViewMode: '2d',
      leftPanelWidth: 20,
      rightPanelWidth: 18,
      macroBuilderOpen: false,
      macroBuilderSource: null,
      mobileDrawerOpen: false,
      mobileSheetOpen: false,
      existingTextSelection: null,
      cadGridMode: 'none',
      cadIsoplane: 'all',
      cadGridSnap: false,
      cadGridSpacing: 20,
      cadToolsOpen: false,
    });
  });

  it('updates editor layout, CAD grid, and isoplane cycling with minimum spacing clamp', () => {
    const store = useEditorStore.getState();
    store.setActiveMode('write');
    store.setSidebarTab('ocr');
    store.setInspectorTab('style');
    store.setWorkspaceViewMode('3d');
    store.setLeftPanelWidth(25);
    store.setRightPanelWidth(22);
    store.setMacroBuilderOpen(true);
    store.setMacroBuilderSource('ribbon');
    store.setMobileDrawerOpen(true);
    store.setMobileSheetOpen(true);
    store.setCadGridMode('ortho');
    store.toggleCadGridSnap();
    store.setCadGridSpacing(1);
    store.toggleCadToolsOpen();
    store.cycleCadIsoplane();

    const next = useEditorStore.getState();
    expect(next.activeMode).toBe('write');
    expect(next.sidebarTab).toBe('ocr');
    expect(next.inspectorTab).toBe('style');
    expect(next.workspaceViewMode).toBe('3d');
    expect(next.leftPanelWidth).toBe(25);
    expect(next.rightPanelWidth).toBe(22);
    expect(next.macroBuilderOpen).toBe(true);
    expect(next.macroBuilderSource).toBe('ribbon');
    expect(next.mobileDrawerOpen).toBe(true);
    expect(next.mobileSheetOpen).toBe(true);
    expect(next.cadGridMode).toBe('ortho');
    expect(next.cadGridSnap).toBe(true);
    expect(next.cadGridSpacing).toBe(5);
    expect(next.cadToolsOpen).toBe(true);
    expect(next.cadIsoplane).toBe('top');

    next.setCadIsoplane('left');
    useEditorStore.getState().cycleCadIsoplane();
    expect(useEditorStore.getState().cadIsoplane).toBe('all');
    useEditorStore.getState().setCadGridSnap(false);
    useEditorStore.getState().setCadToolsOpen(false);
    expect(useEditorStore.getState().cadGridSnap).toBe(false);
    expect(useEditorStore.getState().cadToolsOpen).toBe(false);
  });

  it('resetInteractionState clears active tools and selections across all stores', () => {
    useEditorStore.getState().setActiveTool('highlight');
    useAnnotationStore.setState({ selectedAnnotationIds: ['a1'], activeAnnotationId: 'a1' });
    useCalloutStore.setState({ activeTool: 'ocr-region', selectedIds: ['c1'], activeId: 'c1' });
    useWriterV2Store.setState({ activeWriterTool: 'richTextBox', selectedIds: ['w1'], activeId: 'w1' });

    resetInteractionState();

    expect(useEditorStore.getState().activeTool).toBe('select');
    expect(useAnnotationStore.getState().selectedAnnotationIds).toEqual([]);
    expect(useAnnotationStore.getState().activeAnnotationId).toBeNull();
    expect(useCalloutStore.getState().activeTool).toBe('select');
    expect(useCalloutStore.getState().selectedIds).toEqual([]);
    expect(useWriterV2Store.getState().activeWriterTool).toBe('select');
    expect(useWriterV2Store.getState().selectedIds).toEqual([]);
  });
});
