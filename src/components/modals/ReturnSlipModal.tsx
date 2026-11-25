import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, todayStr, uid } from '../../utils/formatters';
import { getLinesTrackingFlags, resolveItemTracking } from '../../utils/tracking';
import type { ReturnSlip, ReturnSlipLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface ReturnSlipModalProps {
  isOpen: boolean;
  onClose: () => void;
  returnSlip: ReturnSlip;
}

export const ReturnSlipModal: React.FC<ReturnSlipModalProps> = ({
  isOpen,
  onClose,
  returnSlip,
}) => {
  const { db, branchId, saveReturnSlip, nextNo, addStock, subtractStock, toastMsg, t } = useIMS();
  const [draft, setDraft] = useState<ReturnSlip>(returnSlip);

  useEffect(() => {
    setDraft({
      ...returnSlip,
      branchId: returnSlip.branchId || branchId,
      date: returnSlip.date || todayStr(),
      lines: returnSlip.lines?.length
        ? returnSlip.lines
        : [{ itemId: null, qty: 1, batchNo: '', expiry: '' }],
    });
  }, [returnSlip, branchId, isOpen]);

  const customerAcRows = db.customers.map((c) => ({
    id: c.id,
    label: c.name,
    sub: `${c.phone || ''}${c.isProvider ? '   provider' : ''}`.trim(),
    code: c.phone || '',
  }));

  const itemAcRows = db.items.map((i) => ({
    id: i.id,
    label: i.name,
    sub: i.sku || '',
    code: i.barcode || i.sku || '',
  }));

  const selectedCustomer = db.customers.find((c) => c.id === draft.customerId);

  const handleLineChange = (index: number, patch: Partial<ReturnSlipLine>) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], ...patch };
      return { ...prev, lines };
    });
  };

  const handleAddLine = () => {
    setDraft((prev) => ({
      ...prev,
      lines: [...prev.lines, { itemId: null, qty: 1, batchNo: '', expiry: '' }],
    }));
  };

  const handleRemoveLine = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    if (!draft.customerId) {
      toastMsg('Choose a customer first', 'error');
      return;
    }
    const validLines = draft.lines.filter((l) => l.itemId && r2(l.qty) > 0);
    if (!validLines.length) {
      toastMsg('Add at least one item row', 'error');
      return;
    }

    const bId = draft.branchId || branchId;

    // If editing, revert old stock addition first
    if (draft.id) {
      const old = db.returnSlips.find((x) => x.id === draft.id);
      if (old) {
        old.lines.forEach((l) => {
          if (l.itemId) subtractStock(l.itemId, old.branchId, l.batchNo, l.expiry, l.qty);
        });
      }
    }

    const { showLotCol, showExpiryCol } = getLinesTrackingFlags(
      db.settings,
      db.items,
      validLines.map((l) => l.itemId)
    );
    void showLotCol;
    void showExpiryCol;

    const normalizedValidLines = validLines.map((l) => {
      const it = db.items.find((i) => i.id === l.itemId);
      const eff = resolveItemTracking(db.settings, it);
      return {
        ...l,
        batchNo: eff.trackLot ? l.batchNo || '' : '',
        expiry: eff.trackExpiry ? l.expiry || '' : '',
      };
    });

    // Add returned items to warehouse stock
    normalizedValidLines.forEach((l) => {
      if (l.itemId) {
        const it = db.items.find((i) => i.id === l.itemId);
        addStock(l.itemId, bId, l.batchNo, l.expiry, l.qty, it?.cost || 0);
      }
    });

    const rec: ReturnSlip = {
      id: draft.id || uid(),
      no: draft.no || nextNo(bId, 'RSL'),
      date: draft.date || todayStr(),
      customerId: draft.customerId,
      branchId: bId,
      note: draft.note || '',
      lines: normalizedValidLines.map((l) => ({
        itemId: l.itemId,
        qty: r2(l.qty),
        batchNo: l.batchNo || '',
        expiry: l.expiry || '',
      })),
      returnInvoiceId: draft.returnInvoiceId || null,
    };

    saveReturnSlip(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('Return Slip')}`}
      subtitle={t('Items come back into stock. The balance is only reduced when a credit note is attached.')}
      maxWidth="max-w-4xl"
    >
      <div className="space-y-4">
        {/* Customer & Date */}
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Customer')}
            </label>
            <AutoCompleteBox
              rows={customerAcRows}
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
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
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

        {/* Lines */}
        {(() => {
          const { showLotCol, showExpiryCol } = getLinesTrackingFlags(
            db.settings,
            db.items,
            draft.lines.map((l) => l.itemId)
          );
          return (
            <div className="border border-slate-200 rounded-xl overflow-visible bg-white">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="rounded-tl-xl text-left px-3 py-2.5 min-w-[180px]">{t('Item')}</th>
                    <th className="text-center px-2 py-2.5 w-28">{t('Qty')}</th>
                    {showLotCol && <th className="text-left px-2 py-2.5 w-36">{t('Batch')}</th>}
                    {showExpiryCol && <th className="text-left px-2 py-2.5 w-40">{t('Expiry')}</th>}
                    <th className="rounded-tr-xl w-8 px-1"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {draft.lines.map((line, idx) => {
                    const itemObj = db.items.find((i) => i.id === line.itemId);
                    const rowTrack = line.itemId
                      ? resolveItemTracking(db.settings, itemObj)
                      : { trackLot: showLotCol, trackExpiry: showExpiryCol };
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70">
                        <td className="px-2.5 py-2">
                          <AutoCompleteBox
                            rows={itemAcRows}
                            placeholder={t('Item')}
                            defaultValue={itemObj ? itemObj.name : ''}
                            onPick={(row) => {
                              const picked = db.items.find((i) => i.id === row.id);
                              const nextTrack = resolveItemTracking(db.settings, picked);
                              handleLineChange(idx, {
                                itemId: row.id,
                                batchNo: nextTrack.trackLot ? line.batchNo : '',
                                expiry: nextTrack.trackExpiry ? line.expiry : '',
                              });
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.qty || ''}
                            onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                            className="border border-slate-300 rounded-lg w-full min-w-[6rem] px-2.5 py-1.5 text-center text-sm tabular-nums"
                          />
                        </td>
                        {showLotCol && (
                          <td className="px-2 py-2">
                            {rowTrack.trackLot ? (
                              <input
                                type="text"
                                value={line.batchNo || ''}
                                onChange={(e) => handleLineChange(idx, { batchNo: e.target.value })}
                                className="border border-slate-300 rounded-lg w-full min-w-[7.5rem] px-2.5 py-1.5 text-xs"
                                placeholder="LOT-1"
                              />
                            ) : (
                              <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                            )}
                          </td>
                        )}
                        {showExpiryCol && (
                          <td className="px-2 py-2">
                            {rowTrack.trackExpiry ? (
                              <input
                                type="date"
                                value={line.expiry || ''}
                                onChange={(e) => handleLineChange(idx, { expiry: e.target.value })}
                                className="border border-slate-300 rounded-lg w-full px-2 py-1 text-xs"
                              />
                            ) : (
                              <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                            )}
                          </td>
                        )}
                    <td className="px-1 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}

        {/* Add line & Note */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
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
              placeholder={t('Note')}
              className="border border-slate-300 rounded-lg w-full px-3 py-1.5 text-xs"
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
            {t('Save Return Slip')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
