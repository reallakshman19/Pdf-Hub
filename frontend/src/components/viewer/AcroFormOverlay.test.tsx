import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { useAcroFormStore } from '@/core/pdf-forms/store';
import { useSessionStore } from '@/core/session/store';
import { AcroFormOverlay } from './AcroFormOverlay';

async function buildSampleFormBytes(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([500, 700]);
  const form = doc.getForm();
  const nameField = form.createTextField('fullName');
  nameField.setText('Jane Doe');
  nameField.addToPage(page, { x: 40, y: 620, width: 180, height: 24 });

  const agree = form.createCheckBox('acceptTerms');
  agree.addToPage(page, { x: 40, y: 570, width: 18, height: 18 });

  const plan = form.createDropdown('planTier');
  plan.addOptions(['Basic', 'Pro']);
  plan.addToPage(page, { x: 40, y: 520, width: 140, height: 24 });
  return doc.save();
}

describe('AcroFormOverlay', () => {
  beforeEach(() => {
    useAcroFormStore.getState().clearForm();
    useSessionStore.setState({ isDirty: false, isDocumentDirty: false });
  });

  it('renders nothing when no AcroForm fields exist on the page', () => {
    const { container } = render(<AcroFormOverlay pageNumber={1} scale={1} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders hydrated form inputs and tracks dirty edits back to session and store', async () => {
    const bytes = await buildSampleFormBytes();
    await act(async () => {
      await useAcroFormStore.getState().hydrateFromBytes('sha256:form-1', bytes);
    });

    render(<AcroFormOverlay pageNumber={1} scale={1} />);

    const nameInput = screen.getByTestId('acroform-field-fullName') as HTMLInputElement;
    expect(nameInput.value).toBe('Jane Doe');

    fireEvent.change(nameInput, { target: { value: 'John Smith' } });
    fireEvent.click(screen.getByTestId('acroform-field-acceptTerms'));
    fireEvent.change(screen.getByTestId('acroform-field-planTier'), {
      target: { value: 'Pro' },
    });

    const state = useAcroFormStore.getState();
    expect(state.dirtyFieldNames).toEqual(
      expect.arrayContaining(['fullName', 'acceptTerms', 'planTier']),
    );
    expect(state.getChangedFieldValues()).toEqual({
      fullName: 'John Smith',
      acceptTerms: true,
      planTier: 'Pro',
    });
    expect(useSessionStore.getState().isDirty).toBe(true);
  });
});
