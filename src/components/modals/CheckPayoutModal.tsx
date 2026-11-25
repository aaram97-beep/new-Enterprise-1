import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, fmt, todayStr } from '../../utils/formatters';
import { checkRemaining } from '../../utils/calculations';
import type { CheckDoc } from '../../types';

interface CheckPayoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  check: CheckDoc | null;
}

export const CheckPayoutModal: React.FC<CheckPayoutModalProps> = ({
  isOpen,
  onClose,
  check,
}) => {
  const { db, branchId, confirmPayout, toastMsg, t } = useIMS();
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(todayStr());
  const [accountId, setAccountId] = useState('');
  const [note, setNote] = useState('');

  const payoutAccounts = db.accounts.filter((a) => a.type !== 'cheques');

  useEffect(() => {
    if (check) {
      setAmount(checkRemaining(check));
      setDate(todayStr());
      setNote('');
      const defAcc =
        db.accounts.find((a) => a.type === 'cashbox' && a.branchId === branchId) ||
        db.accounts.find((a) => a.type === 'cashbox') ||
        payoutAccounts[0];
      if (defAcc) setAccountId(defAcc.id);
    }
  }, [check, isOpen, branchId, db.accounts]);

  if (!check) return null;
  const rem = checkRemaining(check);

  const handleSave = () => {
    const amt = r2(amount);
    if (amt <= 0.0049) {
      toastMsg('Enter a payout amount', 'error');
      return;
    }
    if (amt > rem + 0.000001) {
      toastMsg('Payout exceeds remaining amount', 'error');
      return;
    }

    confirmPayout(check, amt, date, note, accountId);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Check Payout')}
      subtitle={`${check.checkNo} • remaining ${fmt(rem)}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Payout amount')}
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            max={rem}
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

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Payout account')}
          </label>
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
          >
            {payoutAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type === 'bank' ? t('Bank Account') : t('Branch Cashbox')})
              </option>
            ))}
          </select>
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

        <div className="text-[11px] text-slate-400">
          {t('Partial payouts allowed. Remaining = amount   collected payouts.')}
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
            className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shadow-md shadow-emerald-500/20 cursor-pointer"
          >
            {t('Record Payout')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
