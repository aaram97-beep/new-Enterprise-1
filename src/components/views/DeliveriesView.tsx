import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmtDate, diffDays, todayStr, r2 } from '../../utils/formatters';
import { deliveredOf, returnSlipItemRemaining } from '../../utils/calculations';
import { printDocument } from '../../utils/printService';
import { exportCSV } from '../../utils/exportImport';
import { formatLineBatchExpirySuffix } from '../../utils/tracking';
import { Download, Printer, Edit2, Trash2, Send, Calendar, Check, X } from 'lucide-react';
import type { Delivery, Invoice, ReturnSlip } from '../../types';

interface DeliveriesViewProps {
  onNewDeliveryForInvoice: (inv: Invoice) => void;
  onNewDeliveryForReturnSlip: (slip: ReturnSlip) => void;
  onEditDelivery: (del: Delivery) => void;
}

export const DeliveriesView: React.FC<DeliveriesViewProps> = ({
  onNewDeliveryForInvoice,
  onNewDeliveryForReturnSlip,
  onEditDelivery,
}) => {
  const { db, saveDelivery, deleteDelivery, sessionUser, toastMsg, t, canDelete, canEdit } = useIMS();
  const [promFilter, setPromFilter] = useState('');
  const [deliveryFilter, setDeliveryFilter] = useState('');
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [editingDateValue, setEditingDateValue] = useState<string>('');
  const today = todayStr();

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const invoiceById = (id?: string) => (id ? db.invoices.find((x) => x.id === id) || null : null);

  // Delivery Backlog calculation
  let backlogRows: {
    key: string;
    invoiceId: string | null;
    returnSlipId?: string | null;
    invoiceNo: string;
    date: string;
    customerId: string;
    itemId: string;
    rem: number;
    days: number;
    returned: boolean;
  }[] = [];

  db.invoices.forEach((inv) => {
    inv.lines.forEach((l, ix) => {
      if (!l.itemId) return;
      const rem = (+l.qty || 0) - deliveredOf(db, inv.id, l.itemId, null);
      if (rem > 0.005) {
        backlogRows.push({
          key: `p-${inv.id}-${ix}`,
          invoiceId: inv.id,
          invoiceNo: inv.no,
          date: inv.date,
          customerId: inv.customerId,
          itemId: l.itemId,
          rem,
          days: diffDays(today, inv.date),
          returned: false,
        });
      }
    });
  });

  db.returnSlips.forEach((s) => {
    s.lines.forEach((l, ix) => {
      if (!l.itemId) return;
      const rem = returnSlipItemRemaining(db, s.id, l.itemId, +l.qty || 0);
      if (rem > 0.005) {
        backlogRows.push({
          key: `r-${s.id}-${ix}`,
          invoiceId: null,
          returnSlipId: s.id,
          invoiceNo: s.no,
          date: s.date,
          customerId: s.customerId,
          itemId: l.itemId,
          rem,
          days: diffDays(today, s.date),
          returned: true,
        });
      }
    });
  });

  const q = promFilter.trim().toLowerCase();
  if (q) {
    backlogRows = backlogRows.filter(
      (r) =>
        customerName(r.customerId).toLowerCase().includes(q) ||
        itemName(r.itemId).toLowerCase().includes(q) ||
        (r.invoiceNo || '').toLowerCase().includes(q)
    );
  }
  backlogRows.sort((a, b) => b.days - a.days);

  // Delivery Slips
  const myDeliveries = ((): Delivery[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.deliveries;
    return db.deliveries.filter((d) => (sessionUser.branchIds || []).includes(d.branchId));
  })();
  let deliverySlips = myDeliveries.slice().reverse();

  const dq = deliveryFilter.trim().toLowerCase();
  if (dq) {
    deliverySlips = deliverySlips.filter((d) => {
      const invNo = (d.invoiceId ? invoiceById(d.invoiceId)?.no : '') || '';
      const retNo =
        (d.returnSlipId ? db.returnSlips.find((rs) => rs.id === d.returnSlipId)?.no : '') || '';
      const cust = customerName(d.customerId).toLowerCase();
      const note = (d.note || '').toLowerCase();
      const no = (d.no || '').toLowerCase();
      const date = (d.date || '').toLowerCase();
      const hasItem = d.lines.some(
        (l) =>
          itemName(l.itemId).toLowerCase().includes(dq) ||
          (l.batchNo || '').toLowerCase().includes(dq)
      );
      return (
        no.includes(dq) ||
        invNo.toLowerCase().includes(dq) ||
        retNo.toLowerCase().includes(dq) ||
        cust.includes(dq) ||
        note.includes(dq) ||
        date.includes(dq) ||
        hasItem
      );
    });
  }

  const handleExportBacklog = () => {
    exportCSV(
      'delivery-backlog',
      backlogRows.map((r) => ({
        invoice: r.invoiceNo,
        date: r.date,
        owedTo: customerName(r.customerId),
        item: itemName(r.itemId),
        remaining: r.rem,
        daysOld: r.days,
        returned: r.returned ? 'yes' : 'no',
      }))
    );
  };

  const handleExportDeliveries = () => {
    exportCSV(
      'deliveries',
      deliverySlips.map((d) => ({
        no: d.no,
        date: d.date,
        invoice:
          (d.invoiceId ? invoiceById(d.invoiceId)?.no : '') ||
          (d.returnSlipId ? db.returnSlips.find((rs) => rs.id === d.returnSlipId)?.no : '') ||
          '',
        customer: customerName(d.customerId),
        note: d.note || '',
        lines: d.lines
          .map((l) => {
            const it = db.items.find((i) => i.id === l.itemId);
            return `${itemName(l.itemId)} x${l.qty}${formatLineBatchExpirySuffix(
              l.batchNo,
              l.expiry,
              it,
              db.settings,
              fmtDate
            )}`;
          })
          .join(' | '),
      }))
    );
  };

  const handleSaveDate = (d: Delivery) => {
    if (!editingDateValue) {
      toastMsg(t('Please select a valid date'), 'error');
      return;
    }
    const updated: Delivery = {
      ...d,
      date: editingDateValue,
    };
    const res = saveDelivery(updated);
    if (res && !res.ok) {
      toastMsg(res.error || t('Failed to update date'), 'error');
      return;
    }
    toastMsg(t('Delivery date updated'));
    setEditingDateId(null);
  };

  return (
    <div className="space-y-4">
      {/* Backlog Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
              <span>{t('Delivery Backlog')}</span>
              <span className="text-xs font-normal text-slate-400 hidden sm:inline">
                {t('what we still owe to customers')}
              </span>
            </h2>
          </div>
          <input
            type="text"
            value={promFilter}
            onChange={(e) => setPromFilter(e.target.value)}
            placeholder={t('Search customer / item')}
            className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm flex-1 min-w-[160px] sm:flex-none sm:w-48 bg-white"
          />
          <button
            type="button"
            onClick={handleExportBacklog}
            title="Export CSV"
            className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Backlog List */}
        <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
          {backlogRows.map((r) => (
            <div
              key={r.key}
              className={`p-3.5 space-y-2 ${r.returned ? 'bg-slate-50/70' : ''}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{r.invoiceNo}</span>
                    <span className="text-xs text-slate-500">{fmtDate(r.date)}</span>
                    {r.returned && (
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {t('returned')}
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5">
                    {customerName(r.customerId)}
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{itemName(r.itemId)}</div>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                    r.days > 30 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {r.days}d
                </span>
              </div>

              <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span className="text-slate-500">{t('Qty Remaining')}</span>
                <span className="font-bold text-indigo-600 tabular-nums">{r.rem}</span>
              </div>

              {(r.returned || r.invoiceId) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  {r.returned ? (
                    <button
                      type="button"
                      onClick={() => {
                        const slip = db.returnSlips.find(
                          (x) => x.id === r.returnSlipId || x.no === r.invoiceNo
                        );
                        if (slip) onNewDeliveryForReturnSlip(slip);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {t('Deliver replacement')}
                    </button>
                  ) : r.invoiceId ? (
                    <button
                      type="button"
                      onClick={() => {
                        const inv = invoiceById(r.invoiceId!);
                        if (inv) onNewDeliveryForInvoice(inv);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {t('Deliver now')}
                    </button>
                  ) : null}
                </div>
              )}
            </div>
          ))}
          {backlogRows.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              {t('No delivery backlog   everything delivered.')}
            </div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('Invoice')}</th>
                <th className="text-left px-3 py-2.5">{t('Date')}</th>
                <th className="text-left px-3 py-2.5">{t('Owed To')}</th>
                <th className="text-left px-3 py-2.5">{t('Item')}</th>
                <th className="text-center px-3 py-2.5">{t('Qty Remaining')}</th>
                <th className="text-center px-3 py-2.5">{t('Age')}</th>
                <th className="text-right px-4 py-2.5">{t('Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {backlogRows.map((r) => (
                <tr
                  key={r.key}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    r.returned ? 'bg-slate-50/60' : ''
                  }`}
                >
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {r.invoiceNo}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {customerName(r.customerId)}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {itemName(r.itemId)}
                  </td>
                  <td className="text-center py-2.5 font-bold text-indigo-600">
                    {r.rem}
                    {r.returned && (
                      <span className="ml-2 text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                        {t('returned')}
                      </span>
                    )}
                  </td>
                  <td className="text-center py-2.5 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        r.days > 30 ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {r.days}d
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs">
                    {r.returned ? (
                      <button
                        type="button"
                        onClick={() => {
                          const slip = db.returnSlips.find(
                            (x) => x.id === r.returnSlipId || x.no === r.invoiceNo
                          );
                          if (slip) onNewDeliveryForReturnSlip(slip);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {t('Deliver replacement')}
                      </button>
                    ) : r.invoiceId ? (
                      <button
                        type="button"
                        onClick={() => {
                          const inv = invoiceById(r.invoiceId!);
                          if (inv) onNewDeliveryForInvoice(inv);
                        }}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {t('Deliver now')}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
              {backlogRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                    {t('No delivery backlog   everything delivered.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delivery Slips Register */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-bold text-base md:text-lg text-slate-900">
              {t('Delivery Slips')}
            </h2>
          </div>
          <input
            type="text"
            value={deliveryFilter}
            onChange={(e) => setDeliveryFilter(e.target.value)}
            placeholder={t('Search slips / customer / item')}
            className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm flex-1 min-w-[160px] sm:flex-none sm:w-64 bg-white"
          />
          <button
            type="button"
            onClick={handleExportDeliveries}
            title="Export CSV"
            className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>

        {/* Mobile Delivery Slips List */}
        <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
          {deliverySlips.map((d) => (
            <div key={d.id} className="p-3.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{d.no}</span>
                    {editingDateId === d.id ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="date"
                          value={editingDateValue}
                          onChange={(e) => setEditingDateValue(e.target.value)}
                          className="border border-blue-500 rounded-lg px-2 py-0.5 text-xs bg-white font-medium text-slate-800"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveDate(d)}
                          title={t('Save')}
                          className="p-1 rounded-lg bg-blue-600 text-white cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDateId(null)}
                          title={t('Cancel')}
                          className="p-1 rounded-lg bg-slate-200 text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-500">{fmtDate(d.date)}</span>
                        {canEdit('deliveries') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDateId(d.id);
                              setEditingDateValue(d.date || todayStr());
                            }}
                            title={t('Edit Date')}
                            className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5">
                    {customerName(d.customerId)}
                  </div>
                  {d.note && (
                    <div className="text-[11px] text-slate-400 italic mt-0.5 break-words">{d.note}</div>
                  )}
                </div>
                <div className="shrink-0 font-mono text-xs text-slate-600">
                  {d.invoiceId ? (
                    invoiceById(d.invoiceId)?.no || '—'
                  ) : d.returnSlipId ? (
                    <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-semibold">
                      {(db.returnSlips.find((x) => x.id === d.returnSlipId) || {}).no || '—'}
                    </span>
                  ) : (
                    '—'
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2 break-words">
                {d.lines
                  .map((l) => {
                    const it = db.items.find((i) => i.id === l.itemId);
                    return `${itemName(l.itemId)} ×${l.qty}${formatLineBatchExpirySuffix(
                      l.batchNo,
                      l.expiry,
                      it,
                      db.settings,
                      fmtDate
                    )}`;
                  })
                  .join(', ')}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => printDocument('delivery', d, db)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  {t('Print')}
                </button>
                {canEdit('deliveries') && (
                  <button
                    type="button"
                    onClick={() => onEditDelivery(d)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    {t('Edit')}
                  </button>
                )}
                {canDelete('deliveries') && (
                  <button
                    type="button"
                    onClick={() => deleteDelivery(d)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('Del')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {deliverySlips.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">{t('No delivery slips.')}</div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('No')}</th>
                <th className="text-left px-3 py-2.5">{t('Date')}</th>
                <th className="text-left px-3 py-2.5">{t('Invoice / Return')}</th>
                <th className="text-left px-3 py-2.5">{t('Customer')}</th>
                <th className="text-left px-3 py-2.5">{t('Lines')}</th>
                <th className="text-right px-4 py-2.5">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {deliverySlips.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {d.no}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {editingDateId === d.id ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="date"
                          value={editingDateValue}
                          onChange={(e) => setEditingDateValue(e.target.value)}
                          className="border border-blue-500 rounded-lg px-2 py-1 text-xs bg-white font-medium text-slate-800 shadow-2xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveDate(d)}
                          title={t('Save')}
                          className="p-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer shadow-2xs"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDateId(null)}
                          title={t('Cancel')}
                          className="p-1 rounded-lg bg-slate-200 text-slate-600 hover:bg-slate-300 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 group">
                        <span className="text-slate-600 font-medium">{fmtDate(d.date)}</span>
                        {canEdit('deliveries') && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingDateId(d.id);
                              setEditingDateValue(d.date || todayStr());
                            }}
                            title={t('Edit Date')}
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-opacity cursor-pointer"
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                    {d.invoiceId ? (
                      invoiceById(d.invoiceId)?.no || '—'
                    ) : d.returnSlipId ? (
                      <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded font-semibold">
                        {(db.returnSlips.find((x) => x.id === d.returnSlipId) || {}).no || '—'}
                        <span className="text-[10px] text-purple-500 font-normal uppercase">({t('Return')})</span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    <div>{customerName(d.customerId)}</div>
                    {d.note && (
                      <div className="text-[11px] text-slate-400 font-normal italic truncate max-w-[200px]" title={d.note}>
                        {d.note}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 max-w-sm truncate">
                    {d.lines
                      .map((l) => {
                        const it = db.items.find((i) => i.id === l.itemId);
                        return `${itemName(l.itemId)} ×${l.qty}${formatLineBatchExpirySuffix(
                          l.batchNo,
                          l.expiry,
                          it,
                          db.settings,
                          fmtDate
                        )}`;
                      })
                      .join(', ')}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    <button
                      type="button"
                      onClick={() => printDocument('delivery', d, db)}
                      className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Print')}
                    </button>
                    {canEdit('deliveries') && (
                      <button
                        type="button"
                        onClick={() => onEditDelivery(d)}
                        className="text-slate-600 hover:text-slate-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('Edit')}
                      </button>
                    )}
                    {canDelete('deliveries') && (
                      <button
                        type="button"
                        onClick={() => deleteDelivery(d)}
                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Del')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {deliverySlips.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">
                    {t('No delivery slips.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
