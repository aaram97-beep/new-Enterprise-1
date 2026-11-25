import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, fmt, fmtDate, todayStr, addDays, uid, parseDiscountInput } from '../../utils/formatters';
import {
  invBalance,
  intakeBalance,
  custBalance,
  accBalance,
  openingBalanceRemaining,
} from '../../utils/calculations';
import type { Payment, PaymentAllocation, CheckDoc } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCustomer?: string | null;
  initialDirection?: 'in' | 'out';
  initialAmount?: number;
  initialNote?: string;
  lockedCustomer?: boolean;
}

interface PaymentAllocationLine {
  id: string;
  docKey: string; // '' | 'opening' | invoiceId | intakeId
  amount: number | '';
}

export const PaymentModal: React.FC<PaymentModalProps> = ({
  isOpen,
  onClose,
  initialCustomer = null,
  initialDirection = 'in',
  initialAmount = 0,
  initialNote = '',
  lockedCustomer = false,
}) => {
  const { db, branchId, confirmPayment, saveCheck, canAccess, nextNo, toastMsg, t } = useIMS();
  const canUseChecks = canAccess('checks');
  const [dir, setDir] = useState<'in' | 'out'>(initialDirection);
  const [customerId, setCustomerId] = useState<string | null>(initialCustomer);
  const [lines, setLines] = useState<PaymentAllocationLine[]>([
    { id: uid(), docKey: '', amount: '' },
  ]);
  const [disc, setDisc] = useState<number>(0);
  const [date, setDate] = useState<string>(todayStr());
  const [method, setMethod] = useState<string>('cash');
  const [accountId, setAccountId] = useState<string>('');
  const [note, setNote] = useState<string>(initialNote);

  // Check / Gov Officer fields
  const [checkNo, setCheckNo] = useState<string>('');
  const [checkDrawerType, setCheckDrawerType] = useState<'bank' | 'officer'>('bank');
  const [bankOrOfficer, setBankOrOfficer] = useState<string>('');
  const [checkDueDate, setCheckDueDate] = useState<string>(addDays(todayStr(), 30));

  const cashAccounts = db.accounts.filter((a) => a.type === 'cashbox');
  const bankAccounts = db.accounts.filter((a) => a.type === 'bank');
  const chequesAccount = db.accounts.find((a) => a.type === 'cheques');

  useEffect(() => {
    if (isOpen) {
      setDir(initialDirection);
      setCustomerId(initialCustomer);
      setDisc(0);
      setDate(todayStr());
      setMethod('cash');
      setNote(initialNote);

      setCheckNo('');
      setCheckDrawerType('bank');
      setBankOrOfficer('');
      setCheckDueDate(addDays(todayStr(), 30));

      const defaultAcc =
        db.accounts.find((a) => a.type === 'cashbox' && a.branchId === branchId) ||
        db.accounts.find((a) => a.type === 'cashbox') ||
        db.accounts[0];
      if (defaultAcc) setAccountId(defaultAcc.id);

      // Pre-select document if opened directly for an invoice / intake from initialNote
      let preselectedDocKey = '';
      if (initialCustomer && initialNote) {
        const match = initialNote.match(/For\s+(INV-[^\s]+|INT-[^\s]+|ARR-[^\s]+)/i);
        if (match) {
          const docNo = match[1].toUpperCase();
          const found = (initialDirection === 'in' ? db.invoices : db.intakes).find(
            (d) => (d.no || '').toUpperCase() === docNo
          );
          if (found) {
            preselectedDocKey = found.id;
          }
        }
      }

      setLines([
        {
          id: uid(),
          docKey: preselectedDocKey,
          amount: initialAmount > 0 ? initialAmount : '',
        },
      ]);
    }
  }, [
    initialCustomer,
    initialDirection,
    initialAmount,
    initialNote,
    branchId,
    db.accounts,
    db.invoices,
    db.intakes,
    isOpen,
  ]);

  const custAcRows = db.customers.map((c) => ({
    id: c.id,
    label: c.name,
    sub: `${c.phone || ''}${c.isProvider ? '   provider' : ''}`.trim(),
    code: c.phone || '',
  }));

  const selectedCustomer = db.customers.find((c) => c.id === customerId);

  // Available open documents and opening balance for the selected customer
  const availableDocs = () => {
    if (!customerId) return [];
    const docs: {
      id: string;
      no: string;
      date?: string;
      balance: number;
      type: 'invoice' | 'intake' | 'opening';
      label: string;
    }[] = [];

    // 1. Opening balance debt (if any remains)
    const openRem = openingBalanceRemaining(db, selectedCustomer);
    if (openRem > 0.005) {
      docs.push({
        id: 'opening',
        no: t('Opening Balance'),
        balance: openRem,
        type: 'opening',
        label: `${t('Opening Balance')} • ${t('Balance Due')}: ${fmt(openRem)}`,
      });
    }

    // 2. Open invoices or buying receipts
    if (dir === 'in') {
      db.invoices.forEach((s) => {
        if (s.customerId === customerId) {
          const b = invBalance(db, s);
          if (b > 0.005) {
            docs.push({
              id: s.id,
              no: s.no,
              date: s.date,
              balance: b,
              type: 'invoice',
              label: `${s.no} • ${fmtDate(s.date)} • ${t('Balance Due')}: ${fmt(b)}`,
            });
          }
        }
      });
    } else {
      db.intakes.forEach((p) => {
        if (p.providerId === customerId) {
          const b = intakeBalance(db, p);
          if (b > 0.005) {
            docs.push({
              id: p.id,
              no: p.no,
              date: p.date,
              balance: b,
              type: 'intake',
              label: `${p.no} • ${fmtDate(p.date)} • ${t('Balance Due')}: ${fmt(b)}`,
            });
          }
        }
      });
    }

    return docs.sort((a, b) => {
      if (a.id === 'opening') return -1;
      if (b.id === 'opening') return 1;
      return (a.date || '').localeCompare(b.date || '');
    });
  };

  const availableDocsList = availableDocs();

  const handleDirChange = (newDir: 'in' | 'out') => {
    setDir(newDir);
    setLines([{ id: uid(), docKey: '', amount: '' }]);
  };

  const handlePickCustomer = (newCustId: string) => {
    setCustomerId(newCustId);
    setLines([{ id: uid(), docKey: '', amount: '' }]);
  };

  const handleLineDocChange = (lineId: string, newDocKey: string) => {
    // Note: Do NOT auto-fill amount, preserve user's entered amount
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, docKey: newDocKey } : l))
    );
  };

  const handleLineAmountChange = (lineId: string, val: string) => {
    const parsed = val === '' ? '' : Math.max(0, +val);
    setLines((prev) =>
      prev.map((l) => (l.id === lineId ? { ...l, amount: parsed } : l))
    );
  };

  const handleAddLine = () => {
    setLines((prev) => [...prev, { id: uid(), docKey: '', amount: '' }]);
  };

  const handleRemoveLine = (lineId: string) => {
    setLines((prev) => {
      const next = prev.filter((l) => l.id !== lineId);
      return next.length > 0 ? next : [{ id: uid(), docKey: '', amount: '' }];
    });
  };

  const grossAllocated = r2(
    lines.reduce((sum, l) => sum + (+l.amount || 0), 0)
  );
  const dsc = r2(disc);
  const netPayment = r2(Math.max(0, grossAllocated - dsc));

  const handleMethodChange = (newMethod: string) => {
    setMethod(newMethod);
    if (newMethod === 'cash') {
      const defAcc =
        cashAccounts.find((a) => a.branchId === branchId) ||
        cashAccounts[0];
      setAccountId(defAcc ? defAcc.id : '');
    } else if (newMethod === 'bank') {
      setAccountId(bankAccounts[0] ? bankAccounts[0].id : '');
    } else if (newMethod === 'check') {
      setAccountId(chequesAccount ? chequesAccount.id : '');
    }
  };

  const handleSave = () => {
    if (!customerId) {
      toastMsg(t('No account selected'), 'error');
      return;
    }

    const validLines = lines.filter((l) => +l.amount > 0.005);

    if (validLines.length === 0 && dsc <= 0.005) {
      toastMsg(t('Enter an amount to pay'), 'error');
      return;
    }

    if (grossAllocated > 0 && dsc > grossAllocated + 0.005) {
      toastMsg(t('Settlement discount cannot exceed payment amount'), 'error');
      return;
    }

    // Check specific validation
    if (method === 'check') {
      if (!canUseChecks) {
        toastMsg(t('Permission denied'), 'error');
        return;
      }
      if (!checkNo.trim()) {
        toastMsg(t('Please enter check number'), 'error');
        return;
      }
    } else if (method === 'bank') {
      if (!accountId) {
        toastMsg(t('Please select a valid money account'), 'error');
        return;
      }
    }

    // Validate that entered amounts do not exceed due balances if attached to a specific doc
    for (const l of validLines) {
      if (l.docKey && l.docKey !== 'unallocated') {
        const doc = availableDocsList.find((d) => d.id === l.docKey);
        if (doc && +l.amount > doc.balance + 0.005) {
          toastMsg(
            `${t('Amount exceeds invoice balance')} ${doc.no} (${fmt(doc.balance)} ${t('Balance Due')})`,
            'error'
          );
          return;
        }
      }
    }

    const allocs: PaymentAllocation[] = [];
    validLines.forEach((l) => {
      if (l.docKey && l.docKey !== 'unallocated') {
        if (l.docKey === 'opening') {
          allocs.push({
            type: 'opening',
            docId: 'opening',
            amount: r2(+l.amount),
          });
        } else {
          allocs.push({
            type: dir === 'in' ? 'invoice' : 'intake',
            docId: l.docKey,
            amount: r2(+l.amount),
          });
        }
      }
    });

    const finalAccountId =
      method === 'check'
        ? (chequesAccount ? chequesAccount.id : null)
        : (accountId || null);

    const paymentNote =
      method === 'check' && checkNo.trim()
        ? `${note ? note + ' • ' : ''}${t('Check No')}: ${checkNo.trim()}`
        : note;

    const rec: Payment = {
      id: uid(),
      no: nextNo(branchId, 'PAY'),
      date: date || todayStr(),
      customerId,
      amount: netPayment,
      disc: dsc,
      method,
      note: paymentNote,
      dir,
      allocs,
      branchId,
      accountId: finalAccountId,
    };

    confirmPayment(rec);

    // If method is check and this is Payment in, automatically create the check in Checks
    if (canUseChecks && method === 'check' && dir === 'in' && checkNo.trim()) {
      const bankLabel =
        checkDrawerType === 'officer'
          ? (bankOrOfficer.trim() ? `${t('Gov Officer / Disbursing Entity')}: ${bankOrOfficer.trim()}` : t('Gov Officer / Disbursing Entity'))
          : (bankOrOfficer.trim() || t('Commercial Bank'));

      const checkRec: CheckDoc = {
        id: uid(),
        no: nextNo(branchId, 'CHK'),
        customerId,
        checkNo: checkNo.trim(),
        bank: bankLabel,
        amount: netPayment,
        status: 'received',
        receivedDate: date || todayStr(),
        dueDate: checkDueDate || addDays(todayStr(), 30),
        payouts: [],
      };
      saveCheck(checkRec);
      toastMsg(t('Payment and Check recorded in Checks'));
    }

    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={dir === 'out' ? t('Payment out') : t('Payment in')}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        {/* Direction switch */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleDirChange('in')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              dir === 'in'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t('Receiving money')}
          </button>
          <button
            type="button"
            onClick={() => handleDirChange('out')}
            className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              dir === 'out'
                ? 'bg-amber-600 text-white border-amber-600 shadow-md shadow-amber-600/20'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t('Paying money')}
          </button>
        </div>

        {/* Customer / Provider selection */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {dir === 'out' ? t('Provider') : t('Customer')}
          </label>
          {lockedCustomer && selectedCustomer ? (
            <div className="border border-slate-300 rounded-xl px-3 py-2 text-sm bg-slate-100 font-semibold text-slate-800">
              {selectedCustomer.name}
            </div>
          ) : (
            <AutoCompleteBox
              rows={custAcRows}
              placeholder={dir === 'out' ? t('Search provider') : t('Search customer')}
              defaultValue={selectedCustomer ? selectedCustomer.name : ''}
              onPick={(row) => handlePickCustomer(row.id)}
            />
          )}
        </div>

        {selectedCustomer && (
          <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex justify-between items-center">
            <span>
              {selectedCustomer.name} • {t('current balance')}
            </span>
            <b className="font-mono text-slate-900">{fmt(custBalance(db, selectedCustomer))}</b>
          </div>
        )}

        {/* Apply Payment To (Dynamic Lines with Dropdown + Amount) */}
        <div className="space-y-2 pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-700 uppercase">
              {t('Apply Payment To')}
            </label>
            <span className="text-[11px] text-slate-400">
              {dir === 'in' ? t('Invoices / Opening Balance') : t('Receipts / Opening Balance')}
            </span>
          </div>

          <div className="space-y-2">
            {lines.map((line) => {
              // Exclude documents selected in other lines to prevent duplicate selection
              const otherSelectedDocKeys = new Set(
                lines
                  .filter((l) => l.id !== line.id && l.docKey && l.docKey !== 'unallocated')
                  .map((l) => l.docKey)
              );

              return (
                <div
                  key={line.id}
                  className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200/90 rounded-xl"
                >
                  {/* Document / Opening Balance Dropdown */}
                  <div className="flex-1 min-w-0">
                    <select
                      value={line.docKey}
                      onChange={(e) => handleLineDocChange(line.id, e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white cursor-pointer truncate"
                    >
                      <option value="">{t('General / On-Account Payment')}</option>
                      {availableDocsList
                        .filter((d) => !otherSelectedDocKeys.has(d.id))
                        .map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Amount Input (User types manually, NO auto-fill!) */}
                  <div className="w-36 sm:w-44 shrink-0">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder={t('Amount')}
                      value={line.amount === '' ? '' : line.amount}
                      onChange={(e) => handleLineAmountChange(line.id, e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-semibold text-center bg-white tabular-nums"
                    />
                  </div>

                  {/* Remove Line Button */}
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveLine(line.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                      title={t('Remove line')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={handleAddLine}
              className="text-blue-600 hover:text-blue-800 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('Add line')}
            </button>
          </div>
        </div>

        {/* Settlement Discount */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                {t('Settlement discount')}
              </label>
              <span className="text-[11px] text-slate-400">
                {dir === 'in' ? t('Settlement discounts given') : t('Discount')}
              </span>
            </div>
            <div className="w-24 shrink-0">
              <input
                type="number"
                step="0.01"
                min="0"
                max={9999999}
                placeholder="0.00"
                value={disc || ''}
                onChange={(e) => {
                  const { display, numeric } = parseDiscountInput(e.target.value, 7);
                  if (e.target.value !== display) e.target.value = display;
                  setDisc(numeric);
                }}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-center bg-white tabular-nums"
              />
            </div>
          </div>
        </div>

        {/* Total Payment Amount Summary */}
        <div className="p-3 bg-slate-100 rounded-xl border border-slate-200 space-y-1.5">
          {dsc > 0 && (
            <>
              <div className="flex justify-between items-center text-xs text-slate-600">
                <span>{t('Subtotal')}</span>
                <span className="font-mono font-medium">{fmt(grossAllocated)}</span>
              </div>
              <div className="flex justify-between items-center text-xs text-rose-600">
                <span>{t('Settlement discount')}</span>
                <span className="font-mono font-medium">- {fmt(dsc)}</span>
              </div>
              <div className="border-t border-slate-300 my-1" />
            </>
          )}
          <div className="flex justify-between items-center">
            <span className="text-xs font-bold text-slate-800 uppercase">
              {t('Total Payment')}
            </span>
            <span className="text-base font-extrabold text-slate-900 font-mono">
              {fmt(netPayment)}
            </span>
          </div>
        </div>

        {/* Date & Method */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
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
              {t('Method')}
            </label>
            <select
              value={method}
              onChange={(e) => handleMethodChange(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
            >
              <option value="cash">{t('Branch Cashbox')}</option>
              <option value="bank">{t('Bank Account')}</option>
              {canUseChecks && <option value="check">{t('Check')}</option>}
            </select>
          </div>
        </div>

        {/* Method-Specific Account or Check / Officer Fields */}
        {method === 'cash' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Branch Cashbox')}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white cursor-pointer"
            >
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} • {fmt(accBalance(db, a))}
                </option>
              ))}
            </select>
            <div className="text-[10px] text-slate-400 mt-0.5">
              {t('Where the money goes / comes from.')}
            </div>
          </div>
        )}

        {method === 'bank' && (
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Bank Account')}
            </label>
            {bankAccounts.length > 0 ? (
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white cursor-pointer"
              >
                {bankAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} • {fmt(accBalance(db, a))}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
                {t('No bank accounts recorded yet')}. {t('Please create a bank account in Banks & Cash section first')}.
              </div>
            )}
            <div className="text-[10px] text-slate-400 mt-0.5">
              {t('Where the money goes / comes from.')}
            </div>
          </div>
        )}

        {canUseChecks && method === 'check' && (
          <div className="space-y-3 p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-blue-900 uppercase">
                {t('Checks')} • {t('Cheques in Hand')}
              </span>
              <span className="text-[11px] text-blue-700">
                {dir === 'in' ? t('Payment and Check recorded in Checks') : t('Payout')}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  {t('Check / Order No')} *
                </label>
                <input
                  type="text"
                  value={checkNo}
                  onChange={(e) => setCheckNo(e.target.value)}
                  placeholder="e.g. CHK-10291"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-mono bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  {t('Issuer Type')}
                </label>
                <select
                  value={checkDrawerType}
                  onChange={(e) => setCheckDrawerType(e.target.value as 'bank' | 'officer')}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white cursor-pointer"
                >
                  <option value="bank">{t('Commercial Bank')}</option>
                  <option value="officer">{t('Gov Officer / Disbursing Entity')}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  {checkDrawerType === 'officer'
                    ? t('Gov Officer / Disbursing Entity')
                    : t('Bank')}
                </label>
                <input
                  type="text"
                  value={bankOrOfficer}
                  onChange={(e) => setBankOrOfficer(e.target.value)}
                  placeholder={
                    checkDrawerType === 'officer'
                      ? 'e.g. Officer Mohamed / Min. of Health'
                      : 'e.g. Jumhouria Bank'
                  }
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 uppercase mb-1">
                  {t('Check expiry date')}
                </label>
                <input
                  type="date"
                  value={checkDueDate}
                  onChange={(e) => setCheckDueDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* Note */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Note')}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
            placeholder={t('Note')}
          />
        </div>

        {/* Actions */}
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
            {t('Record Payment')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
