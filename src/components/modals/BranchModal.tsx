import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { uid } from '../../utils/formatters';
import type { Branch } from '../../types';

interface BranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  branch: Branch;
}

export const BranchModal: React.FC<BranchModalProps> = ({ isOpen, onClose, branch }) => {
  const { saveBranch, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<Branch>(branch);

  useEffect(() => {
    setDraft(branch);
  }, [branch, isOpen]);

  const handleSave = () => {
    if (!draft.code || !draft.code.trim()) {
      toastMsg('Branch code is required', 'error');
      return;
    }
    if (!draft.name || !draft.name.trim()) {
      toastMsg('Branch name is required', 'error');
      return;
    }

    const rec: Branch = {
      id: draft.id || uid(),
      code: draft.code.trim().toUpperCase(),
      name: draft.name.trim(),
      address: (draft.address || '').trim(),
      isMain: !!draft.isMain,
    };

    const res = saveBranch(rec);
    if (res.ok) onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('Branch')}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Code')} *
          </label>
          <input
            type="text"
            required
            value={draft.code}
            onChange={(e) => setDraft((p) => ({ ...p, code: e.target.value }))}
            placeholder="BR4"
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono uppercase bg-white"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Name')} *
          </label>
          <input
            type="text"
            required
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            placeholder="West Distribution Hub"
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Address')}
          </label>
          <input
            type="text"
            value={draft.address}
            onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
            placeholder="Baghdad / Basra / Erbil"
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
