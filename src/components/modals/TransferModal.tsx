import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, todayStr, uid, fmtDate } from '../../utils/formatters';
import { getGlobalTrackFlags, formatStockChoiceLabel } from '../../utils/tracking';
import type { Transfer, TransferLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface TransferModalProps {
  isOpen: boolean;
  onClose: () => void;
  transfer: Transfer;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  isOpen,
  onClose,
  transfer,
}) => {
  const { db, branchId, myBranches, saveTransfer, nextNo, takeStock, stockOf, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<Transfer>(transfer);

  const globalTrack = getGlobalTrackFlags(db.settings);

  useEffect(() => {
    if (isOpen) {
      const initFrom = transfer.fromBranchId || (branchId === 'all' ? (myBranches[0]?.id || 'b1') : branchId);
      const other = db.branches.find((x) => x.id !== initFrom);
      const initialLines =
        transfer.lines && transfer.lines.length > 0
          ? transfer.lines
          : [{ itemId: '', stockId: null, qty: 1, cost: 0 }];

      setDraft({
        ...transfer,
        date: transfer.date || todayStr(),
        fromBranchId: initFrom,
        toBranchId: transfer.toBranchId || (other ? other.id : ''),
        lines: initialLines,
      });
    }
  }, [transfer, branchId, myBranches, db.branches, isOpen]);

  // Autocomplete rows for items, prioritizing items with available stock in the source branch
  const itemAcRows = [...db.items]
    .sort((a, b) => {
      const stockA = stockOf(a.id, draft.fromBranchId);
      const stockB = stockOf(b.id, draft.fromBranchId);
      if (stockA > 0 && stockB <= 0) return -1;
      if (stockB > 0 && stockA <= 0) return 1;
      return a.name.localeCompare(b.name);
    })
    .map((i) => {
      const avail = stockOf(i.id, draft.fromBranchId);
      return {
        id: i.id,
        label: i.name,
        sub: `${i.sku ? `${i.sku} • ` : ''}${t('Stock')}: ${avail}`,
        code: i.barcode || i.sku || '',
      };
    });

  const handleLineChange = (index: number, patch: Partial<TransferLine>) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], ...patch };
      return { ...prev, lines };
    });
  };

  const handlePickItem = (index: number, itemId: string) => {
    const batches = db.stocks.filter(
      (s) => s.itemId === itemId && s.branchId === draft.fromBranchId && s.qty > 0.005
    );
    const firstStock = batches[0];
    const it = db.items.find((i) => i.id === itemId);

    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = {
        ...lines[index],
        itemId,
        stockId: firstStock ? firstStock.id : null,
        batchNo: firstStock ? firstStock.batchNo : '',
        expiry: firstStock ? firstStock.expiry : '',
        cost: firstStock ? firstStock.cost : (it?.cost || 0),
        qty: lines[index]?.qty || 1,
      };
      return { ...prev, lines };
    });
  };

  const handleBatchChange = (index: number, stockId: string) => {
    const st = db.stocks.find((s) => s.id === stockId);
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = {
        ...lines[index],
        stockId: stockId || null,
        batchNo: st ? st.batchNo : '',
        expiry: st ? st.expiry : '',
        cost: st ? st.cost : lines[index]?.cost || 0,
      };
      return { ...prev, lines };
    });
  };

  const handleFromBranchChange = (newFromBranchId: string) => {
    setDraft((prev) => {
      const updatedLines = prev.lines.map((l) => {
        if (!l.itemId) return l;
        const validBatches = db.stocks.filter(
          (s) => s.itemId === l.itemId && s.branchId === newFromBranchId && s.qty > 0.005
        );
        const matchStock = validBatches.find((s) => s.id === l.stockId) || validBatches[0];
        return {
          ...l,
          stockId: matchStock ? matchStock.id : null,
          batchNo: matchStock ? matchStock.batchNo : '',
          expiry: matchStock ? matchStock.expiry : '',
          cost: matchStock ? matchStock.cost : l.cost,
        };
      });
      return {
        ...prev,
        fromBranchId: newFromBranchId,
        lines: updatedLines,
      };
    });
  };

  const handleAddLine = () => {
    setDraft((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          itemId: '',
          stockId: null,
          qty: 1,
          cost: 0,
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
    if (!draft.fromBranchId || !draft.toBranchId) {
      toastMsg('Choose source and destination branches', 'error');
      return;
    }
    if (draft.fromBranchId === draft.toBranchId) {
      toastMsg('Source and destination must differ', 'error');
      return;
    }

    const missingItem = draft.lines.find((l) => !l.itemId);
    if (missingItem) {
      toastMsg(t('Please select an item for each line'), 'error');
      return;
    }

    const missingBatch = draft.lines.find((l) => !l.stockId);
    if (missingBatch) {
      const it = db.items.find((i) => i.id === missingBatch.itemId);
      toastMsg(
        `${t('Please select a batch for each line')} (${it?.name || t('Item')})`,
        'error'
      );
      return;
    }

    const valid = draft.lines.filter((l) => l.itemId && l.stockId && r2(l.qty) > 0);
    if (!valid.length) {
      toastMsg('Add at least one line with quantity greater than zero', 'error');
      return;
    }

    // Validate available batch quantities
    const perStock: Record<string, number> = {};
    valid.forEach((l) => {
      if (l.stockId) perStock[l.stockId] = r2((perStock[l.stockId] || 0) + r2(l.qty));
    });

    for (const k in perStock) {
      const s = db.stocks.find((st) => st.id === k);
      if (!s || s.qty + 0.000001 < perStock[k]) {
        toastMsg(
          `${t('Insufficient stock in batch')} ${s ? s.batchNo || '(no batch)' : '?'}: ${s ? s.qty : 0} ${t('Available')}`,
          'error'
        );
        return;
      }
    }

    const finalLines: TransferLine[] = [];
    for (const l of valid) {
      const res = takeStock(l.stockId!, r2(l.qty));
      if (!res.ok || !res.itemId) {
        toastMsg(res.msg || 'Stock take error', 'error');
        return;
      }
      finalLines.push({
        itemId: res.itemId,
        batchNo: res.batchNo,
        expiry: res.expiry,
        qty: r2(l.qty),
        cost: res.cost || 0,
        stockId: l.stockId,
      });
    }

    const rec: Transfer = {
      id: uid(),
      no: nextNo(draft.fromBranchId, 'TRF'),
      date: draft.date || todayStr(),
      fromBranchId: draft.fromBranchId,
      toBranchId: draft.toBranchId,
      status: 'transit',
      note: (draft.note || '').trim(),
      lines: finalLines,
    };

    saveTransfer(rec);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('New Transfer')} maxWidth="max-w-5xl">
      <div className="space-y-4 text-xs">
        {/* From, To, Date */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('From')}
            </label>
            <select
              value={draft.fromBranchId}
              onChange={(e) => handleFromBranchChange(e.target.value)}
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
              {t('To')}
            </label>
            <select
              value={draft.toBranchId}
              onChange={(e) => setDraft((p) => ({ ...p, toBranchId: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
            >
              {db.branches.map((b) => (
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
        <div className="border border-slate-200 rounded-xl overflow-visible bg-white">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
              <tr>
                <th className="text-left px-3 py-2.5 rounded-tl-xl min-w-[180px]">{t('Item')}</th>
                <th className="text-left px-3 py-2.5 w-60 sm:w-72">
                  {globalTrack.trackLot ? t('Batch / Lot') : globalTrack.trackExpiry ? t('Expiry') : t('Stock Record')}
                </th>
                <th className="text-center px-2 py-2.5 w-24">{t('Available')}</th>
                <th className="text-center px-2 py-2.5 w-32">{t('Qty')}</th>
                <th className="w-9 px-1 rounded-tr-xl"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map((l, idx) => {
                const itemObj = db.items.find((i) => i.id === l.itemId);
                const itemBatches = l.itemId
                  ? db.stocks.filter(
                      (s) => s.itemId === l.itemId && s.branchId === draft.fromBranchId && s.qty > 0.005
                    )
                  : [];
                const s = db.stocks.find((st) => st.id === l.stockId);
                const isOver = s && l.qty > s.qty;

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 [&>td]:align-top">
                    {/* 1. Item Selection (Box 1) */}
                    <td className="px-2.5 py-2">
                      <AutoCompleteBox
                        rows={itemAcRows}
                        placeholder={t('Search item')}
                        defaultValue={itemObj ? itemObj.name : ''}
                        onPick={(row) => handlePickItem(idx, row.id)}
                      />
                      {itemObj && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                          {itemObj.sku ? `${itemObj.sku} • ` : ''}
                          {t('Total branch stock')}:{' '}
                          <span className="font-semibold text-slate-600 dark:text-slate-300">
                            {stockOf(itemObj.id, draft.fromBranchId)}
                          </span>
                        </div>
                      )}
                    </td>

                    {/* 2. Filtered Batch Selection (Box 2) */}
                    <td className="px-2.5 py-2">
                      <select
                        value={l.stockId || ''}
                        onChange={(e) => handleBatchChange(idx, e.target.value)}
                        disabled={!l.itemId || itemBatches.length === 0}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400"
                      >
                        {!l.itemId ? (
                          <option value="">{t('Choose item first')}</option>
                        ) : itemBatches.length === 0 ? (
                          <option value="">{t('No stock in this branch')}</option>
                        ) : (
                          <>
                            <option value="">{t('Choose batch...')}</option>
                            {itemBatches.map((st) => (
                              <option key={st.id} value={st.id}>
                                {formatStockChoiceLabel(st, itemObj, db.settings, fmtDate, t('avail'))}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </td>

                    {/* Available Stock */}
                    <td className="px-2 py-2 pt-3 text-center text-xs">
                      {s ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">{s.qty}</span>
                      ) : l.itemId ? (
                        <span className="text-rose-500 font-medium">0</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* 3. Transfer Quantity (Box 3) */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.qty || ''}
                        onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                        className={`border rounded-lg w-full min-w-[7rem] px-2.5 py-1.5 text-center font-semibold text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${
                          isOver ? 'border-rose-500 text-rose-600 bg-rose-50' : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </td>

                    {/* Remove Action */}
                    <td className="px-1 py-2 pt-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                        title={t('Remove line')}
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
              placeholder={t('Transfer remarks, vehicle, driver or notes')}
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
            {t('Dispatch (in transit)')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
