import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, diffDays, todayStr, toIsoDate } from '../../utils/formatters';
import { checkRemaining, deliveredOf } from '../../utils/calculations';
import { getGlobalTrackFlags } from '../../utils/tracking';

export const AlertsView: React.FC = () => {
  const { db, stockOf, canAccess, t } = useIMS();
  const showInventory = canAccess('inventory');
  const showChecks = canAccess('checks');
  const showSales = canAccess('sales');
  const showDeliveries = canAccess('deliveries');
  const showDisposals = canAccess('disposals');
  const showTransfers = canAccess('transfers');
  const showWorkflow = showDisposals || showTransfers || showSales;
  const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
  const showExpiry = showInventory && trackExpiry;
  const today = todayStr();
  const warn = +db.settings.expiryWarnDays || 30;

  const live = db.stocks.filter((s) => s.qty > 0.005);
  const expired = live.filter((s) => s.expiry && toIsoDate(s.expiry) < today);
  const expiring = live
    .filter((s) => s.expiry && toIsoDate(s.expiry) >= today && diffDays(s.expiry, today) <= warn)
    .map((s) => ({ ...s, _d: diffDays(s.expiry, today) }));

  const low = db.items
    .map((i) => ({
      id: i.id,
      name: i.name,
      sku: i.sku,
      stock: stockOf(i.id, null),
      reorder: +i.reorder || 0,
    }))
    .filter((r) => r.reorder > 0 && r.stock <= r.reorder);

  const checks = db.checks.filter((c) => {
    if (c.status === 'cleared' || c.status === 'bounced') return false;
    if (checkRemaining(c) <= 0.005) return false;
    return c.dueDate && diffDays(c.dueDate, today) <= 14;
  });

  // Delivery backlog > 30 days
  const promisedOld: { key: string; customerId: string; itemId: string; rem: number; days: number }[] = [];
  db.invoices.forEach((inv) => {
    inv.lines.forEach((l, ix) => {
      if (!l.itemId) return;
      const rem = (+l.qty || 0) - deliveredOf(db, inv.id, l.itemId, null);
      const days = diffDays(today, inv.date);
      if (rem > 0.005 && days > 30) {
        promisedOld.push({
          key: `p-${inv.id}-${ix}`,
          customerId: inv.customerId,
          itemId: l.itemId,
          rem,
          days,
        });
      }
    });
  });

  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const checkDueDays = (c: any) => (c.dueDate ? diffDays(c.dueDate, today) : 0);

  const hasAnySection = showExpiry || showInventory || showChecks || showSales || showWorkflow;

  return (
    <div className="space-y-4">
      {!hasAnySection && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-8 text-center text-sm text-slate-500">
          {t('No alerts available for your permitted sections.')}
        </div>
      )}
      {showExpiry && (
        <>
          {/* Expired Batches */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-rose-700 flex items-center justify-between">
          <span>⚠️ Expired Batches ({expired.length})</span>
          <span className="text-xs font-normal text-slate-400">Batches whose expiry date has passed</span>
        </div>
        {expired.length > 0 ? (
          <>
            <div className="md:hidden divide-y divide-slate-200">
              {expired.map((s) => (
                <div key={s.id} className="p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900">{itemName(s.itemId)}</div>
                      <div className="text-xs text-slate-500">
                        {branchName(s.branchId)}
                        {trackLot && s.batchNo ? ` · ${s.batchNo}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                      {fmtDate(s.expiry)}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">{t('Qty')}</div>
                      <div className="font-bold text-slate-900">{s.qty}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase text-slate-400">{t('Cost Value')}</div>
                      <div className="font-semibold text-rose-600">{fmt(s.qty * s.cost)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('Item')}</th>
                  <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                  {trackLot && <th className="text-left px-3 py-2.5">{t('Batch')}</th>}
                  <th className="text-center px-3 py-2.5">{t('Expiry')}</th>
                  <th className="text-center px-3 py-2.5">{t('Qty')}</th>
                  <th className="text-center px-3 py-2.5">{t('Cost Value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expired.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{itemName(s.itemId)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{branchName(s.branchId)}</td>
                    {trackLot && (
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{s.batchNo || '—'}</td>
                    )}
                    <td className="text-center py-2.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-700">
                        {fmtDate(s.expiry)}
                      </span>
                    </td>
                    <td className="text-center py-2.5 font-bold text-slate-900">{s.qty}</td>
                    <td className="text-center py-2.5 font-semibold text-rose-600">{fmt(s.qty * s.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="p-5 text-sm text-slate-400">{t('None.')}</div>
        )}
      </div>

      {/* Expiring Soon */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-amber-700">
          ⏳ Expiring within {db.settings.expiryWarnDays} days ({expiring.length})
        </div>
        {expiring.length > 0 ? (
          <>
            <div className="md:hidden divide-y divide-slate-200">
              {expiring.map((s) => (
                <div key={s.id} className="p-3.5 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-slate-900">{itemName(s.itemId)}</div>
                      <div className="text-xs text-slate-500">
                        {branchName(s.branchId)}
                        {trackLot && s.batchNo ? ` · ${s.batchNo}` : ''}
                      </div>
                    </div>
                    <span className="shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                      {fmtDate(s.expiry)} ({s._d}d)
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 tabular-nums">
                    <span className="text-slate-400">{t('Qty')}: </span>
                    <span className="font-bold text-slate-900">{s.qty}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('Item')}</th>
                  <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                  {trackLot && <th className="text-left px-3 py-2.5">{t('Batch')}</th>}
                  <th className="text-center px-3 py-2.5">{t('Expiry')}</th>
                  <th className="text-center px-3 py-2.5">{t('Qty')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiring.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{itemName(s.itemId)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{branchName(s.branchId)}</td>
                    {trackLot && (
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{s.batchNo || '—'}</td>
                    )}
                    <td className="text-center py-2.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
                        {fmtDate(s.expiry)} ({s._d}d)
                      </span>
                    </td>
                    <td className="text-center py-2.5 font-bold text-slate-900">{s.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        ) : (
          <div className="p-5 text-sm text-slate-400">{t('None.')}</div>
        )}
      </div>
    </>
  )}

      {/* Grid: Low Stock, Checks, Backlog, Attention */}
      {(showInventory || showChecks || showSales || showWorkflow) && (
        <div className="grid md:grid-cols-2 gap-4">
          {/* Low Stock */}
          {showInventory && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-slate-900">
                📉 Low Stock ({low.length})
              </div>
              <div className="p-4 space-y-2 text-sm max-h-72 overflow-y-auto">
                {low.map((r) => (
                  <div key={r.id} className="flex justify-between items-center border-b border-slate-100 pb-1.5 last:border-0">
                    <div>
                      <span className="font-medium text-slate-800">{r.name}</span>
                      <span className="text-xs text-slate-400 ml-1.5 font-mono">{r.sku}</span>
                    </div>
                    <b className={r.stock > 0 ? 'text-amber-600 font-bold' : 'text-rose-600 font-bold'}>
                      {r.stock} / {r.reorder}
                    </b>
                  </div>
                ))}
                {low.length === 0 && <div className="text-slate-400 py-2">{t('None.')}</div>}
              </div>
            </div>
          )}

          {/* Checks Due / Overdue */}
          {showChecks && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-slate-900">
                📑 Checks Due / Overdue ({checks.length})
              </div>
              <div className="p-4 space-y-2 text-sm max-h-72 overflow-y-auto">
                {checks.map((c) => {
                  const dd = checkDueDays(c);
                  return (
                    <div key={c.id} className="flex justify-between items-center border-b border-slate-100 pb-1.5 last:border-0">
                      <div>
                        <span className="font-mono font-medium text-slate-800">{c.checkNo}</span>
                        <span className="text-xs text-slate-400 ml-1.5">• {customerName(c.customerId)}</span>
                      </div>
                      <b className={dd < 0 ? 'text-rose-600 font-bold' : 'text-amber-600 font-bold'}>
                        {fmt(c.amount)} ({dd < 0 ? `${Math.abs(dd)}d overdue` : `${dd}d left`})
                      </b>
                    </div>
                  );
                })}
                {checks.length === 0 && <div className="text-slate-400 py-2">{t('None.')}</div>}
              </div>
            </div>
          )}

          {/* Delivery Backlog > 30 days */}
          {showDeliveries && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-slate-900">
                🚚 Delivery Backlog &gt; 30 days ({promisedOld.length})
              </div>
              <div className="p-4 space-y-2 text-sm max-h-72 overflow-y-auto">
                {promisedOld.map((r) => (
                  <div key={r.key} className="flex justify-between items-center border-b border-slate-100 pb-1.5 last:border-0">
                    <span className="text-slate-700">
                      <b>{customerName(r.customerId)}</b> • {itemName(r.itemId)}
                    </span>
                    <b className="text-indigo-600 font-bold">{r.rem} pcs • {r.days}d</b>
                  </div>
                ))}
                {promisedOld.length === 0 && <div className="text-slate-400 py-2">{t('None.')}</div>}
              </div>
            </div>
          )}

          {/* Workflow Attention */}
          {showWorkflow && (
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-slate-900">
                {t('Workflow Attention')}
              </div>
              <div className="p-4 text-sm divide-y divide-slate-100">
                {showDisposals && (
                  <div className="flex justify-between items-center py-1.5 first:pt-0 last:pb-0">
                    <span className="text-slate-600">{t('Pending disposal approvals')}</span>
                    <b className="font-bold text-slate-900">
                      {db.disposals.filter((d) => d.status === 'pending').length}
                    </b>
                  </div>
                )}
                {showTransfers && (
                  <div className="flex justify-between items-center py-1.5 first:pt-0 last:pb-0">
                    <span className="text-slate-600">{t('Transfers in transit')}</span>
                    <b className="font-bold text-slate-900">
                      {db.transfers.filter((t) => t.status === 'transit').length}
                    </b>
                  </div>
                )}
                {showSales && (
                  <div className="flex justify-between items-center py-1.5 first:pt-0 last:pb-0">
                    <span className="text-slate-600">{t('Return slips without credit note')}</span>
                    <b className="font-bold text-slate-900">
                      {db.returnSlips.filter((s) => !s.returnInvoiceId).length}
                    </b>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
