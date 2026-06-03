import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MobileBottomTabBar } from './MobileBottomTabBar';
import { useEditorStore } from '@/core/editor/store';

describe('MobileBottomTabBar', () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeMode: 'view',
      mobileDrawerOpen: false,
      mobileSheetOpen: false,
    });
  });

  it('renders 5 tab buttons', () => {
    render(<MobileBottomTabBar />);
    const buttons = screen.getAllByRole('tab');
    expect(buttons.length).toBe(5);
    expect(screen.getByText('Pages')).toBeInTheDocument();
    expect(screen.getByText('Annotate')).toBeInTheDocument();
    expect(screen.getByText('Draw')).toBeInTheDocument();
    expect(screen.getByText('View')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  it('toggles mobile drawer when Pages button is clicked', () => {
    render(<MobileBottomTabBar />);
    const pagesButton = screen.getByText('Pages').closest('button')!;
    
    expect(useEditorStore.getState().mobileDrawerOpen).toBe(false);
    
    fireEvent.click(pagesButton);
    expect(useEditorStore.getState().mobileDrawerOpen).toBe(true);
    
    fireEvent.click(pagesButton);
    expect(useEditorStore.getState().mobileDrawerOpen).toBe(false);
  });

  it('toggles mobile sheet when More button is clicked', () => {
    render(<MobileBottomTabBar />);
    const moreButton = screen.getByText('More').closest('button')!;
    
    expect(useEditorStore.getState().mobileSheetOpen).toBe(false);
    
    fireEvent.click(moreButton);
    expect(useEditorStore.getState().mobileSheetOpen).toBe(true);
    
    fireEvent.click(moreButton);
    expect(useEditorStore.getState().mobileSheetOpen).toBe(false);
  });

  it('sets active mode and closes drawer/sheet when other tabs are clicked', () => {
    useEditorStore.setState({
      mobileDrawerOpen: true,
      mobileSheetOpen: true,
      activeMode: 'view',
    });

    render(<MobileBottomTabBar />);
    const annotateButton = screen.getByText('Annotate').closest('button')!;
    
    fireEvent.click(annotateButton);
    expect(useEditorStore.getState().activeMode).toBe('annotate');
    expect(useEditorStore.getState().mobileDrawerOpen).toBe(false);
    expect(useEditorStore.getState().mobileSheetOpen).toBe(false);
  });

  it('enforces touch target minimum class names (>= 44px equivalent min-h/min-w)', () => {
    render(<MobileBottomTabBar />);
    const buttons = screen.getAllByRole('tab');
    
    buttons.forEach((button) => {
      expect(button.className).toContain('min-h-[44px]');
      expect(button.className).toContain('min-w-[44px]');
    });
  });
});
