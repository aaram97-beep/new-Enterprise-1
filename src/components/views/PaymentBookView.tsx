import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate } from '../../utils/formatters';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, ArrowUpRight, Trash2 } from 'lucide-react';
import type { Payment } from '../../types';

interface PaymentBookViewProps {
  onNewPayment: () => void;
  onOpenLedger: (customerId: string) => void;
}

export const PaymentBookView: React.FC<PaymentBookViewProps> = ({
  onNewPayment,
  onOpenLedger,
}) => {
  const { db, deletePayment, t, canDelete, canAccess } = useIMS();
  const canLedger = canAccess('ledger');
  const [query, setQuery] = useState('');
  const [direction, setDirection] = useState<'all' | 'in' | 'out'>('all');

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const accountName = (id?: string | null) =>
    (db.accounts.find((a) => a.id === id) || {}).name || '—';

  const q = query.trim().toLowerCase();
  let list = db.payments.slice().reverse();
  if (direction !== 'all') {
    list = list.filter((p) => (direction === 'out' ? p.dir === 'out' : p.dir !== 'out'));
  }
  if (q) {
    list = list.filter(
      (p) =>
        p.no.toLowerCase().includes(q) ||
        customerName(p.customerId).toLowerCase().includes(q) ||
        (p.note || '').toLowerCase().includes(q)
    );
  }

  const handleExport = () => {
    exportCSV(
      'payment-book',
      list.map((p) => ({
        no: p.no,
        date: p.date,
        account: customerName(p.customerId),
        moneyAccount: accountName(p.accountId),
        direction: p.dir === 'out' ? 'paid to provider' : 'received',
        amount: p.amount,
        discount: p.disc,
        net: (p.amount || 0) + (p.disc || 0),
        method: p.method,
        note: p.note,
        allocatedTo: (p.allocs || [])
          .map(
            (a) =>
              `${a.type}:${
                a.type === 'invoice'
                  ? (db.invoices.find((x) => x.id === a.docId) || {}).no
                  : (db.intakes.find((x) => x.id === a.docId) || {}).no || a.docId
              } (${a.amount})`
          )
          .join(' | '),
      }))
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
            <span>{t('Payment Book')}</span>
            <span className="text-xs font-normal text-slate-400 hidden sm:inline">
              {t('every payment in and out   customers & providers in one book')}
            </span>
          </h2>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Search no / account / note')}
          className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-full sm:w-48 bg-white"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as any)}
          className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm bg-white cursor-pointer"
        >
          <option value="all">{t('All directions')}</option>
          <option value="in">{t('Received (in)')}</option>
          <option value="out">{t('Paid out')}</option>
        </select>
        <button
          type="button"
          onClick={onNewPayment}
          className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-emerald-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t('Add Payment')}
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

      {/* Mobile Payments List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {list.map((p) => {
          const isOut = p.dir === 'out';
          const net = (+p.amount || 0) + (+p.disc || 0);
          const allocStr =
            (p.allocs || [])
              .map((a) => {
                const docNo =
                  a.type === 'opening'
                    ? t('Opening Balance')
                    : a.type === 'invoice'
                    ? (db.invoices.find((x) => x.id === a.docId) || {}).no
                    : (db.intakes.find((x) => x.id === a.docId) || {}).no || a.docId;
                return `${docNo} (${fmt(a.amount)})`;
              })
              .join(', ') || '—';

          return (
            <div key={p.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{p.no}</span>
                    <span className="text-xs text-slate-500">{fmtDate(p.date)}</span>
                    <span className="text-xs text-slate-500 capitalize">· {p.method}</span>
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5">
                    {customerName(p.customerId)}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                    isOut ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isOut ? t('Paid out') : t('Received (in)')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Amount')}</div>
                  <div className="font-semibold text-slate-900">{fmt(p.amount)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Discount')}</div>
                  <div className="text-slate-500">{p.disc ? fmt(p.disc) : '—'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Net')}</div>
                  <div className="font-bold text-slate-900">{fmt(net)}</div>
                </div>
              </div>

              {(allocStr !== '—' || p.note) && (
                <div className="text-xs text-slate-600 space-y-0.5 break-words">
                  {allocStr !== '—' && (
                    <div>
                      <span className="text-slate-400">{t('Allocated to')}: </span>
                      {allocStr}
                    </div>
                  )}
                  {p.note && <div className="text-slate-400 italic">{p.note}</div>}
                </div>
              )}

              {(canLedger || canDelete('payments')) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  {canLedger && (
                    <button
                      type="button"
                      onClick={() => onOpenLedger(p.customerId)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      {t('Ledger')}
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                  {canDelete('payments') && (
                    <button
                      type="button"
                      onClick={() => deletePayment(p)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('Del')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">
            {t('No payments recorded yet.')}
          </div>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('No')}</th>
              <th className="text-left px-3 py-2.5">{t('Date')}</th>
              <th className="text-left px-3 py-2.5">{t('Account')}</th>
              <th className="text-left px-3 py-2.5">{t('Direction')}</th>
              <th className="text-center px-3 py-2.5">{t('Amount')}</th>
              <th className="text-center px-3 py-2.5">{t('Discount')}</th>
              <th className="text-center px-3 py-2.5">{t('Net')}</th>
              <th className="text-left px-3 py-2.5">{t('Method')}</th>
              <th className="text-left px-3 py-2.5">{t('Allocated to')}</th>
              <th className="text-left px-3 py-2.5">{t('Note')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((p) => {
              const isOut = p.dir === 'out';
              const net = (+p.amount || 0) + (+p.disc || 0);
              return (
                <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {p.no}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(p.date)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {customerName(p.customerId)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        isOut ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isOut ? t('Paid out') : t('Received (in)')}
                    </span>
                  </td>
                  <td className="text-center py-2.5 font-semibold text-slate-900">{fmt(p.amount)}</td>
                  <td className="text-center py-2.5 text-slate-500 text-xs">
                    {p.disc ? fmt(p.disc) : '—'}
                  </td>
                  <td className="text-center py-2.5 font-bold text-slate-900">{fmt(net)}</td>
                  <td className="px-3 py-2.5 text-xs capitalize text-slate-700">{p.method}</td>
                  <td className="px-3 py-2.5 text-xs max-w-xs truncate text-slate-600">
                    {(p.allocs || [])
                      .map((a) => {
                        const docNo =
                          a.type === 'opening'
                            ? t('Opening Balance')
                            : a.type === 'invoice'
                            ? (db.invoices.find((x) => x.id === a.docId) || {}).no
                            : (db.intakes.find((x) => x.id === a.docId) || {}).no || a.docId;
                        return `${docNo} (${fmt(a.amount)})`;
                      })
                      .join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 max-w-xs truncate" title={p.note}>
                    {p.note || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    {canLedger && (
                      <button
                        type="button"
                        onClick={() => onOpenLedger(p.customerId)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        {t('Ledger')}
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                    {canDelete('payments') && (
                      <button
                        type="button"
                        onClick={() => deletePayment(p)}
                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Del')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={11} className="p-8 text-center text-slate-400 text-sm">
                  {t('No payments recorded yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
