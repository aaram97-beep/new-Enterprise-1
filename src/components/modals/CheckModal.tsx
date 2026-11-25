import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, todayStr, addDays, uid } from '../../utils/formatters';
import { CHECK_STATUSES } from '../../data/constants';
import type { CheckDoc } from '../../types';

interface CheckModalProps {
  isOpen: boolean;
  onClose: () => void;
  check: CheckDoc;
}

export const CheckModal: React.FC<CheckModalProps> = ({ isOpen, onClose, check }) => {
  const { db, branchId, saveCheck, nextNo, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<CheckDoc>(check);

  useEffect(() => {
    setDraft({
      ...check,
      receivedDate: check.receivedDate || todayStr(),
      dueDate: check.dueDate || addDays(todayStr(), 30),
    });
  }, [check, isOpen]);

  const custAcRows = db.customers.map((c) => ({
    id: c.id,
    label: c.name,
    sub: c.phone || '',
    code: c.phone || '',
  }));

  const selectedCustomer = db.customers.find((c) => c.id === draft.customerId);

  const handleSave = () => {
    if (!draft.customerId) {
      toastMsg('Choose a customer', 'error');
      return;
    }
    if (!draft.checkNo) {
      toastMsg('Check number required', 'error');
      return;
    }
    if (!(r2(draft.amount) > 0)) {
      toastMsg('Amount must be positive', 'error');
      return;
    }

    const rec: CheckDoc = {
      id: draft.id || uid(),
      no: draft.no || nextNo(branchId, 'CHK'),
      customerId: draft.customerId,
      checkNo: draft.checkNo.trim(),
      bank: (draft.bank || '').trim(),
      amount: r2(draft.amount),
      status: draft.status || 'received',
      receivedDate: draft.receivedDate || todayStr(),
      dueDate: draft.dueDate || '',
      note: (draft.note || '').trim(),
      payouts: draft.payouts || [],
    };

    saveCheck(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Receive Check')}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Customer')}
          </label>
          <AutoCompleteBox
            rows={custAcRows}
            placeholder={t('Search customer')}
            defaultValue={selectedCustomer ? selectedCustomer.name : ''}
            onPick={(row) => setDraft((p) => ({ ...p, customerId: row.id }))}
          />
          {selectedCustomer && (
            <div className="text-[11px] text-slate-500 mt-1">
              {t('Selected:')} <b>{selectedCustomer.name}</b>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Check No')}
            </label>
            <input
              type="text"
              value={draft.checkNo}
              onChange={(e) => setDraft((p) => ({ ...p, checkNo: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Bank / Disbursing Officer or Entity')}
            </label>
            <input
              type="text"
              value={draft.bank}
              onChange={(e) => setDraft((p) => ({ ...p, bank: e.target.value }))}
              placeholder={t('Bank or Officer / Entity Name')}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Amount')}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={draft.amount || ''}
              onChange={(e) => setDraft((p) => ({ ...p, amount: +e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Status')}
            </label>
            <select
              value={draft.status}
              onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as any }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
            >
              {CHECK_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {t(st)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Received date')}
            </label>
            <input
              type="date"
              value={draft.receivedDate}
              onChange={(e) => setDraft((p) => ({ ...p, receivedDate: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Check expiry date')}
            </label>
            <input
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Note')}
          </label>
          <input
            type="text"
            value={draft.note || ''}
            onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
            placeholder={t('Memo, drawee or deposit notes')}
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
