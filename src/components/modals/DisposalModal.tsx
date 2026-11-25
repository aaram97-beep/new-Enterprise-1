import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, todayStr, uid, fmtDate } from '../../utils/formatters';
import { getGlobalTrackFlags, formatStockChoiceLabel } from '../../utils/tracking';
import type { Disposal, DisposalLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface DisposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  disposal: Disposal;
}

export const DisposalModal: React.FC<DisposalModalProps> = ({
  isOpen,
  onClose,
  disposal,
}) => {
  const { db, branchId, myBranches, saveDisposal, nextNo, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<Disposal>(disposal);
  const disposalStock = db.stocks.filter((s) => s.branchId === draft.branchId && s.qty > 0.005);
  const globalTrack = getGlobalTrackFlags(db.settings);

  useEffect(() => {
    if (isOpen) {
      const pool = db.stocks.filter((s) => s.branchId === branchId && s.qty > 0.005);
      setDraft({
        ...disposal,
        branchId: disposal.branchId || branchId,
        date: disposal.date || todayStr(),
        lines: disposal.lines?.length
          ? disposal.lines
          : pool.length
          ? [
              {
                stockId: pool[0].id,
                itemId: pool[0].itemId,
                batchNo: pool[0].batchNo,
                qty: 1,
                cost: pool[0].cost,
                reason: 'Damaged',
              },
            ]
          : [],
      });
    }
  }, [disposal, branchId, db.stocks, isOpen]);

  const handleLineChange = (index: number, patch: Partial<DisposalLine>) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      const s = patch.stockId ? db.stocks.find((x) => x.id === patch.stockId) : null;
      lines[index] = {
        ...lines[index],
        ...patch,
        itemId: s ? s.itemId : lines[index].itemId,
        batchNo: s ? s.batchNo : lines[index].batchNo,
        cost: s ? s.cost : lines[index].cost,
      };
      return { ...prev, lines };
    });
  };

  const handleAddLine = () => {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          stockId: disposalStock.length ? disposalStock[0].id : null,
          itemId: disposalStock.length ? disposalStock[0].itemId : null,
          batchNo: disposalStock.length ? disposalStock[0].batchNo : '',
          qty: 1,
          cost: disposalStock.length ? disposalStock[0].cost : 0,
          reason: 'Damaged',
        },
      ],
    }));
  };

  const handleRemoveLine = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    const valid = draft.lines.filter((l) => l.stockId && r2(l.qty) > 0);
    if (!valid.length) {
      toastMsg('Add at least one batch line', 'error');
      return;
    }

    const lines: DisposalLine[] = valid.map((l) => {
      const s = db.stocks.find((st) => st.id === l.stockId);
      return {
        stockId: l.stockId,
        itemId: s ? s.itemId : null,
        batchNo: s ? s.batchNo : '',
        qty: r2(l.qty),
        cost: s ? s.cost : 0,
        reason: l.reason || 'Other',
      };
    });

    const rec: Disposal = {
      id: uid(),
      no: nextNo(draft.branchId, 'DSP'),
      date: draft.date || todayStr(),
      branchId: draft.branchId,
      status: 'pending',
      note: (draft.note || '').trim(),
      lines,
    };

    saveDisposal(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Log Disposal / Write-off')}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Branch')}
            </label>
            <select
              value={draft.branchId}
              onChange={(e) => setDraft((p) => ({ ...p, branchId: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
            >
              {myBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Date')}
            </label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        {/* Lines table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">
                  {globalTrack.trackLot ? t('Batch') : globalTrack.trackExpiry ? t('Expiry') : t('Stock Record')}
                </th>
                <th className="text-center px-2 py-2 w-24">{t('Available')}</th>
                <th className="text-center px-2 py-2 w-28">{t('Qty')}</th>
                <th className="text-left px-2 py-2 w-36">{t('Reason')}</th>
                <th className="w-8 px-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map((l, idx) => {
                const s = db.stocks.find((st) => st.id === l.stockId);
                return (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2">
                      <select
                        value={l.stockId || ''}
                        onChange={(e) => handleLineChange(idx, { stockId: e.target.value })}
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs bg-white cursor-pointer"
                      >
                        <option value="">{t('choose')}</option>
                        {disposalStock.map((st) => {
                          const it = db.items.find((i) => i.id === st.itemId);
                          return (
                            <option key={st.id} value={st.id}>
                              {`${it?.name || ''}   ${formatStockChoiceLabel(st, it, db.settings, fmtDate, 'left')}`}
                            </option>
                          );
                        })}
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-500 font-medium">
                      {s ? s.qty : 0}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.qty || ''}
                        onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                        className="border border-slate-300 rounded-lg w-full min-w-[6rem] px-2.5 py-1.5 text-center text-sm font-semibold tabular-nums"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <select
                        value={l.reason}
                        onChange={(e) => handleLineChange(idx, { reason: e.target.value })}
                        className="border border-slate-300 rounded-lg w-full px-2 py-1 bg-white cursor-pointer"
                      >
                        <option value="Damaged">{t('Damaged')}</option>
                        <option value="Expired">{t('Expired')}</option>
                        <option value="Lost">{t('Lost')}</option>
                        <option value="Other">{t('Other')}</option>
                      </select>
                    </td>
                    <td className="px-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleAddLine}
            className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add line')}
          </button>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={draft.note || ''}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              placeholder={t('Disposal / write-off remarks or incident notes')}
              className="border border-slate-300 rounded-lg w-full px-3 py-1.5 text-xs bg-white"
            />
          </div>
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
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {t('Log for Approval')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
