import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, r2 } from '../../utils/formatters';
import { intakeTotal, intakeBalance } from '../../utils/calculations';
import { printDocument } from '../../utils/printService';
import { exportCSV } from '../../utils/exportImport';
import { formatLineBatchExpirySuffix, getGlobalTrackFlags } from '../../utils/tracking';
import { Plus, Download, Printer, Edit2, Trash2, CheckCircle2 } from 'lucide-react';
import type { Intake, Arrival } from '../../types';

interface BuyingGoodsViewProps {
  onNewIntake: () => void;
  onEditIntake: (intake: Intake) => void;
  onNewArrival: (intake: Intake) => void;
  onDirectNewArrival?: () => void;
  onEditArrival?: (arrival: Arrival) => void;
  onPayIntake: (intake: Intake) => void;
}

export const BuyingGoodsView: React.FC<BuyingGoodsViewProps> = ({
  onNewIntake,
  onEditIntake,
  onNewArrival,
  onDirectNewArrival,
  onEditArrival,
  onPayIntake,
}) => {
  const { db, deleteIntake, deleteArrival, sessionUser, t, canDelete, canEdit, canAccess, canViewCost } = useIMS();
  const canPaybook = canAccess('paybook');
  const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
  const [tab, setTab] = useState<'buy' | 'arr'>('buy');
  const [filter, setFilter] = useState('');

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const intakeById = (id: string) => db.intakes.find((x) => x.id === id) || null;

  const arrivedOf = (intakeId: string, itemId: string) =>
    r2(
      db.arrivals
        .filter((a) => a.intakeId === intakeId)
        .reduce(
          (a, x) =>
            a +
            (x.lines || [])
              .filter((l) => l.itemId === itemId)
              .reduce((y, l) => y + (+l.qty || 0), 0),
          0
        )
    );

  const intakeRem = (p: Intake, itemId: string) => {
    const tot = r2(
      (p.lines || []).filter((l) => l.itemId === itemId).reduce((a, l) => a + (+l.qty || 0), 0)
    );
    return r2(tot - arrivedOf(p.id, itemId));
  };

  const onWayQty = (p: Intake) => {
    const seen: Record<string, boolean> = {};
    let tot = 0;
    (p.lines || []).forEach((l) => {
      if (seen[l.itemId]) return;
      seen[l.itemId] = true;
      tot += Math.max(0, intakeRem(p, l.itemId));
    });
    return r2(tot);
  };

  const onWayCount = db.intakes.filter((p) => onWayQty(p) > 0.005).length;

  const myIntakes = ((): Intake[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.intakes;
    return db.intakes.filter((p) => (sessionUser.branchIds || []).includes(p.branchId));
  })();

  const myArrivals = ((): Arrival[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.arrivals;
    return db.arrivals.filter((a) => (sessionUser.branchIds || []).includes(a.branchId));
  })();

  const q = filter.trim().toLowerCase();
  let filteredIntakes = myIntakes;
  if (q) {
    filteredIntakes = filteredIntakes.filter(
      (p) => p.no.toLowerCase().includes(q) || customerName(p.providerId).toLowerCase().includes(q)
    );
  }
  const reversedIntakes = filteredIntakes.slice().reverse();

  let filteredArrivals = myArrivals;
  if (q) {
    filteredArrivals = filteredArrivals.filter((a) => {
      const p = intakeById(a.intakeId);
      return (
        a.no.toLowerCase().includes(q) ||
        (p?.no || '').toLowerCase().includes(q) ||
        customerName(p?.providerId || '').toLowerCase().includes(q)
      );
    });
  }
  const reversedArrivals = filteredArrivals.slice().reverse();

  const handleExportIntakes = () => {
    exportCSV(
      'buying-receipts',
      reversedIntakes.map((p) => ({
        no: p.no,
        date: p.date,
        provider: customerName(p.providerId),
        branch: branchName(p.branchId),
        total: intakeTotal(p),
        balance: intakeBalance(db, p),
        onWay: onWayQty(p),
        lines: p.lines.map((l) => `${itemName(l.itemId)} x${l.qty}`).join(' | '),
        note: p.note,
      }))
    );
  };

  const handleExportArrivals = () => {
    exportCSV(
      'arrival-notes',
      reversedArrivals.map((a) => {
        const p = intakeById(a.intakeId);
        return {
          no: a.no,
          date: a.date,
          receipt: p?.no || '',
          provider: customerName(p?.providerId || ''),
          branch: branchName(a.branchId),
          lines: a.lines
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
          note: a.note,
        };
      })
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
            <span>{t('Purchases')}</span>
            <span className="text-xs font-normal text-slate-400 hidden sm:inline">
              {t('typed receipts   goods are "on the way" until an arrival note puts them in stock')}
            </span>
          </h2>
        </div>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('Search no / provider')}
          className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm flex-1 min-w-[160px] sm:flex-none sm:w-48 bg-white"
        />
        {tab === 'buy' && (
          <button
            type="button"
            onClick={onNewIntake}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('New Purchase Receipt')}
          </button>
        )}
        {tab === 'arr' && db.settings.isBranchCompany && (
          <button
            type="button"
            onClick={onDirectNewArrival}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('Add Arrival note')}
          </button>
        )}
        <button
          type="button"
          onClick={tab === 'buy' ? handleExportIntakes : handleExportArrivals}
          title="Export CSV"
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setTab('buy')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tab === 'buy'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('Purchase Receipts')}
        </button>
        <button
          type="button"
          onClick={() => setTab('arr')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
            tab === 'arr'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span>{t('Arrival Notes')}</span>
          {onWayCount > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                tab === 'arr' ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {onWayCount}
            </span>
          )}
        </button>
      </div>

      {/* Content depending on Tab */}
      {tab === 'buy' ? (
        <>
          <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
            {reversedIntakes.map((p) => {
              const total = intakeTotal(p);
              const bal = intakeBalance(db, p);
              const onWay = onWayQty(p);

              return (
                <div key={p.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900">{p.no}</span>
                        <span className="text-xs text-slate-500">{fmtDate(p.date)}</span>
                      </div>
                      <div className="font-semibold text-sm text-slate-900 mt-0.5">
                        {customerName(p.providerId)}
                      </div>
                      <div className="text-xs text-slate-500">{branchName(p.branchId)}</div>
                    </div>
                    {onWay > 0.005 ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">
                        {onWay} on way
                      </span>
                    ) : (
                      <span className="shrink-0 text-emerald-600 text-xs font-medium inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('all arrived')}
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 break-words">
                    {p.lines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}
                  </div>

                  <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">{t('Total')}</div>
                      <div className="font-semibold text-slate-900">
                        {canViewCost() ? fmt(total) : '***'}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">{t('Balance')}</div>
                      <div className={`font-semibold ${bal > 0.005 ? 'text-amber-600' : 'text-slate-500'}`}>
                        {canViewCost() ? fmt(bal) : '***'}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                    {onWay > 0.005 && (
                      <button
                        type="button"
                        onClick={() => onNewArrival(p)}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold cursor-pointer"
                      >
                        {t('Arrive')}
                      </button>
                    )}
                    {canPaybook && (
                      <button
                        type="button"
                        onClick={() => onPayIntake(p)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold cursor-pointer"
                      >
                        {t('Pay')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => printDocument('intake', p, db)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Print')}
                    </button>
                    {canEdit('buying') && (
                      <button
                        type="button"
                        onClick={() => onEditIntake(p)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('Edit')}
                      </button>
                    )}
                    {canDelete('buying') && (
                      <button
                        type="button"
                        onClick={() => deleteIntake(p)}
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
            {reversedIntakes.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">
                {t('No buying receipts yet   type a receipt when you buy goods.')}
              </div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('No')}</th>
                <th className="text-left px-3 py-2.5">{t('Date')}</th>
                <th className="text-left px-3 py-2.5">{t('Provider')}</th>
                <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                <th className="text-left px-3 py-2.5">{t('Items')}</th>
                <th className="text-center px-3 py-2.5">{t('Total')}</th>
                <th className="text-center px-3 py-2.5">{t('Balance')}</th>
                <th className="text-center px-3 py-2.5">{t('On Way')}</th>
                <th className="text-right px-4 py-2.5">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reversedIntakes.map((p) => {
                const total = intakeTotal(p);
                const bal = intakeBalance(db, p);
                const onWay = onWayQty(p);

                return (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                      {p.no}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(p.date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {customerName(p.providerId)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {branchName(p.branchId)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 max-w-xs truncate">
                      {p.lines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}
                    </td>
                    <td className="text-center py-2.5 font-semibold text-slate-900">
                      {canViewCost() ? fmt(total) : '***'}
                    </td>
                    <td
                      className={`text-center py-2.5 font-semibold ${
                        bal > 0.005 ? 'text-amber-600' : 'text-slate-500'
                      }`}
                    >
                      {canViewCost() ? fmt(bal) : '***'}
                    </td>
                    <td className="text-center py-2.5">
                      {onWay > 0.005 ? (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700">
                          {onWay} on way
                        </span>
                      ) : (
                        <span className="text-emerald-600 text-xs font-medium inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          {t('all arrived')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                      {onWay > 0.005 && (
                        <button
                          type="button"
                          onClick={() => onNewArrival(p)}
                          className="text-indigo-700 hover:text-indigo-900 font-bold hover:underline cursor-pointer"
                        >
                          {t('Arrive')}
                        </button>
                      )}
                      {canPaybook && (
                        <button
                          type="button"
                          onClick={() => onPayIntake(p)}
                          className="text-emerald-700 hover:text-emerald-900 font-semibold hover:underline cursor-pointer"
                        >
                          {t('Pay')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => printDocument('intake', p, db)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        {t('Print')}
                      </button>
                      {canEdit('buying') && (
                        <button
                          type="button"
                          onClick={() => onEditIntake(p)}
                          className="text-slate-600 hover:text-slate-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          {t('Edit')}
                        </button>
                      )}
                      {canDelete('buying') && (
                        <button
                          type="button"
                          onClick={() => deleteIntake(p)}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                        >
                          {t('Del')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {reversedIntakes.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 text-sm">
                    {t('No buying receipts yet   type a receipt when you buy goods.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <>
          <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
            {reversedArrivals.map((a) => {
              const p = intakeById(a.intakeId);
              return (
                <div key={a.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900">{a.no}</span>
                        <span className="text-xs text-slate-500">{fmtDate(a.date)}</span>
                      </div>
                      <div className="font-semibold text-sm text-slate-900 mt-0.5">
                        {p?.providerId ? customerName(p.providerId) : t('Direct / Branch Arrival')}
                      </div>
                      <div className="text-xs text-slate-500">{branchName(a.branchId)}</div>
                      {a.note && (
                        <div className="text-[11px] text-slate-400 italic mt-0.5 break-words">
                          {a.note}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0 font-mono text-xs text-slate-600">
                      {p?.no || (
                        <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {t('Direct Arrival')}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2 break-words">
                    {a.lines
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
                      onClick={() => printDocument('arrival', a, db)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Print')}
                    </button>
                    {canEdit('buying') && onEditArrival && (
                      <button
                        type="button"
                        onClick={() => onEditArrival(a)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('Edit')}
                      </button>
                    )}
                    {canDelete('buying') && (
                      <button
                        type="button"
                        onClick={() => deleteArrival(a)}
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
            {reversedArrivals.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">
                {db.settings.isBranchCompany
                  ? t('No arrival notes yet   click "Add Arrival note" to record goods arriving at a branch.')
                  : t('No arrival notes yet   press "Arrive" on a buying receipt when goods reach the warehouse.')}
              </div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('No')}</th>
                <th className="text-left px-3 py-2.5">{t('Date')}</th>
                <th className="text-left px-3 py-2.5">{t('Receipt')}</th>
                <th className="text-left px-3 py-2.5">{t('Provider')}</th>
                <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                <th className="text-left px-3 py-2.5">
                  {t(
                    trackLot && trackExpiry
                      ? 'Lots / Expiry'
                      : trackLot
                      ? 'Lots'
                      : trackExpiry
                      ? 'Expiry'
                      : 'Items'
                  )}
                </th>
                <th className="text-right px-4 py-2.5">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reversedArrivals.map((a) => {
                const p = intakeById(a.intakeId);
                return (
                  <tr key={a.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                      <div>{a.no}</div>
                      {a.note && (
                        <div
                          className="text-[11px] font-normal text-slate-500 italic truncate max-w-[160px]"
                          title={a.note}
                        >
                          {a.note}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(a.date)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      {p?.no || (
                        <span className="text-[11px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                          {t('Direct Arrival')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {p?.providerId ? customerName(p.providerId) : (
                        <span className="text-xs text-slate-400">
                          {t('Direct / Branch Arrival')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {branchName(a.branchId)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 max-w-sm truncate">
                      {a.lines
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
                        onClick={() => printDocument('arrival', a, db)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        {t('Print')}
                      </button>
                      {canEdit('buying') && onEditArrival && (
                        <button
                          type="button"
                          onClick={() => onEditArrival(a)}
                          className="text-slate-600 hover:text-slate-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          {t('Edit')}
                        </button>
                      )}
                      {canDelete('buying') && (
                        <button
                          type="button"
                          onClick={() => deleteArrival(a)}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          {t('Del')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {reversedArrivals.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                    <p>
                      {db.settings.isBranchCompany
                        ? t('No arrival notes yet   click "Add Arrival note" to record goods arriving at a branch.')
                        : t(
                            'No arrival notes yet   press "Arrive" on a buying receipt when goods reach the warehouse.'
                          )}
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
};
