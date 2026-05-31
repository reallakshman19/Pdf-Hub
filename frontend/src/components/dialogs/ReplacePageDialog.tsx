import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (donorPage: number) => void;
  maxPages: number;
}

export const ReplacePageDialog: React.FC<Props> = ({ isOpen, onClose, onConfirm, maxPages }) => {
  const [donorPage, setDonorPage] = useState(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(donorPage);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Replace Page">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Donor Page Number</label>
          <input
            type="number"
            min={1}
            max={maxPages}
            value={donorPage}
            onChange={e => setDonorPage(Number(e.target.value))}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          />
          <p className="mt-1 text-xs text-slate-500">Max pages: {maxPages}</p>
        </div>
        <div className="flex justify-end space-x-2 mt-4">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">Replace</Button>
        </div>
      </form>
    </Modal>
  );
};
