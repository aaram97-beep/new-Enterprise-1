import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate } from '../../utils/formatters';
import { invoiceTotal, paidOfInvoice, invBalance, deliverPct } from '../../utils/calculations';
import { printDocument } from '../../utils/printService';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, Printer, Edit2, Trash2, Send } from 'lucide-react';
import type { Invoice } from '../../types';

interface InvoicesViewProps {
  onNewInvoice: () => void;
  onEditInvoice: (inv: Invoice) => void;
  onNewDelivery: (inv: Invoice) => void;
  onPayInvoice: (inv: Invoice) => void;
}

export const InvoicesView: React.FC<InvoicesViewProps> = ({
  onNewInvoice,
  onEditInvoice,
  onNewDelivery,
  onPayInvoice,
}) => {
  const { db, deleteInvoice, sessionUser, t, canDelete, canEdit, canAccess } = useIMS();
  const isDirectSale = db.settings.directSaleMode === true;
  const canPaybook = canAccess('paybook');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const myInvoices = ((): Invoice[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.invoices;
    return db.invoices.filter((x) => (sessionUser.branchIds || []).includes(x.branchId));
  })();

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';

  const q = search.trim().toLowerCase();
  let list = myInvoices;
  if (q) {
    list = list.filter(
      (s) =>
        s.no.toLowerCase().includes(q) ||
        customerName(s.customerId).toLowerCase().includes(q) ||
        (s.note || '').toLowerCase().includes(q)
    );
  }
  if (statusFilter) {
    list = list.filter((s) => {
      const b = invBalance(db, s);
      const paid = paidOfInvoice(db, s);
      if (statusFilter === 'paid') return b <= 0.005;
      if (statusFilter === 'partial') return b > 0.005 && paid > 0.005;
      return b > 0.005 && paid <= 0.005;
    });
  }

  const filtered = list.slice().reverse();

  const handleExport = () => {
    exportCSV(
      'invoices',
      filtered.map((s) => ({
        no: s.no,
        date: s.date,
        customer: customerName(s.customerId),
        note: s.note || '',
        branch: branchName(s.branchId),
        total: invoiceTotal(s, db.settings.taxRate),
        paid: paidOfInvoice(db, s),
        balance: invBalance(db, s),
        ...(!isDirectSale ? { deliveredPct: `${deliverPct(db, s)}%` } : {}),
        lines: s.lines.map((l) => `${itemName(l.itemId || '')} x${l.qty}`).join(' | '),
      }))
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      {/* Header & Controls */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
            <span>{t('Invoices')}</span>
            {!isDirectSale && (
              <span className="text-xs font-normal text-slate-400 hidden sm:inline">
                {t('balance due = full value, delivered or not')}
              </span>
            )}
          </h2>
        </div>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search no / customer')}
          className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-full sm:w-44 md:w-56 bg-white"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm bg-white cursor-pointer"
        >
          <option value="">{t('All statuses')}</option>
          <option value="unpaid">{t('Unpaid')}</option>
          <option value="partial">{t('Partial')}</option>
          <option value="paid">{t('Paid')}</option>
        </select>
        <button
          type="button"
          onClick={onNewInvoice}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t('New Invoice')}
        </button>
        <button
          type="button"
          onClick={handleExport}
          title="Export CSV"
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Invoice Cards */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {filtered.map((s) => {
          const total = invoiceTotal(s, db.settings.taxRate);
          const paid = paidOfInvoice(db, s);
          const bal = invBalance(db, s);
          const delPct = deliverPct(db, s);
          const matchingDels = (db.deliveries || []).filter((d) => d.invoiceId === s.id);

          return (
            <div key={s.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{s.no}</span>
                    <span className="text-xs text-slate-500">{fmtDate(s.date)}</span>
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5 break-words">
                    {customerName(s.customerId)}
                  </div>
                  {s.note && (
                    <div className="text-[11px] text-slate-400 italic mt-0.5 break-words">
                      {s.note}
                    </div>
                  )}
                </div>
                {!isDirectSale && (
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      delPct >= 99.9
                        ? 'bg-emerald-100 text-emerald-700'
                        : delPct > 0
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {t('Delivered')} {delPct}%
                  </span>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Total')}</div>
                  <div className="font-semibold text-slate-900">{fmt(total)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Paid')}</div>
                  <div className="font-medium text-emerald-600">{fmt(paid)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Balance')}</div>
                  <div className={`font-semibold ${bal > 0.005 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {fmt(bal)}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                {!isDirectSale && delPct < 100 && (
                  <button
                    type="button"
                    onClick={() => onNewDelivery(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    {t('Deliver')}
                  </button>
                )}
                {canPaybook && (
                  <button
                    type="button"
                    onClick={() => onPayInvoice(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold cursor-pointer"
                  >
                    {t('Pay')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => printDocument('invoice', s, db)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  {t('Print')}
                </button>
                {!isDirectSale && matchingDels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => printDocument('delivery', matchingDels[matchingDels.length - 1], db)}
                    title={t('Print Latest Delivery Slip')}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    {t('Slip')}
                  </button>
                )}
                {canEdit('invoices') && (
                  <button
                    type="button"
                    onClick={() => onEditInvoice(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    {t('Edit')}
                  </button>
                )}
                {canDelete('invoices') && (
                  <button
                    type="button"
                    onClick={() => deleteInvoice(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('Del')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">{t('No invoices.')}</div>
        )}
      </div>

      {/* Invoices Table (Desktop) */}
      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('No')}</th>
              <th className="text-left px-3 py-2.5">{t('Date')}</th>
              <th className="text-left px-3 py-2.5">{t('Customer')}</th>
              <th className="text-center px-3 py-2.5">{t('Total')}</th>
              <th className="text-center px-3 py-2.5">{t('Paid')}</th>
              <th className="text-center px-3 py-2.5">{t('Balance')}</th>
              {!isDirectSale && <th className="text-center px-3 py-2.5">{t('Delivered')}</th>}
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.map((s) => {
              const total = invoiceTotal(s, db.settings.taxRate);
              const paid = paidOfInvoice(db, s);
              const bal = invBalance(db, s);
              const delPct = deliverPct(db, s);

              return (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {s.no}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(s.date)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    <div>{customerName(s.customerId)}</div>
                    {s.note && (
                      <div className="text-[11px] text-slate-400 font-normal italic truncate max-w-[220px]" title={s.note}>
                        {s.note}
                      </div>
                    )}
                  </td>
                  <td className="text-center py-2.5 font-semibold text-slate-900">
                    {fmt(total)}
                  </td>
                  <td className="text-center py-2.5 text-emerald-600 font-medium">
                    {fmt(paid)}
                  </td>
                  <td
                    className={`text-center py-2.5 font-semibold ${
                      bal > 0.005 ? 'text-rose-600' : 'text-slate-500'
                    }`}
                  >
                    {fmt(bal)}
                  </td>
                  {!isDirectSale && (
                    <td className="text-center py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          delPct >= 99.9
                            ? 'bg-emerald-100 text-emerald-700'
                            : delPct > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {delPct}%
                      </span>
                    </td>
                  )}
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    {!isDirectSale && delPct < 100 && (
                      <button
                        type="button"
                        onClick={() => onNewDelivery(s)}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Send className="w-3 h-3" />
                        {t('Deliver')}
                      </button>
                    )}
                    {canPaybook && (
                      <button
                        type="button"
                        onClick={() => onPayInvoice(s)}
                        className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Pay')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => printDocument('invoice', s, db)}
                      className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Print')}
                    </button>
                    {!isDirectSale && (db.deliveries || []).some((d) => d.invoiceId === s.id) && (
                      <button
                        type="button"
                        onClick={() => {
                          const matchingDels = (db.deliveries || []).filter((d) => d.invoiceId === s.id);
                          printDocument('delivery', matchingDels[matchingDels.length - 1], db);
                        }}
                        title={t('Print Latest Delivery Slip')}
                        className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        {t('Slip')}
                      </button>
                    )}
                    {canEdit('invoices') && (
                      <button
                        type="button"
                        onClick={() => onEditInvoice(s)}
                        className="text-slate-600 hover:text-slate-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('Edit')}
                      </button>
                    )}
                    {canDelete('invoices') && (
                      <button
                        type="button"
                        onClick={() => deleteInvoice(s)}
                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Del')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={isDirectSale ? 7 : 8} className="p-8 text-center text-slate-400 text-sm">
                  {t('No invoices.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
