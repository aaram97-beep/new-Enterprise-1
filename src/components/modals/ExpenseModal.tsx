import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, fmt, todayStr, uid } from '../../utils/formatters';
import { accBalance } from '../../utils/calculations';
import { EXPENSE_CATS } from '../../data/constants';
import type { Expense } from '../../types';

interface ExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ExpenseModal: React.FC<ExpenseModalProps> = ({ isOpen, onClose }) => {
  const { db, branchId, saveExpense, nextNo, toastMsg, t } = useIMS();
  const [accountId, setAccountId] = useState('');
  const [category, setCategory] = useState(EXPENSE_CATS[0]);
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (isOpen) {
      const defaultAcc =
        db.accounts.find((a) => a.type === 'cashbox' && a.branchId === branchId) ||
        db.accounts.find((a) => a.type !== 'cheques') ||
        db.accounts[0];
      setAccountId(defaultAcc ? defaultAcc.id : '');
      setCategory(EXPENSE_CATS[0]);
      setAmount(0);
      setDate(todayStr());
      setNote('');
    }
  }, [isOpen, branchId, db.accounts]);

  const handleSave = () => {
    const amt = r2(amount);
    if (!accountId) {
      toastMsg('Choose an account', 'error');
      return;
    }
    if (amt <= 0) {
      toastMsg('Enter an amount', 'error');
      return;
    }

    const acct = db.accounts.find((a) => a.id === accountId);
    const rec: Expense = {
      id: uid(),
      no: nextNo(acct?.branchId || branchId || 'b1', 'EXP'),
      date: date || todayStr(),
      category: category || 'Other',
      accountId,
      amount: amt,
      note,
    };

    saveExpense(rec);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('New Expense')} maxWidth="max-w-lg">
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Account')}
          </label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
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
            {t('Category')}
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
          >
            {EXPENSE_CATS.map((c) => (
              <option key={c} value={c}>
                {t(c)}
              </option>
            ))}
          </select>
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
