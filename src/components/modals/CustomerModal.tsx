import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, uid } from '../../utils/formatters';
import type { Customer } from '../../types';

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer;
}

export const CustomerModal: React.FC<CustomerModalProps> = ({
  isOpen,
  onClose,
  customer,
}) => {
  const { saveCustomer, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<Customer>(customer);

  useEffect(() => {
    setDraft(customer);
  }, [customer, isOpen]);

  const handleSave = () => {
    if (!draft.name || !draft.name.trim()) {
      toastMsg('Account name is required', 'error');
      return;
    }

    const rec: Customer = {
      id: draft.id || uid(),
      name: draft.name.trim(),
      phone: (draft.phone || '').trim(),
      address: (draft.address || '').trim(),
      openingBalance: r2(draft.openingBalance),
      isProvider: !!draft.isProvider,
      note: (draft.note || '').trim(),
    };

    saveCustomer(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('Account')}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Name')} *
          </label>
          <input
            type="text"
            required
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Phone')}
            </label>
            <input
              type="text"
              value={draft.phone}
              onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Opening balance')}
            </label>
            <input
              type="number"
              step="0.01"
              value={draft.openingBalance || ''}
              onChange={(e) => setDraft((p) => ({ ...p, openingBalance: +e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Address')}
          </label>
          <input
            type="text"
            value={draft.address}
            onChange={(e) => setDraft((p) => ({ ...p, address: e.target.value }))}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Note')}
          </label>
          <input
            type="text"
            value={draft.note || ''}
            onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
            placeholder={t('Credit terms, tax ID, or customer remarks')}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div className="pt-1">
          <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
            <input
              type="checkbox"
              checked={draft.isProvider}
              onChange={(e) => setDraft((p) => ({ ...p, isProvider: e.target.checked }))}
              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <span>{t('This account is also a provider')}</span>
          </label>
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
