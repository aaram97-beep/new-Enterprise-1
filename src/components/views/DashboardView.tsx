import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, diffDays, todayStr, toIsoDate } from '../../utils/formatters';
import {
  custBalance,
  invoiceTotal,
  intakeBalance,
  checkRemaining,
  cashTotal,
  chequesBalance,
  deliveredOf,
  lineNet,
} from '../../utils/calculations';
import { getGlobalTrackFlags } from '../../utils/tracking';
import {
  Receipt,
  TrendingUp,
  Package,
  CreditCard,
  AlertCircle,
  Truck,
  ArrowUpRight,
  Landmark,
} from 'lucide-react';

interface DashboardViewProps {
  onOpenPayment: (customer: any) => void;
  onOpenLedger: (customerId: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenPayment, onOpenLedger }) => {
  const { db, canAccess, setView, t, maskWorth } = useIMS();
  const isDirectSale = db.settings.directSaleMode === true;
  const canSales = canAccess('sales');
  const canPur = canAccess('purchasing');
  const canMoney = canAccess('money');
  const canInv = canAccess('inventory');
  const canChecks = canAccess('checks');
  const canTransfers = canAccess('transfers');
  const canDisposals = canAccess('disposals');
  const canPaybook = canAccess('paybook');
  const canLedger = canAccess('ledger');
  const canCustomers = canAccess('customers');
  const today = todayStr();
  const month = today.slice(0, 7);

  // KPIs
  const ar = db.customers.reduce((a, c) => {
    const b = custBalance(db, c);
    return a + (b > 0.005 ? b : 0);
  }, 0);

  const monthSales = db.invoices
    .filter((s) => s.date && s.date.slice(0, 7) === month)
    .reduce((a, s) => a + invoiceTotal(s, db.settings.taxRate), 0);

  // Delivery Backlog value
  let promisedVal = 0;
  db.invoices.forEach((inv) => {
    inv.lines.forEach((l) => {
      if (!l.itemId) return;
      const rem = (+l.qty || 0) - deliveredOf(db, inv.id, l.itemId, null);
      if (rem > 0.005) {
        const unit = (+l.qty || 0) > 0 ? lineNet(l) / l.qty : 0;
        promisedVal += rem * unit;
      }
    });
  });

  const ap = db.intakes.reduce((a, p) => {
    const b = intakeBalance(db, p);
    return a + (b > 0.005 ? b : 0);
  }, 0);

  const totalCash = cashTotal(db, db.accounts);
  const totalCheques = chequesBalance(db);

  // Alerts counts
  const trackExpiry = getGlobalTrackFlags(db.settings).trackExpiry;
  const warn = +db.settings.expiryWarnDays || 30;
  const live = db.stocks.filter((s) => s.qty > 0.005);
  const expiredCount = trackExpiry ? live.filter((s) => s.expiry && toIsoDate(s.expiry) < today).length : 0;
  const expiringCount = trackExpiry
    ? live.filter(
        (s) => s.expiry && toIsoDate(s.expiry) >= today && diffDays(s.expiry, today) <= warn
      ).length
    : 0;
  const lowStockCount = db.items.filter((i) => {
    const st = db.stocks
      .filter((s) => s.itemId === i.id)
      .reduce((a, s) => a + (+s.qty || 0), 0);
    return i.reorder > 0 && st <= i.reorder;
  }).length;
  const checksOpen = db.checks.filter(
    (c) => c.status !== 'cleared' && c.status !== 'bounced' && checkRemaining(c) > 0.005
  ).length;
  const inTransitCount = db.transfers.filter((t) => t.status === 'transit').length;
  const onWayCount = db.intakes.filter((p) => {
    const arrivedOf = (iid: string) =>
      db.arrivals
        .filter((a) => a.intakeId === p.id)
        .reduce(
          (a, x) =>
            a +
            (x.lines || [])
              .filter((l) => l.itemId === iid)
              .reduce((y, l) => y + (+l.qty || 0), 0),
          0
        );
    return p.lines.some((l) => l.qty - arrivedOf(l.itemId) > 0.005);
  }).length;

  const alertCount =
    (canInv ? expiredCount + expiringCount + lowStockCount : 0) +
    (canChecks ? checksOpen : 0) +
    (canTransfers ? inTransitCount : 0) +
    (canDisposals ? db.disposals.filter((d) => d.status === 'pending').length : 0);

  // Debt rows (receivable / payable overdue ranking)
  const debtRows = db.customers
    .map((c) => {
      const balance = custBalance(db, c);
      const pays = db.payments.filter((p) => p.customerId === c.id && p.dir !== 'out');
      const lastPay = pays.length ? pays.map((p) => p.date).sort().pop() : null;
      return {
        id: c.id,
        name: c.name,
        isProvider: !!c.isProvider,
        phone: c.phone,
        lastPay,
        days: lastPay ? diffDays(today, lastPay) : null,
        balance,
        rawCustomer: c,
      };
    })
    .filter((r) => r.balance > 0.005)
    .sort((a, b) => b.balance - a.balance);

  return (
    <div className="space-y-4">
      {/* Primary KPI Metrics */}
      <div className={`grid grid-cols-2 ${isDirectSale ? 'lg:grid-cols-4' : 'lg:grid-cols-5'} gap-3`}>
        {canSales && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t('Accounts Receivable')}
              </span>
              <Receipt className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-xl font-bold text-rose-600 flex items-baseline gap-1.5">
              <span>{fmt(ar)}</span>
              {db.settings.currency && (
                <span className="text-xs font-semibold text-rose-400">{db.settings.currency}</span>
              )}
            </div>
          </div>
        )}

        {canSales && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t('Sales   Month')}
              </span>
              <TrendingUp className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-xl font-bold text-slate-900 flex items-baseline gap-1.5">
              <span>{fmt(monthSales)}</span>
              {db.settings.currency && (
                <span className="text-xs font-semibold text-slate-400">{db.settings.currency}</span>
              )}
            </div>
          </div>
        )}

        {canSales && !isDirectSale && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t('Backlog Value')}
              </span>
              <Package className="w-4 h-4 text-indigo-500" />
            </div>
            <div className="text-xl font-bold text-indigo-600 flex items-baseline gap-1.5">
              <span>{fmt(promisedVal)}</span>
              {db.settings.currency && (
                <span className="text-xs font-semibold text-indigo-400">{db.settings.currency}</span>
              )}
            </div>
          </div>
        )}

        {canPur && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t('Accounts Payable')}
              </span>
              <CreditCard className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-xl font-bold text-amber-600 flex items-baseline gap-1.5">
              <span>{maskWorth(ap)}</span>
              {db.settings.currency && (
                <span className="text-xs font-semibold text-amber-400">{db.settings.currency}</span>
              )}
            </div>
          </div>
        )}

        {canMoney && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                {t('Banks & Cash')}
              </span>
              <Landmark className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-xl font-bold text-emerald-700 flex items-baseline gap-1.5">
              <span>{maskWorth(totalCash)}</span>
              {db.settings.currency && (
                <span className="text-xs font-semibold text-emerald-500/80">{db.settings.currency}</span>
              )}
            </div>
            {canChecks && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                {t('Cheques in Hand')}: {maskWorth(totalCheques)} {db.settings.currency || ''}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operational Pulse Second Row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div
          onClick={() => setView('alerts')}
          className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs cursor-pointer hover:border-blue-400 transition-colors"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider">
              {t('Open Alerts')}
            </span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-lg font-bold text-slate-900">
            {alertCount}{' '}
            {canInv && trackExpiry && (
              <span className="text-xs font-normal text-slate-400">
                (expired: {expiredCount}, soon: {expiringCount})
              </span>
            )}
          </div>
        </div>

        {canInv && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t('Low Stock Items')}
            </div>
            <div
              className={`text-xl font-bold ${
                lowStockCount > 0 ? 'text-rose-600' : 'text-emerald-600'
              }`}
            >
              {lowStockCount}
            </div>
          </div>
        )}

        {canChecks && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t('Checks Open')}
            </div>
            <div className="text-xl font-bold text-slate-900">{checksOpen}</div>
          </div>
        )}

        {canTransfers && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t('In Transit')}
            </div>
            <div className="text-xl font-bold text-slate-900 flex items-center gap-1.5">
              <Truck className="w-4 h-4 text-slate-400" />
              {inTransitCount}
            </div>
          </div>
        )}

        {canPur && (
          <div className="bg-white rounded-2xl p-4 border border-slate-200/90 shadow-2xs">
            <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              {t('On the Way (buying)')}
            </div>
            <div
              className={`text-xl font-bold ${
                onWayCount > 0 ? 'text-indigo-600' : 'text-slate-900'
              }`}
            >
              {onWayCount}{' '}
              <span className="text-xs font-normal text-slate-400">{t('receipt(s)')}</span>
            </div>
          </div>
        )}
      </div>

      {/* Accounts Receivable / Outstanding Balances Action Table */}
      {(canSales || canPur || canLedger || canCustomers) && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200/80 flex items-center justify-between">
            <div className="font-bold text-sm md:text-base text-slate-900 flex items-center gap-2">
              <span>⚡</span>
              <span>Accounts Receivable / Payable</span>
            </div>
            {canPaybook && (
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                {t('click Receive to register a payment')}
              </span>
            )}
          </div>

          {/* Mobile Receivables / Payables List */}
          <div className="md:hidden divide-y divide-slate-200">
            {debtRows.map((r) => (
              <div key={r.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm text-slate-900 flex items-center gap-1.5 flex-wrap">
                      <span>{r.name}</span>
                      {r.isProvider && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                          {t('provider')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">{r.phone || '—'}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>
                        {t('Last Payment')}: {r.lastPay ? fmtDate(r.lastPay) : 'never'}
                      </span>
                      {r.days !== null && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                            r.days > 60
                              ? 'bg-rose-100 text-rose-700'
                              : r.days > 30
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {r.days}d
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-[10px] uppercase text-slate-400">{t('Balance Due')}</div>
                    <div className="font-bold text-sm text-rose-600 tabular-nums">{fmt(r.balance)}</div>
                  </div>
                </div>

                {(canPaybook || canLedger) && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                    {canPaybook && (
                      <button
                        type="button"
                        onClick={() => onOpenPayment(r.rawCustomer)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold cursor-pointer"
                      >
                        {t('Receive')}
                      </button>
                    )}
                    {canLedger && (
                      <button
                        type="button"
                        onClick={() => onOpenLedger(r.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        {t('Ledger')}
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {debtRows.length === 0 && (
              <div className="p-6 text-center text-slate-400 text-sm">{t('No outstanding balances.')}</div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50/80 border-b border-slate-200/80">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('Customer')}</th>
                  <th className="text-left px-3 py-2.5">{t('Phone')}</th>
                  <th className="text-left px-3 py-2.5">{t('Last Payment')}</th>
                  <th className="text-center px-3 py-2.5">{t('Days Since')}</th>
                  <th className="text-center px-3 py-2.5">{t('Balance Due')}</th>
                  {(canPaybook || canLedger) && (
                    <th className="text-right px-4 py-2.5">{t('Actions')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {debtRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-slate-800">
                      {r.name}
                      {r.isProvider && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full ml-1.5">
                          {t('provider')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{r.phone || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {r.lastPay ? fmtDate(r.lastPay) : 'never'}
                    </td>
                    <td className="text-center py-2.5 text-xs">
                      {r.days !== null ? (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            r.days > 60
                              ? 'bg-rose-100 text-rose-700'
                              : r.days > 30
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}
                        >
                          {r.days}d
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-center py-2.5 font-bold text-rose-600">{fmt(r.balance)}</td>
                    {(canPaybook || canLedger) && (
                      <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                        {canPaybook && (
                          <button
                            type="button"
                            onClick={() => onOpenPayment(r.rawCustomer)}
                            className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline cursor-pointer"
                          >
                            {t('Receive')}
                          </button>
                        )}
                        {canLedger && (
                          <button
                            type="button"
                            onClick={() => onOpenLedger(r.id)}
                            className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                          >
                            {t('Ledger')}
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {debtRows.length === 0 && (
                  <tr>
                    <td colSpan={canPaybook || canLedger ? 6 : 5} className="p-6 text-center text-slate-400 text-sm">
                      {t('No outstanding balances.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
