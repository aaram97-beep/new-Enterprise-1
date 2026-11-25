import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, fmt, todayStr, uid } from '../../utils/formatters';
import { accBalance } from '../../utils/calculations';
import type { MoneyMove } from '../../types';

interface MoneyMoveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MoneyMoveModal: React.FC<MoneyMoveModalProps> = ({ isOpen, onClose }) => {
  const { db, branchId, saveMove, nextNo, toastMsg, t } = useIMS();
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      setFromAccountId('');
      setToAccountId('');
      setAmount(0);
      setDate(todayStr());
      setNote('');
    }
  }, [isOpen]);

  const handleSave = () => {
    const amt = r2(amount);
    if (!fromAccountId || !toAccountId) {
      toastMsg('Choose both accounts', 'error');
      return;
    }
    if (fromAccountId === toAccountId) {
      toastMsg('Choose two different accounts', 'error');
      return;
    }
    if (amt <= 0) {
      toastMsg('Enter an amount', 'error');
      return;
    }

    const from = db.accounts.find((a) => a.id === fromAccountId);
    const to = db.accounts.find((a) => a.id === toAccountId);
    const branchMove =
      from?.type === 'cashbox' && to?.type === 'cashbox' && from?.branchId !== to?.branchId;

    const rec: MoneyMove = {
      id: uid(),
      no: nextNo(from?.branchId || branchId || 'b1', 'MTR'),
      date: date || todayStr(),
      fromAccountId,
      toAccountId,
      amount: amt,
      note,
      status: branchMove ? 'transit' : 'done',
      acceptedDate: branchMove ? '' : date || todayStr(),
    };

    saveMove(rec);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('Move Money')} maxWidth="max-w-lg">
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('From account')}
          </label>
          <select
            value={fromAccountId}
            onChange={(e) => setFromAccountId(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
          >
            <option value="">{t('choose')}</option>
            {db.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} • {fmt(accBalance(db, a))}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('To account')}
          </label>
          <select
            value={toAccountId}
            onChange={(e) => setToAccountId(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
          >
            <option value="">{t('choose')}</option>
            {db.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} • {fmt(accBalance(db, a))}
              </option>
            ))}
          </select>
        </div>

        <div className="text-[11px] text-slate-400">
          {t('Cashbox to cashbox between two branches is sent in transit and must be accepted by the receiving branch. Deposits and withdrawals are instant.')}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Amount')}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount || ''}
              onChange={(e) => setAmount(+e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Date')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('Note')}
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
