import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (preset: string, placement: string) => void;
}

export const InsertBlankPageDialog: React.FC<Props> = ({ isOpen, onClose, onConfirm }) => {
  const [size, setSize] = useState('match');
  const [placement, setPlacement] = useState('after');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(size, placement);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Insert Blank Page">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Size</label>
          <select
            value={size}
            onChange={e => setSize(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          >
            <option value="match">Match current</option>
            <option value="a4">A4</option>
            <option value="letter">Letter</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Placement</label>
          <select
            value={placement}
            onChange={e => setPlacement(e.target.value)}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
          >
            <option value="before">Before current page</option>
            <option value="after">After current page</option>
          </select>
        </div>
        <div className="flex justify-end space-x-2 mt-4">
          <Button variant="ghost" type="button" onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit">Insert</Button>
        </div>
      </form>
    </Modal>
  );
};
