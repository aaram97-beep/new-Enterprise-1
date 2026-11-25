import React, { useState, useEffect, useMemo } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { calcInvoice, lineNet } from '../../utils/calculations';
import { r2, fmt, fmtDate, todayStr, uid, parseDiscountInput } from '../../utils/formatters';
import {
  formatStockChoiceLabel,
  getGlobalTrackFlags,
  resolveItemTracking,
} from '../../utils/tracking';
import {
  buildVirtualStocksForInvoiceEdit,
  getDirectSaleBatchesForItem,
  processDirectSaleInvoiceStock,
  resolveInitialStockIdForInvoiceLine,
} from '../../utils/directSale';
import type { Invoice, InvoiceLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
}

export const InvoiceModal: React.FC<InvoiceModalProps> = ({ isOpen, onClose, invoice }) => {
  const { db, branchId, saveInvoice, nextNo, toastMsg, stockOf, t } = useIMS();
  const [draft, setDraft] = useState<Invoice>(invoice);
  const isDirectSale = db.settings.directSaleMode === true;

  const virtualStocks = useMemo(
    () =>
      isDirectSale
        ? buildVirtualStocksForInvoiceEdit(db.stocks, db.deliveries, invoice.id || draft.id)
        : db.stocks,
    [isDirectSale, db.stocks, db.deliveries, invoice.id, draft.id]
  );

  useEffect(() => {
    const activeBranch = invoice.branchId || branchId;
    const vStocks = isDirectSale
      ? buildVirtualStocksForInvoiceEdit(db.stocks, db.deliveries, invoice.id)
      : db.stocks;
    const lines = invoice.lines?.length
      ? invoice.lines.map((l) => {
          if (!isDirectSale || !l.itemId) return l;
          const itemObj = db.items.find((i) => i.id === l.itemId);
          const resolvedStockId = resolveInitialStockIdForInvoiceLine({
            line: l,
            branchId: activeBranch,
            virtualStocks: vStocks,
            settings: db.settings,
            item: itemObj,
          });
          return { ...l, stockId: resolvedStockId || l.stockId };
        })
      : [{ itemId: null, qty: 1, price: 0, discType: 'pct' as const, discVal: 0 }];

    setDraft({
      ...invoice,
      branchId: activeBranch,
      date: invoice.date || todayStr(),
      lines,
    });
  }, [invoice, branchId, isOpen, isDirectSale, db.stocks, db.deliveries, db.items, db.settings]);

  const directBranchStockOf = (itemId: string | null | undefined, bId: string): number => {
    if (!itemId) return 0;
    if (!isDirectSale) return stockOf(itemId, bId);
    return r2(
      virtualStocks
        .filter((s) => s.itemId === itemId && s.branchId === bId)
        .reduce((sum, s) => sum + (+s.qty || 0), 0)
    );
  };

  const customerAcRows = db.customers.map((c) => ({
    id: c.id,
    label: c.name,
    sub: `${c.phone || ''}${c.isProvider ? '   provider' : ''}`.trim(),
    code: c.phone || '',
  }));

  const itemAcRows = db.items.map((i) => ({
    id: i.id,
    label: i.name,
    sub: `${i.sku || ''}   stock ${directBranchStockOf(i.id, draft.branchId)}`,
    code: i.barcode || i.sku || '',
  }));

  const selectedCustomer = db.customers.find((c) => c.id === draft.customerId);
  const totals = calcInvoice(draft, db.settings.taxRate);

  const globalTrack = getGlobalTrackFlags(db.settings);
  const anyPickedItemTracksBatch = draft.lines.some((l) => {
    if (!l.itemId) return false;
    const it = db.items.find((i) => i.id === l.itemId);
    return resolveItemTracking(db.settings, it).mode !== 'none';
  });
  const hasAnyPickedItem = draft.lines.some((l) => Boolean(l.itemId));
  const showBatchCol = Boolean(
    isDirectSale &&
      (anyPickedItemTracksBatch || (!hasAnyPickedItem && globalTrack.mode !== 'none'))
  );

  // Track total qty requested per stockId across all lines so duplicate batch picks show over-allocation clearly
  const qtyByStockId: Record<string, number> = {};
  if (isDirectSale) {
    draft.lines.forEach((l) => {
      if (l.stockId && r2(l.qty) > 0) {
        qtyByStockId[l.stockId] = r2((qtyByStockId[l.stockId] || 0) + r2(l.qty));
      }
    });
  }

  const handleLineChange = (index: number, patch: Partial<InvoiceLine>) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], ...patch };
      return { ...prev, lines };
    });
  };

  const handlePickItem = (index: number, itemId: string) => {
    const it = db.items.find((i) => i.id === itemId);
    let nextStockId = '';
    if (isDirectSale && it) {
      const track = resolveItemTracking(db.settings, it);
      if (track.mode !== 'none') {
        const batches = getDirectSaleBatchesForItem(virtualStocks, draft.branchId, itemId);
        // Prefer an unassigned batch if another line already took the first one
        const usedIds = new Set(
          draft.lines
            .filter((l, i) => i !== index && l.itemId === itemId && l.stockId)
            .map((l) => l.stockId as string)
        );
        const preferred = batches.find((b) => !usedIds.has(b.id)) || batches[0];
        nextStockId = preferred ? preferred.id : '';
      }
    }
    handleLineChange(index, {
      itemId,
      price: it ? it.price : 0,
      stockId: nextStockId || undefined,
      batchNo: undefined,
      expiry: undefined,
      cost: undefined,
    });
  };

  const handleAddLine = () => {
    setDraft((prev) => ({
      ...prev,
      lines: [...prev.lines, { itemId: null, qty: 1, price: 0, discType: 'pct', discVal: 0 }],
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
      toastMsg(t('Choose a customer first'), 'error');
      return;
    }
    const validLines = draft.lines.filter((l) => l.itemId && r2(l.qty) > 0);
    if (!validLines.length) {
      toastMsg(t('Add at least one line with an item and quantity'), 'error');
      return;
    }

    const activeBranch = draft.branchId || branchId;

    // Validate direct-sale stock BEFORE allocating an invoice number
    if (isDirectSale) {
      const probeInv: Invoice = {
        id: draft.id || 'probe-inv',
        no: draft.no || 'INV-PROBE',
        customerId: draft.customerId,
        branchId: activeBranch,
        date: draft.date || todayStr(),
        note: draft.note || '',
        lines: validLines,
        orderDiscType: draft.orderDiscType,
        orderDiscVal: r2(draft.orderDiscVal),
        sub: totals.sub,
        discAmt: totals.discAmt,
        tax: totals.tax,
        total: totals.total,
      };
      const check = processDirectSaleInvoiceStock({
        settings: db.settings,
        items: db.items,
        stocks: db.stocks,
        deliveries: db.deliveries,
        inv: probeInv,
        deliveryNo: 'DEL-PROBE',
      });
      if (!check.ok) {
        toastMsg(check.error, 'error');
        return;
      }
    }

    const rec: Invoice = {
      id: draft.id || uid(),
      no: draft.no || nextNo(activeBranch, 'INV'),
      customerId: draft.customerId,
      branchId: activeBranch,
      date: draft.date || todayStr(),
      note: draft.note || '',
      lines: validLines.map((l) => ({
        itemId: l.itemId,
        qty: r2(l.qty),
        price: r2(l.price),
        discType: l.discType,
        discVal: r2(l.discVal),
        ...(isDirectSale && l.stockId ? { stockId: l.stockId } : {}),
        ...(isDirectSale && l.batchNo !== undefined ? { batchNo: l.batchNo } : {}),
        ...(isDirectSale && l.expiry !== undefined ? { expiry: l.expiry } : {}),
        ...(isDirectSale && l.cost !== undefined ? { cost: l.cost } : {}),
      })),
      orderDiscType: draft.orderDiscType,
      orderDiscVal: r2(draft.orderDiscVal),
      sub: totals.sub,
      discAmt: totals.discAmt,
      tax: totals.tax,
      total: totals.total,
    };

    const res = saveInvoice(rec);
    if (res.ok) onClose();
  };

  const batchColLabel =
    globalTrack.trackLot && globalTrack.trackExpiry
      ? t('Batch / Lot')
      : globalTrack.trackLot
      ? t('Lot / Batch')
      : t('Expiry');

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('Invoice')}`}
      subtitle={isDirectSale ? t('Stock deducted immediately on save') : undefined}
      maxWidth={showBatchCol ? 'max-w-6xl' : 'max-w-5xl'}
    >
      <div className="space-y-4">
        {/* Customer & Date */}
        <div className="grid sm:grid-cols-3 gap-3 text-sm relative z-30">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Customer')}
            </label>
            <AutoCompleteBox
              rows={customerAcRows}
              placeholder={t('Search customer')}
              defaultValue={selectedCustomer ? selectedCustomer.name : ''}
              onPick={(row) => setDraft((prev) => ({ ...prev, customerId: row.id }))}
            />
            {selectedCustomer && (
              <div className="text-[11px] text-slate-500 mt-1">
                {t('Selected:')} <b>{selectedCustomer.name}</b> {selectedCustomer.phone && `(${selectedCustomer.phone})`}
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
              onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        {/* Mobile Line Item Cards (prevents horizontal clipping at narrow viewports) */}
        <div className="md:hidden space-y-2.5">
          {draft.lines.map((line, idx) => {
            const itemObj = db.items.find((i) => i.id === line.itemId);
            const rowTrack = resolveItemTracking(db.settings, itemObj);
            const rowNeedsBatch = Boolean(isDirectSale && line.itemId && rowTrack.mode !== 'none');
            const itemBatches = rowNeedsBatch
              ? getDirectSaleBatchesForItem(virtualStocks, draft.branchId, line.itemId, line.stockId)
              : [];
            const selectedStock = line.stockId
              ? virtualStocks.find((s) => s.id === line.stockId)
              : undefined;
            const availForBatch = selectedStock ? r2(selectedStock.qty) : 0;
            const allocatedInBatch = line.stockId ? qtyByStockId[line.stockId] || 0 : 0;
            const isOverBatch = Boolean(
              rowNeedsBatch && selectedStock && allocatedInBatch > availForBatch + 0.000001
            );
            const totalBranchAvail = directBranchStockOf(line.itemId, draft.branchId);
            const isOverTotal = Boolean(
              isDirectSale && !rowNeedsBatch && line.itemId && r2(line.qty) > totalBranchAvail + 0.000001
            );

            return (
              <div
                key={`mob-${idx}`}
                className="border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-900 space-y-2.5"
              >
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">
                      {t('Item')} #{idx + 1}
                    </div>
                    <AutoCompleteBox
                      rows={itemAcRows}
                      placeholder={t('Item')}
                      defaultValue={itemObj ? itemObj.name : ''}
                      onPick={(row) => handlePickItem(idx, row.id)}
                    />
                    {line.itemId && (
                      <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                        {itemObj?.name}   stock {totalBranchAvail}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`${t('Del')} ${itemObj?.name || idx + 1}`}
                    onClick={() => handleRemoveLine(idx)}
                    className="text-slate-400 hover:text-rose-600 p-1.5 mt-4 cursor-pointer transition-colors shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {showBatchCol && rowNeedsBatch && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">
                      {batchColLabel}
                    </div>
                    <select
                      aria-label={`${t('Batch')} ${itemObj?.name || ''} mobile`.trim()}
                      value={line.stockId || ''}
                      disabled={itemBatches.length === 0}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        const pickedBatch = virtualStocks.find((s) => s.id === nextId);
                        handleLineChange(idx, {
                          stockId: nextId || undefined,
                          batchNo: pickedBatch?.batchNo,
                          expiry: pickedBatch?.expiry,
                          cost: pickedBatch?.cost,
                        });
                      }}
                      className={`w-full border rounded-lg px-2.5 py-2 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400 ${
                        !line.stockId || isOverBatch
                          ? 'border-rose-400'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {itemBatches.length === 0 ? (
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
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">{t('Qty')}</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`${t('Qty')} line ${idx + 1}`}
                      value={line.qty || ''}
                      onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                      className={`border rounded-lg w-full px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${
                        isOverBatch || isOverTotal
                          ? 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'
                          : 'border-slate-300 dark:border-slate-700'
                      }`}
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">{t('Price')}</div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      aria-label={`${t('Price')} line ${idx + 1}`}
                      value={line.price || ''}
                      onChange={(e) => handleLineChange(idx, { price: +e.target.value })}
                      className="border border-slate-300 dark:border-slate-700 rounded-lg w-full px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase text-slate-400 mb-1">{t('Net')}</div>
                    <div className="h-[34px] px-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-end font-semibold text-slate-900 dark:text-slate-100 text-sm tabular-nums">
                      {fmt(lineNet(line))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase text-slate-400 shrink-0">{t('Disc')}</span>
                  <select
                    aria-label={`${t('Disc')} type line ${idx + 1}`}
                    value={line.discType}
                    onChange={(e) => handleLineChange(idx, { discType: e.target.value as 'pct' | 'amt' })}
                    className="border border-slate-300 dark:border-slate-700 rounded-md text-xs px-2 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer shrink-0"
                  >
                    <option value="pct">%</option>
                    <option value="amt">{t('fix')}</option>
                  </select>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={9999999}
                    aria-label={`${t('Disc')} value line ${idx + 1}`}
                    value={line.discVal || ''}
                    onChange={(e) => {
                      const { display, numeric } = parseDiscountInput(e.target.value, 7);
                      if (e.target.value !== display) e.target.value = display;
                      handleLineChange(idx, { discVal: numeric });
                    }}
                    className="border border-slate-300 dark:border-slate-700 rounded-lg flex-1 px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop Lines table */}
        <div className="hidden md:block border border-slate-200 rounded-xl md:overflow-visible bg-white">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="rounded-tl-xl text-left px-3 py-2.5 min-w-[200px]">{t('Item')}</th>
                {showBatchCol && (
                  <th className="text-left px-2 py-2.5 min-w-[240px] w-64">{batchColLabel}</th>
                )}
                <th className="text-center px-2 py-2.5 w-24">{t('Qty')}</th>
                <th className="text-center px-2 py-2.5 w-28">{t('Price')}</th>
                <th className="text-center px-2 py-2.5 w-36">{t('Disc')}</th>
                <th className="text-right px-3 py-2.5 w-28">{t('Net')}</th>
                <th className="rounded-tr-xl w-9 px-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map((line, idx) => {
                const itemObj = db.items.find((i) => i.id === line.itemId);
                const rowTrack = resolveItemTracking(db.settings, itemObj);
                const rowNeedsBatch = Boolean(isDirectSale && line.itemId && rowTrack.mode !== 'none');
                const itemBatches = rowNeedsBatch
                  ? getDirectSaleBatchesForItem(virtualStocks, draft.branchId, line.itemId, line.stockId)
                  : [];
                const selectedStock = line.stockId
                  ? virtualStocks.find((s) => s.id === line.stockId)
                  : undefined;
                const availForBatch = selectedStock ? r2(selectedStock.qty) : 0;
                const allocatedInBatch = line.stockId ? qtyByStockId[line.stockId] || 0 : 0;
                const isOverBatch = Boolean(
                  rowNeedsBatch && selectedStock && allocatedInBatch > availForBatch + 0.000001
                );
                const totalBranchAvail = directBranchStockOf(line.itemId, draft.branchId);
                const isOverTotal = Boolean(
                  isDirectSale && !rowNeedsBatch && line.itemId && r2(line.qty) > totalBranchAvail + 0.000001
                );

                return (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 [&>td]:align-top">
                    <td className="px-2.5 py-2 min-w-[200px]">
                      <AutoCompleteBox
                        rows={itemAcRows}
                        placeholder={t('Item')}
                        defaultValue={itemObj ? itemObj.name : ''}
                        onPick={(row) => handlePickItem(idx, row.id)}
                      />
                      {line.itemId && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                          {itemObj?.name}   stock {totalBranchAvail}
                        </div>
                      )}
                    </td>

                    {showBatchCol && (
                      <td className="px-2 py-2 min-w-[240px]">
                        {rowNeedsBatch ? (
                          <select
                            aria-label={`${t('Batch')} ${itemObj?.name || ''}`.trim()}
                            value={line.stockId || ''}
                            disabled={itemBatches.length === 0}
                            onChange={(e) => {
                              const nextId = e.target.value;
                              const pickedBatch = virtualStocks.find((s) => s.id === nextId);
                              handleLineChange(idx, {
                                stockId: nextId || undefined,
                                batchNo: pickedBatch?.batchNo,
                                expiry: pickedBatch?.expiry,
                                cost: pickedBatch?.cost,
                              });
                            }}
                            className={`w-full border rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-800/50 disabled:text-slate-400 ${
                              !line.stockId || isOverBatch
                                ? 'border-rose-400'
                                : 'border-slate-300 dark:border-slate-700'
                            }`}
                          >
                            {itemBatches.length === 0 ? (
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
                        ) : (
                          <div className="text-center text-xs text-slate-400 py-1.5">—</div>
                        )}
                      </td>
                    )}

                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`${t('Qty')} ${itemObj?.name || idx + 1}`}
                        value={line.qty || ''}
                        onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                        className={`border rounded-lg w-24 px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 ${
                          isOverBatch || isOverTotal
                            ? 'border-rose-500 text-rose-600 bg-rose-50 dark:bg-rose-950/30'
                            : 'border-slate-300 dark:border-slate-700'
                        }`}
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`${t('Price')} ${itemObj?.name || idx + 1}`}
                        value={line.price || ''}
                        onChange={(e) => handleLineChange(idx, { price: +e.target.value })}
                        className="border border-slate-300 dark:border-slate-700 rounded-lg w-28 px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <select
                          aria-label={`${t('Disc')} type ${idx + 1}`}
                          value={line.discType}
                          onChange={(e) => handleLineChange(idx, { discType: e.target.value as 'pct' | 'amt' })}
                          className="border border-slate-300 dark:border-slate-700 rounded-md text-xs px-1.5 py-1.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer shrink-0"
                        >
                          <option value="pct">%</option>
                          <option value="amt">{t('fix')}</option>
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={9999999}
                          aria-label={`${t('Disc')} ${itemObj?.name || idx + 1}`}
                          value={line.discVal || ''}
                          onChange={(e) => {
                            const { display, numeric } = parseDiscountInput(e.target.value, 7);
                            if (e.target.value !== display) e.target.value = display;
                            handleLineChange(idx, { discVal: numeric });
                          }}
                          className="border border-slate-300 dark:border-slate-700 rounded-lg w-24 shrink-0 px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2 pt-3.5 text-right font-semibold text-slate-900 dark:text-slate-100 text-sm tabular-nums whitespace-nowrap">
                      {fmt(lineNet(line))}
                    </td>
                    <td className="px-1 py-2 pt-3 text-center">
                      <button
                        type="button"
                        aria-label={`${t('Del')} ${itemObj?.name || idx + 1}`}
                        onClick={() => handleRemoveLine(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
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

        {/* Add line & Order discount */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={handleAddLine}
            className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add line')}
          </button>
          <div className="flex items-center gap-2">
            <span className="text-slate-600 font-medium">Order discount:</span>
            <select
              value={draft.orderDiscType}
              onChange={(e) => setDraft((p) => ({ ...p, orderDiscType: e.target.value as 'pct' | 'amt' }))}
              className="border border-slate-300 rounded-md px-1.5 py-1 bg-white"
            >
              <option value="pct">%</option>
              <option value="amt">{t('fix')}</option>
            </select>
            <input
              type="number"
              step="0.01"
              min="0"
              max={9999999}
              value={draft.orderDiscVal || ''}
              onChange={(e) => {
                const { display, numeric } = parseDiscountInput(e.target.value, 7);
                if (e.target.value !== display) e.target.value = display;
                setDraft((p) => ({ ...p, orderDiscVal: numeric }));
              }}
              className="border border-slate-300 rounded-lg w-24 px-2 py-1.5 text-center text-sm font-medium tabular-nums bg-white"
            />
          </div>
        </div>

        {/* Note / Remarks */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Note')}
          </label>
          <input
            type="text"
            value={draft.note || ''}
            onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
            placeholder={
              isDirectSale
                ? t('Order notes, terms, or remarks')
                : t('Order notes, terms, delivery instructions, or remarks')
            }
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        {/* Summary totals */}
        <div className="flex flex-wrap justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200 text-sm">
          <div className="text-xs text-slate-500 space-x-2">
            <span>Sub: {fmt(totals.sub)}</span>
            <span>  Disc: {fmt(totals.discAmt)}</span>
            <span>  Tax: {fmt(totals.tax)}</span>
          </div>
          <div className="text-lg font-bold text-slate-900">
            {t('Total')}: {fmt(totals.total)}
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
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {t('Save Invoice')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
