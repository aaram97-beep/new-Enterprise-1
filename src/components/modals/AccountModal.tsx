import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, uid } from '../../utils/formatters';
import { ACCOUNT_TYPES } from '../../data/constants';
import type { MoneyAccount } from '../../types';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: MoneyAccount;
}

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose, account }) => {
  const { db, saveAccount, canAccess, toastMsg, t } = useIMS();
  const canUseChecks = canAccess('checks');
  const [draft, setDraft] = useState<MoneyAccount>(account);

  useEffect(() => {
    if (!canUseChecks && account.type === 'cheques') {
      setDraft({ ...account, type: 'cashbox' });
    } else {
      setDraft(account);
    }
  }, [account, isOpen, canUseChecks]);

  const handleSave = () => {
    if (!(draft.name || '').trim()) {
      toastMsg('Enter an account name', 'error');
      return;
    }
    if (draft.type !== 'cheques' && !draft.branchId) {
      toastMsg('Choose a branch', 'error');
      return;
    }

    const rec: MoneyAccount = {
      id: draft.id || `acc-${uid()}`,
      name: draft.name.trim(),
      type: draft.type,
      branchId: draft.type === 'cheques' ? null : draft.branchId,
      opening: r2(+draft.opening || 0),
      note: draft.note || '',
    };

    const res = saveAccount(rec);
    if (res.ok) onClose();
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
            {t('Account name')}
          </label>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Type')}
          </label>
          <select
            value={draft.type}
            onChange={(e) => setDraft((p) => ({ ...p, type: e.target.value as any }))}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
          >
            {ACCOUNT_TYPES.filter((tp) => tp.k !== 'cheques' || canUseChecks).map((tp) => (
              <option key={tp.k} value={tp.k}>
                {t(tp.label)}
              </option>
            ))}
          </select>
        </div>

        {draft.type !== 'cheques' && (
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Branch')}
            </label>
            <select
              value={draft.branchId || ''}
              onChange={(e) => setDraft((p) => ({ ...p, branchId: e.target.value || null }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
            >
              <option value="">{t('company-wide')}</option>
              {db.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Opening balance')}
          </label>
          <input
            type="number"
            step="0.01"
            value={draft.opening || ''}
            onChange={(e) => setDraft((p) => ({ ...p, opening: +e.target.value }))}
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
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        {canUseChecks && draft.type === 'cheques' && (
          <div className="text-[11px] text-slate-400">
            {t('The Cheques in Hand account tracks received checks that are not yet deposited or cleared.')}
          </div>
        )}

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
