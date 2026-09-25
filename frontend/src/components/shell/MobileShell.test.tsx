import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MobileShell } from './MobileShell';
import { useEditorStore } from '@/core/editor/store';
import { useCapabilities } from '@/hooks/useCapabilities';
import { useAnnotationStore } from '@/core/annotations/store';
import { useSessionStore } from '@/core/session/store';

vi.mock('@/hooks/useCapabilities', () => ({
  useCapabilities: vi.fn(),
}));

vi.mock('@/hooks/useIsMobile', () => ({
  useIsMobile: vi.fn(() => true),
}));

describe('MobileShell', () => {
  beforeEach(() => {
    vi.mocked(useCapabilities).mockReturnValue({
      mode: 'preview',
      serverAlive: false,
      canUseClientPdfTools: true,
      canUseClientAnnotations: true,
      canUseClientWriter: true,
      canUseClientMacros: true,
      canUseServerOcr: false,
      canUseServerAnnotations: false,
      canUseMacroApi: false,
      canProbeServer: false,
      hasServerOcr: false,
      hasPreviewOcr: false,
      hasMacroConsole: false,
      hasServerAnnotations: false,
      latencyMs: null,
    });

    useEditorStore.setState({
      mobileDrawerOpen: false,
      mobileSheetOpen: false,
      inspectorTab: 'properties',
      existingTextSelection: null,
    });
    useAnnotationStore.setState({
      selectedAnnotationIds: [],
    });
    useSessionStore.setState({
      fileName: null,
    });
  });

  const defaultProps = {
    topnav: <div data-testid="mock-topnav">TopNav</div>,
    toolbar: <div data-testid="mock-toolbar">Toolbar</div>,
    leftRail: <div data-testid="mock-leftrail">LeftRail</div>,
    sidebar: <div data-testid="mock-sidebar">Sidebar Content</div>,
    workspace: <div data-testid="mock-workspace">Workspace Content</div>,
    inspector: <div data-testid="mock-inspector">Inspector Content</div>,
    statusbar: <div data-testid="mock-statusbar">Statusbar</div>,
  };

  it('renders TopNav in MobileShell', () => {
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByTestId('mock-topnav')).toBeInTheDocument();
  });

  it('renders preview mode banner in MobileShell when not in server mode', () => {
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(/preview mode/i)).toBeInTheDocument();
  });

  it('does not render preview mode banner in server mode', () => {
    vi.mocked(useCapabilities).mockReturnValue({
      mode: 'server',
      serverAlive: true,
      canUseClientPdfTools: true,
      canUseClientAnnotations: true,
      canUseClientWriter: true,
      canUseClientMacros: true,
      canUseServerOcr: true,
      canUseServerAnnotations: true,
      canUseMacroApi: true,
      canProbeServer: true,
      hasServerOcr: true,
      hasPreviewOcr: true,
      hasMacroConsole: true,
      hasServerAnnotations: true,
      latencyMs: 10,
    });
    render(<MobileShell {...defaultProps} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders workspace area in MobileShell', () => {
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByTestId('mock-workspace')).toBeInTheDocument();
  });

  it('renders MobileBottomTabBar in MobileShell', () => {
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByTestId('mobile-bottom-bar')).toBeInTheDocument();
  });

  it('renders MobileDrawer if mobileDrawerOpen is true', () => {
    useEditorStore.setState({ mobileDrawerOpen: true });
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByText('Sidebar Content')).toBeInTheDocument();
  });

  it('hides MobileDrawer if mobileDrawerOpen is false', () => {
    render(<MobileShell {...defaultProps} />);
    const dialogs = screen.getAllByRole('dialog', { hidden: true });
    const drawerDialog = dialogs.find(d => d.innerHTML.includes('Sidebar Content'));
    expect(drawerDialog).toBeDefined();
    expect(drawerDialog).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders MobileSheet with Inspector Content if mobileSheetOpen is true and annotation is selected', () => {
    useEditorStore.setState({ mobileSheetOpen: true });
    useAnnotationStore.setState({ selectedAnnotationIds: ['annotation-1'] });
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByText('Inspector Content')).toBeInTheDocument();
  });

  it('renders MobileSheet with Inspector Content for direct existing-PDF text selection', () => {
    useEditorStore.setState({
      mobileSheetOpen: true,
      inspectorTab: 'text',
      existingTextSelection: {
        revisionId: 'doc-1',
        pageId: 'page-1',
        sourceIndex: 0,
      },
    });
    useAnnotationStore.setState({
      selectedAnnotationIds: [],
    });

    render(
      <MobileShell {...defaultProps} />,
    );

    expect(
      screen.getByText('Inspector Content'),
    ).toBeInTheDocument();
  });

  it('renders MobileSheet with More Actions if mobileSheetOpen is true and no annotation is selected', () => {
    useEditorStore.setState({ mobileSheetOpen: true });
    useAnnotationStore.setState({ selectedAnnotationIds: [] });
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByText('More Actions')).toBeInTheDocument();
    expect(screen.getByText('Select Mode')).toBeInTheDocument();
  });

  it('renders CtxBar when a document is loaded', () => {
    useSessionStore.setState({ fileName: 'mock-doc.pdf' });
    render(<MobileShell {...defaultProps} />);
    expect(screen.getByRole('button', { name: /highlight/i })).toBeInTheDocument();
  });
});
