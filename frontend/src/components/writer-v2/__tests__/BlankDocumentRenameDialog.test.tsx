import React from 'react';
import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { BlankDocumentRenameDialog } from '../BlankDocumentRenameDialog';

describe('BlankDocumentRenameDialog', () => {
  it('does not render when closed', () => {
    render(
      <BlankDocumentRenameDialog
        open={false}
        title="Draft"
        onCancel={() => undefined}
        onRename={() => undefined}
      />,
    );

    expect(screen.queryByTestId('blank-document-rename-dialog')).toBeNull();
  });

  it('renders current title', () => {
    render(
      <BlankDocumentRenameDialog
        open
        title="Current Draft"
        onCancel={() => undefined}
        onRename={() => undefined}
      />,
    );

    expect(screen.getByTestId('blank-document-rename-dialog')).toBeTruthy();
    expect(screen.getByTestId('blank-document-rename-input')).toHaveValue('Current Draft');
  });

  it('renames using normalized title', () => {
    const onRename = vi.fn();

    render(
      <BlankDocumentRenameDialog
        open
        title="Old Draft"
        onCancel={() => undefined}
        onRename={onRename}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-document-rename-input'), {
      target: { value: '  New   Draft  ' },
    });
    fireEvent.click(screen.getByTestId('blank-document-rename-apply-button'));

    expect(onRename).toHaveBeenCalledWith('New Draft');
  });

  it('falls back to untitled when empty', () => {
    const onRename = vi.fn();

    render(
      <BlankDocumentRenameDialog
        open
        title="Old Draft"
        onCancel={() => undefined}
        onRename={onRename}
      />,
    );

    fireEvent.change(screen.getByTestId('blank-document-rename-input'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('blank-document-rename-apply-button'));

    expect(onRename).toHaveBeenCalledWith('Untitled document');
  });

  it('cancels with cancel button', () => {
    const onCancel = vi.fn();

    render(
      <BlankDocumentRenameDialog
        open
        title="Draft"
        onCancel={onCancel}
        onRename={() => undefined}
      />,
    );

    fireEvent.click(screen.getByTestId('blank-document-rename-cancel-button'));

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('submits on Enter and cancels on Escape', () => {
    const onRename = vi.fn();
    const onCancel = vi.fn();

    render(
      <BlankDocumentRenameDialog
        open
        title="Draft"
        onCancel={onCancel}
        onRename={onRename}
      />,
    );

    fireEvent.keyDown(screen.getByTestId('blank-document-rename-input'), {
      key: 'Enter',
    });
    fireEvent.keyDown(screen.getByTestId('blank-document-rename-input'), {
      key: 'Escape',
    });

    expect(onRename).toHaveBeenCalledWith('Draft');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
