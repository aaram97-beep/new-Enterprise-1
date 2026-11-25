import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, fmt, todayStr, uid } from '../../utils/formatters';
import {
  retInvTotal,
  deliveredOf,
  creditedOf,
  returnSlipRemaining,
} from '../../utils/calculations';
import type { ReturnInvoice } from '../../types';
import { Trash2 } from 'lucide-react';

interface CreditNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  creditNote: ReturnInvoice;
}

export const CreditNoteModal: React.FC<CreditNoteModalProps> = ({
  isOpen,
  onClose,
  creditNote,
}) => {
  const { db, branchId, saveReturnInvoice, nextNo, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<ReturnInvoice>(creditNote);

  useEffect(() => {
    setDraft({
      ...creditNote,
      date: creditNote.date || todayStr(),
    });
  }, [creditNote, isOpen]);

  const slip = db.returnSlips.find((s) => s.id === draft.returnSlipId);
  const cust = db.customers.find((c) => c.id === draft.customerId);

  const handlePriceChange = (index: number, price: number) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], price };
      return { ...prev, lines };
    });
  };

  const handleQtyChange = (index: number, qty: number) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], qty };
      return { ...prev, lines };
    });
  };

  const handleRemoveLine = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const totalCredit = retInvTotal(draft);

  const handleSave = () => {
    if (!slip) {
      toastMsg(t('Return slip not found'), 'error');
      return;
    }
    const remSlipTotal = returnSlipRemaining(db, slip, null, null, draft.id);
    if (remSlipTotal <= 0.005) {
      toastMsg(
        t('Cannot attach credit note: all items on this return slip are already settled.'),
        'error'
      );
      return;
    }
    const validLines = draft.lines.filter((l) => l.itemId && r2(l.qty) > 0);
    if (!validLines.length) {
      toastMsg(t('At least one line with quantity greater than 0 is required'), 'error');
      return;
    }

    // Validate that chosen quantity doesn't exceed available uncredited balance
    for (const line of validLines) {
      const origSlipLine = slip.lines.find((sl) => sl.itemId === line.itemId);
      const origQty = origSlipLine ? +origSlipLine.qty || 0 : line.qty;
      const delivered = deliveredOf(db, slip.id, line.itemId, null);
      const alreadyCredited = creditedOf(db, slip.id, line.itemId, draft.id);
      const maxAllowed = Math.max(0, r2(origQty - delivered - alreadyCredited));

      if (r2(line.qty) > maxAllowed + 0.000001) {
        const itemObj = db.items.find((i) => i.id === line.itemId);
        toastMsg(
          `${t('Quantity')} (${line.qty}) ${t('exceeds remaining balance')} (${maxAllowed}) ${t('for')} ${itemObj?.name || 'item'}`,
          'error'
        );
        return;
      }
    }

    const rec: ReturnInvoice = {
      id: draft.id || uid(),
      no: draft.no || nextNo(draft.branchId || branchId, 'RIN'),
      date: draft.date || todayStr(),
      customerId: draft.customerId,
      branchId: draft.branchId || branchId,
      returnSlipId: draft.returnSlipId,
      note: (draft.note || '').trim(),
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        qty: r2(l.qty),
        price: r2(l.price),
      })),
      total: totalCredit,
    };

    saveReturnInvoice(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Credit Note')}
      subtitle={`${t('Attaching to slip')} ${slip?.no || ''} • ${t('reduces')} ${cust?.name || ''}${t("'s receivable balance.")}`}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5 min-w-[180px]">{t('Item')}</th>
                <th className="text-center px-2 py-2.5 w-36">{t('Qty to Credit')}</th>
                <th className="text-center px-2 py-2.5 w-36">{t('Price')}</th>
                <th className="text-right px-3 py-2.5 w-32">{t('Net')}</th>
                <th className="w-8 px-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map((line, idx) => {
                const itemObj = db.items.find((i) => i.id === line.itemId);
                const origSlipLine = slip?.lines.find((sl) => sl.itemId === line.itemId);
                const origQty = origSlipLine ? +origSlipLine.qty || 0 : line.qty;
                const delivered = slip ? deliveredOf(db, slip.id, line.itemId, null) : 0;
                const alreadyCredited = slip ? creditedOf(db, slip.id, line.itemId, draft.id) : 0;
                const maxAllowed = Math.max(0, r2(origQty - delivered - alreadyCredited));
                const isOver = r2(line.qty) > maxAllowed + 0.000001;

                return (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      <div>{itemObj?.name || '—'}</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        {t('Returned')}: {origQty}
                        {delivered > 0 ? ` • ${t('Delivered')}: ${delivered}` : ''}
                        {alreadyCredited > 0 ? ` • ${t('Credited')}: ${alreadyCredited}` : ''}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={maxAllowed}
                        value={line.qty === 0 ? '0' : line.qty || ''}
                        onChange={(e) => handleQtyChange(idx, +e.target.value)}
                        className={`border rounded-lg w-full min-w-[7rem] px-2.5 py-1.5 text-center text-sm font-semibold tabular-nums ${
                          isOver
                            ? 'border-rose-400 bg-rose-50 text-rose-700 focus:ring-rose-500'
                            : 'border-slate-300 text-slate-800 focus:border-blue-500'
                        }`}
                      />
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {t('Max')}: <span className="font-semibold">{maxAllowed}</span>
                      </div>
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.price || ''}
                        onChange={(e) => handlePriceChange(idx, +e.target.value)}
                        className="border border-slate-300 rounded-lg w-full min-w-[7.5rem] px-2.5 py-1.5 text-center text-sm tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                      {fmt(r2((+line.qty || 0) * (+line.price || 0)))}
                    </td>
                    <td className="px-1 text-center">
                      {draft.lines.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveLine(idx)}
                          title={t('Remove Line')}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {draft.lines.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-400 text-xs">
                    {t('No lines to credit')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <label className="text-xs font-medium text-slate-700 flex items-center gap-2">
            <span>{t('Date')}:</span>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2.5 py-1 text-xs bg-white"
            />
          </label>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={draft.note || ''}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              placeholder={t('Note / Reason for credit')}
              className="border border-slate-300 rounded-lg w-full px-2.5 py-1 text-xs bg-white"
            />
          </div>
          <div className="text-base font-bold text-emerald-700">
            {t('Credit')}: -{fmt(totalCredit)}
          </div>
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
            {t('Attach & Reduce Balance')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
