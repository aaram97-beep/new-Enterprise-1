import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, todayStr, uid, fmtDate, toIsoDate } from '../../utils/formatters';
import { getGlobalTrackFlags, formatStockChoiceLabel } from '../../utils/tracking';
import { deliveredOf, creditedOf, returnSlipRemaining } from '../../utils/calculations';
import {
  type DeliveryDraftLine,
  getBatchesForDeliveryItem,
  buildDeliverySourceItemOptions,
  pickDeliveryItemForLine,
  splitDeliveryBatchLine,
  hasAnyAvailableDeliveryBatch,
  appendBlankDeliveryLine,
} from '../../utils/deliveryHelpers';
import { printDocument } from '../../utils/printService';
import type { Delivery, DeliveryLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface DeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  delivery: Delivery;
}

export const DeliveryModal: React.FC<DeliveryModalProps> = ({ isOpen, onClose, delivery }) => {
  const { db, saveDelivery, nextNo, toastMsg, stocksOf, takeStock, addStock, t } = useIMS();
  const [draft, setDraft] = useState<Delivery>(delivery);
  const [lineBatches, setLineBatches] = useState<DeliveryDraftLine[]>([]);

  const globalTrack = getGlobalTrackFlags(db.settings);
  const inv = draft.invoiceId ? db.invoices.find((x) => x.id === draft.invoiceId) : null;
  const retSlip = draft.returnSlipId ? db.returnSlips.find((x) => x.id === draft.returnSlipId) : null;
  const cust =
    db.customers.find((c) => c.id === draft.customerId) ||
    (inv ? db.customers.find((c) => c.id === inv.customerId) : null) ||
    (retSlip ? db.customers.find((c) => c.id === retSlip.customerId) : null);

  useEffect(() => {
    setDraft({ ...delivery, date: delivery.date || todayStr() });
    if (delivery.lines && delivery.lines.length > 0) {
      setLineBatches(
        delivery.lines.map((l) => {
          const s = db.stocks.find(
            (x) =>
              x.itemId === l.itemId &&
              x.branchId === delivery.branchId &&
              (x.batchNo || '') === (l.batchNo || '')
          );
          return { itemId: l.itemId, stockId: s ? s.id : '', qty: l.qty };
        })
      );
    } else if (inv) {
      // Auto populate unique unfulfilled invoice items with FEFO batches
      const initial: DeliveryDraftLine[] = [];
      const seen = new Set<string>();
      inv.lines.forEach((l) => {
        if (!l.itemId || seen.has(l.itemId)) return;
        seen.add(l.itemId);
        const rem = r2(
          inv.lines
            .filter((x) => x.itemId === l.itemId)
            .reduce((sum, x) => sum + (+x.qty || 0), 0) - deliveredOf(db, inv.id, l.itemId, null)
        );
        if (rem <= 0.005) return;
        const pool = stocksOf(l.itemId, inv.branchId)
          .slice()
          .sort((a, b) => (toIsoDate(a.expiry) || '9999-12-31').localeCompare(toIsoDate(b.expiry) || '9999-12-31'));
        initial.push({ itemId: l.itemId, stockId: pool.length ? pool[0].id : '', qty: rem });
      });
      setLineBatches(initial);
    } else if (retSlip) {
      // Auto populate unique unfulfilled return slip items prioritizing further expiry batches
      const initial: DeliveryDraftLine[] = [];
      const seen = new Set<string>();
      retSlip.lines.forEach((l) => {
        if (!l.itemId || seen.has(l.itemId)) return;
        seen.add(l.itemId);
        const totalRet = retSlip.lines
          .filter((x) => x.itemId === l.itemId)
          .reduce((sum, x) => sum + (+x.qty || 0), 0);
        const credited = creditedOf(db, retSlip.id, l.itemId, null);
        const rem = r2(totalRet - deliveredOf(db, retSlip.id, l.itemId, null) - credited);
        if (rem <= 0.005) return;
        const pool = stocksOf(l.itemId, retSlip.branchId)
          .slice()
          .sort((a, b) => (toIsoDate(b.expiry) || '').localeCompare(toIsoDate(a.expiry) || ''));
        initial.push({ itemId: l.itemId, stockId: pool.length ? pool[0].id : '', qty: rem });
      });
      setLineBatches(initial);
    }
  }, [delivery, isOpen, inv, retSlip]);

  // Existing deliveries on this invoice or return slip (excluding current draft)
  const prevDeliveries = (db.deliveries || [])
    .filter((x) =>
      (inv && x.invoiceId === inv.id && x.id !== draft.id) ||
      (retSlip && x.returnSlipId === retSlip.id && x.id !== draft.id)
    )
    .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.no || '').localeCompare(b.no || ''));

  // Attached credit notes on this return slip
  const attachedCreditNotes = retSlip
    ? (db.returnInvoices || [])
        .filter((cr) => cr.returnSlipId === retSlip.id)
        .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.no || '').localeCompare(b.no || ''))
    : [];

  // Quantities restored to batch stock if editing an existing delivery
  const oldDelivery = draft.id ? db.deliveries.find((x) => x.id === draft.id) : null;
  const oldByStock: Record<string, number> = {};
  if (oldDelivery) {
    oldDelivery.lines.forEach((l) => {
      const s = db.stocks.find(
        (x) =>
          x.itemId === l.itemId &&
          x.branchId === oldDelivery.branchId &&
          (x.batchNo || '') === (l.batchNo || '')
      );
      if (s) oldByStock[s.id] = r2((oldByStock[s.id] || 0) + (+l.qty || 0));
    });
  }

  const sourceItemsSummary = () => {
    const sourceDoc = inv || retSlip;
    if (!sourceDoc) return [];
    const itemMap = new Map<string, number>();
    sourceDoc.lines.forEach((l: any) => {
      if (!l.itemId) return;
      itemMap.set(l.itemId, r2((itemMap.get(l.itemId) || 0) + (+l.qty || 0)));
    });

    return Array.from(itemMap.entries()).map(([itemId, sourceQty]) => {
      let cumulative = 0;
      const priorHistory = prevDeliveries.map((del) => {
        const qtyInDel = (del.lines || [])
          .filter((l) => l.itemId === itemId)
          .reduce((sum, l) => sum + (+l.qty || 0), 0);
        cumulative = r2(cumulative + qtyInDel);
        const remAfterDel = Math.max(0, r2(sourceQty - cumulative));
        return { del, qtyInDel, remAfterDel };
      });

      const creditHistory = attachedCreditNotes.map((cr) => {
        const qtyInCr = (cr.lines || [])
          .filter((l) => l.itemId === itemId)
          .reduce((sum, l) => sum + (+l.qty || 0), 0);
        return { cr, qtyInCr };
      });

      const priorDelivered = cumulative;
      const credited = creditHistory.reduce((a, c) => a + c.qtyInCr, 0);
      const balanceBefore = Math.max(0, r2(sourceQty - priorDelivered - credited));
      const deliveringNow = r2(
        lineBatches.reduce((a, x) => {
          if (!x.stockId) return a;
          const s = db.stocks.find((st) => st.id === x.stockId);
          return a + (s && s.itemId === itemId ? +x.qty || 0 : 0);
        }, 0)
      );
      const remainingAfter = r2(balanceBefore - deliveringNow);

      return {
        itemId,
        sourceQty,
        priorHistory,
        creditHistory,
        priorDelivered,
        credited,
        balanceBefore,
        deliveringNow,
        remainingAfter,
      };
    });
  };

  const summaryRows = sourceItemsSummary();
  const balanceBeforeByItem: Record<string, number> = {};
  const remainingAfterByItem: Record<string, number> = {};
  summaryRows.forEach((r) => {
    balanceBeforeByItem[r.itemId] = r.balanceBefore;
    remainingAfterByItem[r.itemId] = Math.max(0, r.remainingAfter);
  });

  const sourceItemIds = (inv?.lines || retSlip?.lines || []).map((l) => l.itemId);
  const sourceItemAcRows = buildDeliverySourceItemOptions({
    sourceItemIds,
    branchId: draft.branchId,
    stocks: db.stocks,
    items: db.items,
    remainingByItem: remainingAfterByItem,
    labels: { rem: t('Remaining'), stock: t('Stock') },
  });

  const handlePickItem = (index: number, itemId: string) => {
    setLineBatches((prev) =>
      pickDeliveryItemForLine({
        lines: prev,
        index,
        itemId,
        branchId: draft.branchId,
        stocks: db.stocks,
        prioritizeFurtherExpiry: Boolean(retSlip),
        balanceBeforeByItem,
      })
    );
  };

  const handleSplitLine = (index: number) => {
    setLineBatches((prev) =>
      splitDeliveryBatchLine({
        lines: prev,
        index,
        branchId: draft.branchId,
        stocks: db.stocks,
        prioritizeFurtherExpiry: Boolean(retSlip),
        balanceBeforeByItem,
        extraAvailByStock: oldByStock,
      })
    );
  };

  const handleAddBatchLine = () => {
    const hasStock = hasAnyAvailableDeliveryBatch({
      branchId: draft.branchId,
      sourceItemIds,
      stocks: db.stocks,
    });
    if (!hasStock) {
      toastMsg(t('No stock available in this branch'), 'error');
      return;
    }
    setLineBatches((prev) => appendBlankDeliveryLine(prev, 0));
  };

  const handleSaveAndPrint = (shouldPrint = false) => {
    const sourceDoc = inv || retSlip;
    if (!sourceDoc) {
      toastMsg(t('Source document not found'), 'error');
      return;
    }
    if (retSlip && returnSlipRemaining(db, retSlip) <= 0.005) {
      toastMsg(
        t('Cannot deliver: all items on this return slip are already settled.'),
        'error'
      );
      return;
    }

    const missingBatch = lineBatches.find((l) => l.itemId && r2(l.qty) > 0 && !l.stockId);
    if (missingBatch) {
      const it = db.items.find((i) => i.id === missingBatch.itemId);
      toastMsg(
        `${t('Please select a batch for each line')} (${it?.name || t('Item')})`,
        'error'
      );
      return;
    }

    const valid = lineBatches.filter((l) => l.stockId && r2(l.qty) > 0);
    if (!valid.length) {
      toastMsg(t('Add at least one batch line'), 'error');
      return;
    }

    const perStock: Record<string, number> = {};
    const perItem: Record<string, number> = {};
    for (const l of valid) {
      perStock[l.stockId] = r2((perStock[l.stockId] || 0) + r2(l.qty));
      const s = db.stocks.find((st) => st.id === l.stockId);
      if (s) {
        perItem[s.itemId] = r2((perItem[s.itemId] || 0) + r2(l.qty));
      }
    }

    for (const k in perStock) {
      const s = db.stocks.find((st) => st.id === k);
      const avail = r2((s ? s.qty : 0) + (oldByStock[k] || 0));
      if (!s || avail + 0.000001 < perStock[k]) {
        toastMsg(`${t('Insufficient stock in batch')} ${s ? s.batchNo || '(no batch)' : '?'}`, 'error');
        return;
      }
    }

    const docId = inv ? inv.id : retSlip!.id;
    for (const iid in perItem) {
      const sourceQty = sourceDoc.lines
        .filter((l: any) => l.itemId === iid)
        .reduce((a: number, l: any) => a + (+l.qty || 0), 0);
      const credited = retSlip ? creditedOf(db, docId, iid, null) : 0;
      const rem = r2(sourceQty - deliveredOf(db, docId, iid, draft.id) - credited);
      if (perItem[iid] > rem + 0.000001) {
        const it = db.items.find((i) => i.id === iid);
        toastMsg(
          `${t('Quantity exceeds remaining for')} ${it?.name || 'item'}`,
          'error'
        );
        return;
      }
    }

    // Revert old lines if updating
    if (oldDelivery) {
      oldDelivery.lines.forEach((l) =>
        addStock(l.itemId, oldDelivery.branchId, l.batchNo, l.expiry, l.qty, l.cost)
      );
    }

    // Deduct stock for new delivery
    const lines: DeliveryLine[] = [];
    for (const l of valid) {
      const tRes = takeStock(l.stockId, r2(l.qty));
      if (!tRes.ok || !tRes.itemId) {
        toastMsg(tRes.msg || t('Stock take error'), 'error');
        return;
      }
      lines.push({
        itemId: tRes.itemId,
        qty: r2(l.qty),
        batchNo: tRes.batchNo,
        expiry: tRes.expiry,
        cost: tRes.cost,
      });
    }

    const rec: Delivery = {
      id: draft.id || uid(),
      no: draft.no || nextNo(draft.branchId, 'DEL'),
      date: draft.date || todayStr(),
      invoiceId: draft.invoiceId || '',
      returnSlipId: draft.returnSlipId || '',
      customerId: draft.customerId || cust?.id || '',
      branchId: draft.branchId,
      note: (draft.note || '').trim(),
      lines,
    };

    saveDelivery(rec);
    if (shouldPrint) {
      const updatedDeliveries = [...db.deliveries.filter((x) => x.id !== rec.id), rec];
      printDocument('delivery', rec, { ...db, deliveries: updatedDeliveries });
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={draft.id ? t('Edit Delivery Slip') : t('Delivery Slip')}
      subtitle={`${retSlip ? `${t('Return Slip')} ${retSlip.no}` : `${t('Invoice')} ${inv?.no || '—'}`} • ${t('customer')} ${cust?.name || '—'} • ${t('stock deducted immediately on save')}`}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Delivery Details: Slip No, Date, Source Doc, Customer & Note */}
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-3.5 text-sm space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {t('Slip No')}
              </label>
              <div className="font-mono font-bold text-slate-800 text-sm py-2 px-3 bg-white border border-slate-200 rounded-xl">
                {draft.no || '(Auto)'}
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  {t('Delivery Date')}
                </label>
                <button
                  type="button"
                  onClick={() => setDraft((p) => ({ ...p, date: todayStr() }))}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                >
                  {t('Today')}
                </button>
              </div>
              <input
                type="date"
                value={draft.date || todayStr()}
                onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-sm bg-white font-medium text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                {retSlip ? t('Return Slip & Customer') : t('Invoice & Customer')}
              </label>
              <div
                className="text-xs text-slate-700 py-2 px-3 bg-white border border-slate-200 rounded-xl break-words"
                title={`${retSlip ? retSlip.no : inv?.no || ''} - ${cust?.name || ''}`}
              >
                <span className="font-mono font-semibold text-slate-900">{retSlip ? retSlip.no : inv?.no || '—'}</span>
                <span className="text-slate-400 mx-1">•</span>
                <span className="font-medium text-slate-800">{cust?.name || '—'}</span>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
              {t('Note')}
            </label>
            <input
              type="text"
              value={draft.note || ''}
              onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))}
              placeholder={t('Delivery remarks, vehicle, driver or notes')}
              className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-sm bg-white font-medium text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Transfer-style Item + Filtered Batch selection table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto md:overflow-visible bg-white dark:bg-slate-900">
          <table className="w-full text-xs">
            <thead className="text-[11px] text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="text-left px-3 py-2.5 rounded-tl-xl min-w-[190px] whitespace-nowrap">{t('Item')}</th>
                <th className="text-left px-2.5 py-2.5 min-w-[190px] sm:w-64 whitespace-nowrap">
                  {globalTrack.trackLot ? t('Batch / Lot') : globalTrack.trackExpiry ? t('Expiry') : t('Stock Record')}
                </th>
                <th className="text-center px-2 py-2.5 w-20 whitespace-nowrap">{t('Available')}</th>
                <th className="text-center px-2 py-2.5 w-28 whitespace-nowrap">{t('Qty')}</th>
                <th className="text-center px-2 py-2.5 min-w-[6.5rem] rounded-tr-xl"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {lineBatches.map((l, idx) => {
                const stockObj = l.stockId ? db.stocks.find((s) => s.id === l.stockId) : undefined;
                const resolvedItemId = l.itemId || stockObj?.itemId || '';
                const itemObj = resolvedItemId ? db.items.find((i) => i.id === resolvedItemId) : undefined;
                const itemBatches = getBatchesForDeliveryItem({
                  branchId: draft.branchId,
                  itemId: resolvedItemId,
                  stocks: db.stocks,
                  selectedStockId: l.stockId,
                  prioritizeFurtherExpiry: Boolean(retSlip),
                });
                const availForStock = stockObj ? r2(stockObj.qty + (oldByStock[stockObj.id] || 0)) : 0;
                const isOverBatch = Boolean(stockObj && l.qty > availForStock + 0.000001);

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    {/* 1. Scoped Item Search (Box 1) */}
                    <td className="px-2.5 py-2 min-w-[190px]">
                      <AutoCompleteBox
                        rows={sourceItemAcRows}
                        placeholder={t('Search item')}
                        defaultValue={itemObj ? itemObj.name : ''}
                        onPick={(row) => handlePickItem(idx, row.id)}
                      />
                    </td>

                    {/* 2. Filtered Batch Dropdown (strictly for this row's item) */}
                    <td className="px-2.5 py-2 min-w-[190px]">
                      <select
                        value={l.stockId}
                        disabled={!resolvedItemId || itemBatches.length === 0}
                        onChange={(e) => {
                          const val = e.target.value;
                          setLineBatches((prev) => {
                            const updated = [...prev];
                            updated[idx] = { ...updated[idx], itemId: resolvedItemId, stockId: val };
                            return updated;
                          });
                        }}
                        className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400"
                      >
                        {!resolvedItemId ? (
                          <option value="">{t('Choose item first')}</option>
                        ) : itemBatches.length === 0 ? (
                          <option value="">{t('No stock in this branch')}</option>
                        ) : (
                          <>
                            <option value="">{t('Choose batch...')}</option>
                            {itemBatches.map((s) => (
                              <option key={s.id} value={s.id}>
                                {formatStockChoiceLabel(s, itemObj, db.settings, fmtDate, t('avail'))}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                    </td>

                    {/* Available Stock */}
                    <td className="px-2 py-2 text-center text-xs tabular-nums">
                      {stockObj ? (
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {availForStock}
                        </span>
                      ) : resolvedItemId && itemBatches.length === 0 ? (
                        <span className="text-rose-500 font-medium">0</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    {/* Quantity */}
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={l.qty || ''}
                        onChange={(e) => {
                          const val = +e.target.value;
                          setLineBatches((prev) => {
                            const updated = [...prev];
                            updated[idx] = { ...updated[idx], qty: val };
                            return updated;
                          });
                        }}
                        className={`border rounded-lg w-full min-w-[6rem] px-2.5 py-1.5 text-center font-semibold text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${
                          isOverBatch
                            ? 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </td>

                    {/* Split lot & Remove actions */}
                    <td className="px-1.5 py-2 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => handleSplitLine(idx)}
                          disabled={!resolvedItemId}
                          title={t('Add another lot / expiry line')}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 px-1.5 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-0.5 cursor-pointer transition-colors whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>{t('Split lot')}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setLineBatches((prev) => prev.filter((_, i) => i !== idx))}
                          title={t('Remove lot line')}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <button
            type="button"
            onClick={handleAddBatchLine}
            className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            {globalTrack.trackLot || globalTrack.trackExpiry ? t('Add another batch line') : t('+ Add line')}
          </button>
          <span className="text-slate-400">
            {retSlip
              ? t('Remaining on return slip shown per item below')
              : t('Remaining on invoice shown per item below')}
          </span>
        </div>

        {/* Remaining to fulfil invoice / return slip table */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
            <span className="font-semibold text-xs text-slate-700 uppercase tracking-wide">
              {retSlip
                ? `${t('Remaining to fulfil return slip')} (${retSlip.no})`
                : `${t('Remaining to fulfil invoice')} ${inv?.no ? `(${inv.no})` : ''}`}
            </span>
            <span className="text-[11px] text-slate-500">
              {t('Deducted in real-time as you pick batch quantities')}
            </span>
          </div>

          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full text-xs">
              <thead className="bg-slate-100/80 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2 min-w-[140px]">{t('Items')}</th>
                  <th className="text-center px-3 py-2 min-w-[88px]">
                    {retSlip ? t('Returned Qty') : t('Invoiced Qty')}
                  </th>
                  {prevDeliveries.map((del) => {
                    const cleanNo = (del.no || '').replace(/-BR\d+-/i, '-').replace(/^DEL-/, '#');
                    return (
                      <th key={del.id} className="text-center px-3 py-2 min-w-[96px] text-slate-600">
                        <div>{cleanNo}</div>
                        <div className="text-[10px] font-normal text-slate-400">{del.date}</div>
                      </th>
                    );
                  })}
                  {attachedCreditNotes.map((cr) => {
                    const cleanCrNo = (cr.no || '').replace(/-BR\d+-/i, '-').replace(/^RIN-/, 'CR#');
                    return (
                      <th key={cr.id} className="text-center px-3 py-2 min-w-[104px] bg-emerald-50 text-emerald-900 border-l border-emerald-200">
                        <div className="font-semibold">{cleanCrNo}</div>
                        <div className="text-[10px] font-normal text-emerald-700">{cr.date} ({t('Credit')})</div>
                      </th>
                    );
                  })}
                  <th className="text-center px-3 py-2 min-w-[110px] bg-blue-50/90 text-blue-900 border-l border-r border-blue-200 font-bold">
                    <div>{draft.no ? `${(draft.no || '').replace(/-BR\d+-/i, '-').replace(/^DEL-/, '#')} ${t('This Slip')}` : t('This Slip')}</div>
                    <div className="text-[10px] font-normal text-blue-600">{draft.date || todayStr()}</div>
                  </th>
                  <th className="text-center px-3 py-2 min-w-[96px] bg-slate-50 text-slate-800 font-bold">
                    <div>{t('Total Remaining')}</div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sourceItemsSummary().map((r) => {
                  const it = db.items.find((i) => i.id === r.itemId);
                  const isOver = r.deliveringNow > r.balanceBefore + 0.000001;
                  const isFulfilled = !isOver && r.remainingAfter <= 0.005;

                  return (
                    <tr key={r.itemId} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2 font-medium text-slate-800">
                        {it?.name || r.itemId}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-slate-700">
                        {r.sourceQty}
                      </td>
                      {r.priorHistory.map((ph, idx) => (
                        <td key={idx} className="px-3 py-2 text-center text-slate-600 font-medium">
                          {ph.qtyInDel}
                        </td>
                      ))}
                      {r.creditHistory?.map((ch, idx) => (
                        <td key={idx} className="px-3 py-2 text-center text-emerald-800 font-semibold bg-emerald-50/50 border-l border-emerald-100">
                          {ch.qtyInCr > 0 ? ch.qtyInCr : '0'}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold bg-blue-50/60 border-l border-r border-blue-200 text-blue-900">
                        {r.deliveringNow}
                      </td>
                      <td className="px-3 py-2 text-center font-bold">
                        {isOver ? (
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] bg-rose-100 text-rose-700 font-semibold">
                            {retSlip ? t('Exceeds Returned') : t('Exceeds Invoiced')} (+{r2(r.deliveringNow - r.balanceBefore)})
                          </span>
                        ) : isFulfilled ? (
                          <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-emerald-100 text-emerald-700 font-bold">
                            {t('Fulfilled')}
                          </span>
                        ) : (
                          <span className="text-rose-700 font-bold">
                            {Math.max(0, r.remainingAfter)}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={() => handleSaveAndPrint(false)}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
