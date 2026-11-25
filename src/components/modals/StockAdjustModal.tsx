import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, todayStr, uid } from '../../utils/formatters';
import { resolveItemTracking } from '../../utils/tracking';
import type { StockAdjust } from '../../types';

interface StockAdjustModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StockAdjustModal: React.FC<StockAdjustModalProps> = ({ isOpen, onClose }) => {
  const { db, branchId, myBranches, addStock, takeFEFO, saveAdjust, session, canAdjustInventory, toastMsg, t } = useIMS();
  const defaultBranch = branchId === 'all' ? (myBranches[0]?.id || 'b1') : branchId;
  const [itemId, setItemId] = useState<string>('');
  const [targetBranchId, setTargetBranchId] = useState<string>(defaultBranch);
  const [batchNo, setBatchNo] = useState<string>('');
  const [expiry, setExpiry] = useState<string>('');
  const [qty, setQty] = useState<number>(0);
  const [reason, setReason] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setItemId('');
      setTargetBranchId(branchId === 'all' ? (myBranches[0]?.id || 'b1') : branchId);
      setBatchNo('');
      setExpiry('');
      setQty(0);
      setReason('');
    }
  }, [isOpen, branchId, myBranches]);

  const itemAcRows = db.items.map((i) => ({
    id: i.id,
    label: i.name,
    sub: i.sku || '',
    code: i.barcode || i.sku || '',
  }));

  const selectedItem = db.items.find((i) => i.id === itemId);
  const tracking = resolveItemTracking(db.settings, selectedItem);

  const handleSave = () => {
    if (!canAdjustInventory()) {
      toastMsg(t('Permission denied: You do not have permission to adjust inventory stock.'), 'error');
      return;
    }
    if (!itemId) {
      toastMsg('Choose an item', 'error');
      return;
    }
    if (!targetBranchId) {
      toastMsg('Choose a branch', 'error');
      return;
    }
    const q = r2(qty);
    if (!q) {
      toastMsg('Quantity must be non-zero (use - to remove)', 'error');
      return;
    }

    const effectiveBatch = tracking.trackLot ? batchNo : '';
    const effectiveExpiry = tracking.trackExpiry ? expiry : '';

    const cost = (db.items.find((i) => i.id === itemId) || {}).cost || 0;
    if (q > 0) {
      addStock(itemId, targetBranchId, effectiveBatch, effectiveExpiry, q, cost);
    } else {
      const res = takeFEFO(itemId, targetBranchId, -q);
      if (!res.ok) {
        toastMsg(res.msg || 'Stock deduction error', 'error');
        return;
      }
    }

    const rec: StockAdjust = {
      id: uid(),
      date: todayStr(),
      branchId: targetBranchId,
      itemId,
      batchNo: effectiveBatch || '',
      expiry: effectiveExpiry || '',
      qty: q,
      cost,
      reason: reason || 'manual adjustment',
      user: session ? session.name : '',
    };

    saveAdjust(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Manual Stock Adjustment')}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Item')}
          </label>
          <AutoCompleteBox
            rows={itemAcRows}
            placeholder={t('Search item')}
            defaultValue={selectedItem ? selectedItem.name : ''}
            onPick={(row) => {
              const picked = db.items.find((i) => i.id === row.id);
              const nextTrack = resolveItemTracking(db.settings, picked);
              setItemId(row.id);
              if (!nextTrack.trackLot) setBatchNo('');
              if (!nextTrack.trackExpiry) setExpiry('');
            }}
          />
          {selectedItem && (
            <div className="text-[11px] text-slate-500 mt-1">
              {t('Selected:')} <b>{selectedItem.name}</b>
            </div>
          )}
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Branch')}
          </label>
          <select
            value={targetBranchId}
            onChange={(e) => setTargetBranchId(e.target.value)}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
          >
            {myBranches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {tracking.trackLot && (
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Batch No')}
            </label>
            <input
              type="text"
              value={batchNo}
              onChange={(e) => setBatchNo(e.target.value)}
              placeholder="LOT-101"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        )}

        <div className={`grid ${tracking.trackExpiry ? 'grid-cols-2' : 'grid-cols-1'} gap-3`}>
          {tracking.trackExpiry && (
            <div>
              <label className="block font-semibold text-slate-700 uppercase mb-1">
                {t('Expiry')}
              </label>
              <input
                type="date"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
              />
            </div>
          )}
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Qty (  to remove)')}
            </label>
            <input
              type="number"
              step="0.01"
              value={qty || ''}
              onChange={(e) => setQty(+e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase mb-1">
            {t('Reason')}
          </label>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Count correction / damage"
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
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold shadow-md cursor-pointer"
          >
            {t('Apply')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
