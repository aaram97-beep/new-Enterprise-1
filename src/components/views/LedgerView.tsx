import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { DonutProgress } from '../common/DonutProgress';
import { fmt, fmtDate, r2 } from '../../utils/formatters';
import {
  custBalance,
  custDiscountTotal,
  invoiceTotal,
  deliverPct,
  retInvTotal,
  intakeTotal,
  intakeBalance,
} from '../../utils/calculations';
import { printStatement } from '../../utils/printService';
import { Printer } from 'lucide-react';

interface LedgerViewProps {
  initialCustomerId?: string | null;
}

export const LedgerView: React.FC<LedgerViewProps> = ({ initialCustomerId }) => {
  const { db, t } = useIMS();
  const isDirectSale = db.settings.directSaleMode === true;
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    initialCustomerId || null
  );

  const customer = db.customers.find((c) => c.id === selectedCustomerId) || null;

  const custAcRows = db.customers.map((c) => ({
    id: c.id,
    label: c.name,
    sub: `${c.phone || ''}${c.isProvider ? '   provider' : ''}`.trim(),
    code: c.phone || '',
  }));

  // Build Chronological Ledger Rows
  const getLedgerRows = () => {
    if (!customer) return [];
    const rows: any[] = [];
    let bal = r2(+customer.openingBalance || 0);

    rows.push({
      key: 'open',
      date: '',
      type: 'opening',
      cls: 'bg-slate-100 text-slate-600',
      no: '—',
      details: 'Opening balance',
      pct: null,
      debit: r2(+customer.openingBalance || 0),
      credit: 0,
      bal,
    });

    const ev: any[] = [];
    db.invoices
      .filter((s) => s.customerId === customer.id)
      .forEach((s) => {
        const delPct = isDirectSale ? null : deliverPct(db, s);
        ev.push({
          date: s.date,
          type: 'invoice',
          cls: 'bg-blue-100 text-blue-700',
          no: s.no,
          debit: invoiceTotal(s, db.settings.taxRate),
          credit: 0,
          pct: delPct,
          details: isDirectSale
            ? `${(s.lines || []).length} line(s)`
            : `${(s.lines || []).length} line(s)   ${delPct}% delivered`,
        });
      });

    db.payments
      .filter((p) => p.customerId === customer.id)
      .forEach((p) => {
        const isOut = p.dir === 'out';
        const allocSummary = (p.allocs || [])
          .map((a) => {
            if (a.type === 'opening') return t('Opening Balance');
            const inv = db.invoices.find((i) => i.id === a.docId);
            if (inv) return inv.no;
            const intk = db.intakes.find((i) => i.id === a.docId);
            if (intk) return intk.no;
            return a.docId;
          })
          .filter(Boolean)
          .join(', ');

        ev.push({
          date: p.date,
          type: isOut ? 'payment out' : 'payment',
          cls: isOut ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
          no: p.no,
          debit: isOut ? r2((+p.amount || 0) + (+p.disc || 0)) : 0,
          credit: isOut ? 0 : r2((+p.amount || 0) + (+p.disc || 0)),
          pct: null,
          details: `${p.method}${p.note ? ' • ' + p.note : ''}${
            allocSummary ? ` • For: ${allocSummary}` : ''
          }${
            (+p.disc || 0) > 0 ? ' • incl. ' + fmt(p.disc) + ' settlement discount' : ''
          }`,
        });
      });

    db.returnInvoices
      .filter((x) => x.customerId === customer.id)
      .forEach((x) => {
        const slip = db.returnSlips.find((s) => s.id === x.returnSlipId);
        ev.push({
          date: x.date,
          type: 'return inv',
          cls: 'bg-indigo-100 text-indigo-700',
          no: x.no,
          debit: 0,
          credit: retInvTotal(x),
          pct: null,
          details: `credit from ${slip?.no || '—'}`,
        });
      });

    db.intakes
      .filter((x) => x.providerId === customer.id)
      .forEach((x) => {
        const total = intakeTotal(x);
        const pct =
          total > 0 ? Math.round((1000 * (total - intakeBalance(db, x))) / total) / 10 : 100;
        ev.push({
          date: x.date,
          type: 'purchase',
          cls: 'bg-amber-100 text-amber-700',
          no: x.no,
          debit: 0,
          credit: total,
          pct,
          details: `${(x.lines || []).length} line(s)   ${x.note || 'buying receipt'}`,
        });
      });

    ev.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    ev.forEach((e, i) => {
      bal = r2(bal + r2(e.debit) - r2(e.credit));
      rows.push({ key: `${e.type}-${i}`, ...e, bal });
    });

    return rows;
  };

  const rows = getLedgerRows();
  const currentBal = customer ? custBalance(db, customer) : 0;

  return (
    <div className="space-y-4">
      {/* Search Bar & Action */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
            {t('Customer / Provider Ledger')}
          </h2>
          <div className="w-full sm:w-72">
            <AutoCompleteBox
              rows={custAcRows}
              placeholder={t('Search customer')}
              defaultValue={customer ? customer.name : ''}
              onPick={(row) => setSelectedCustomerId(row.id)}
            />
          </div>
          {customer && (
            <button
              type="button"
              onClick={() => printStatement(db, customer.id, rows)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1.5 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              {t('Statement')}
            </button>
          )}
        </div>
      </div>

      {/* Ledger Table */}
      {customer ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-slate-100 pb-3">
            <div className="font-bold text-xl text-slate-900">{customer.name}</div>
            <div className="text-xs text-slate-500">
              {customer.phone || ''} {customer.address ? `  ${customer.address}` : ''}
            </div>
          </div>

          {/* Mobile Ledger Entries */}
          <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
            {rows.map((r) => (
              <div key={r.key} className="p-3.5 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.cls}`}>
                        {r.type}
                      </span>
                      <span className="font-mono text-xs font-bold text-slate-900">{r.no}</span>
                      {r.date && <span className="text-xs text-slate-500">{fmtDate(r.date)}</span>}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 break-words">{r.details}</div>
                  </div>
                  {r.pct !== null && (
                    <div className="shrink-0">
                      <DonutProgress pct={r.pct} size={24} />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t('Debit')}</div>
                    <div className="font-semibold text-rose-600">{r.debit > 0 ? fmt(r.debit) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t('Credit')}</div>
                    <div className="font-semibold text-emerald-600">{r.credit > 0 ? fmt(r.credit) : '—'}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-slate-400">{t('Balance')}</div>
                    <div className="font-bold text-slate-900">{fmt(r.bal)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Date')}</th>
                  <th className="text-left px-3 py-2.5">{t('Type')}</th>
                  <th className="text-left px-3 py-2.5">{t('Ref')}</th>
                  <th className="text-left px-3 py-2.5">{t('Details')}</th>
                  <th className="text-center px-3 py-2.5 w-20">{t('Fulfilled')}</th>
                  <th className="text-center px-3 py-2.5">{t('Debit')}</th>
                  <th className="text-center px-3 py-2.5">{t('Credit')}</th>
                  <th className="text-center px-3 py-2.5">{t('Balance')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.cls}`}>
                        {r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900">
                      {r.no}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">{r.details}</td>
                    <td className="text-center py-2">
                      {r.pct !== null ? (
                        <DonutProgress pct={r.pct} size={24} />
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="text-center py-2 font-semibold text-rose-600">
                      {r.debit > 0 ? fmt(r.debit) : ''}
                    </td>
                    <td className="text-center py-2 font-semibold text-emerald-600">
                      {r.credit > 0 ? fmt(r.credit) : ''}
                    </td>
                    <td className="text-center py-2 font-bold text-slate-900">{fmt(r.bal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="pt-3 border-t-2 border-slate-200 flex flex-wrap justify-between items-baseline gap-3">
            <div className="text-xs text-slate-400">
              Includes opening balance {fmt(customer.openingBalance || 0)}   settlement discounts
              credited {fmt(custDiscountTotal(db, customer.id))}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                {t('TOTAL OWED:')}
              </span>
              <span
                className={`text-2xl font-bold ${
                  currentBal > 0.005 ? 'text-rose-600' : 'text-emerald-600'
                }`}
              >
                {fmt(currentBal)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-12 text-center text-slate-400 text-sm">
          {t('Search and choose a customer above to open their ledger.')}
        </div>
      )}
    </div>
  );
};
