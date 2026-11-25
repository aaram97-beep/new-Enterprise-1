import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { fmt, fmtDate, fmtDateTime, r2, diffDays, addDays, todayStr } from '../../utils/formatters';
import { custBalance, lineNet } from '../../utils/calculations';
import { exportCSV } from '../../utils/exportImport';
import { getGlobalTrackFlags } from '../../utils/tracking';
import { Download } from 'lucide-react';

export const ReportsView: React.FC = () => {
  const { db, stockOf, t, canAccess, canViewReport, canViewCost, canViewCompanyWorth, maskCost } = useIMS();
  const canSales = canAccess('sales');
  const canPur = canAccess('purchasing');
  const canInv = canAccess('inventory');
  const canDisposals = canAccess('disposals');
  const canBarter = canAccess('barter');
  const isDirectSale = db.settings.directSaleMode === true;
  const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
  const today = todayStr();
  const [reportKind, setReportKind] = useState<
    'aging' | 'valuation' | 'itemcard' | 'movement' | 'loss' | 'audit'
  >('aging');

  // A/R Aging state
  const [agingSearch, setAgingSearch] = useState('');
  const [agingSortAsc, setAgingSortAsc] = useState(false);
  const agingBucketKeys = ['0-30', '31-60', '61-90', '90+'];

  // Valuation state
  const [valBranch, setValBranch] = useState<string>('0');

  // Item Card state
  const [cardItemId, setCardItemId] = useState<string>('');
  const [cardRange, setCardRange] = useState({ from: addDays(today, -90), until: today });
  const [cardBranch, setCardBranch] = useState<string>('0');

  // Movement velocity state
  const [range, setRange] = useState({ from: addDays(today, -30), end: today });

  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';

  // 1. Aging calculations
  const agingRows = db.customers
    .map((c) => {
      const balance = custBalance(db, c);
      const open = db.invoices.filter((s) => s.customerId === c.id);
      if (balance <= 0.005 || !open.length) return null;
      const pays = db.payments.filter((p) => p.customerId === c.id && p.dir !== 'out');
      const lastPay = pays.length ? pays.map((p) => p.date).sort().pop() : null;
      const days = lastPay ? diffDays(today, lastPay) : null;
      const docAge = Math.max(...open.map((s) => diffDays(today, s.date || today)));
      const label = docAge <= 30 ? '0-30' : docAge <= 60 ? '31-60' : docAge <= 90 ? '61-90' : '90+';
      return { id: c.id, name: c.name, balance: r2(balance), count: open.length, lastPay, days, docAge, label };
    })
    .filter(Boolean) as any[];

  const filteredAging = agingRows
    .filter((r) => !agingSearch || r.name.toLowerCase().includes(agingSearch.trim().toLowerCase()))
    .sort((a, b) => (agingSortAsc ? a.docAge - b.docAge : b.docAge - a.docAge));

  const agingSum = (bk: string) =>
    r2(filteredAging.filter((r) => r.label === bk).reduce((a, r) => a + r.balance, 0));

  const agingRowClass = (label: string) =>
    ({
      '0-30': 'bg-emerald-100 text-emerald-700',
      '31-60': 'bg-amber-100 text-amber-700',
      '61-90': 'bg-orange-100 text-orange-700',
      '90+': 'bg-rose-100 text-rose-700',
    }[label] || 'bg-slate-100 text-slate-600');

  // 2. Valuation rows
  const valuationRows = db.stocks.filter(
    (s) => s.qty > 0.005 && (valBranch === '0' || s.branchId === valBranch)
  );

  const expiryChip = (expiry?: string) => {
    if (!expiry) return 'bg-slate-100 text-slate-600';
    const dd = diffDays(expiry, today);
    if (dd < 0) return 'bg-rose-100 text-rose-700';
    if (dd <= (+db.settings.expiryWarnDays || 30)) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const expiryLabel = (expiry?: string) => {
    if (!expiry) return 'no expiry';
    const dd = diffDays(expiry, today);
    if (dd < 0) return 'expired';
    if (dd <= (+db.settings.expiryWarnDays || 30)) return `${dd}d left`;
    return 'fresh';
  };

  // 3. Item card movement audit trail
  const allItemMoves = (itemId: string, bId: string) => {
    const mv: any[] = [];
    const bFilter = bId !== '0';

    if (canPur) {
      db.arrivals.forEach((a) => {
        const rc = db.intakes.find((x) => x.id === a.intakeId) || { providerId: '', no: '' };
        if (bFilter && a.branchId !== bId) return;
        a.lines.forEach((l) => {
          if (l.itemId !== itemId) return;
          mv.push({
            date: a.date,
            type: 'arrival',
            cls: 'bg-emerald-100 text-emerald-700',
            no: a.no,
            party: customerName(rc.providerId),
            note: `for ${rc.no || '—'}`,
            qty: r2(l.qty),
            delta: r2(l.qty),
          });
        });
      });
    }

    if (canSales) {
      db.deliveries.forEach((x) => {
        if (bFilter && x.branchId !== bId) return;
        const inv = x.invoiceId ? db.invoices.find((i) => i.id === x.invoiceId) : null;
        x.lines.forEach((l) => {
          if (l.itemId !== itemId) return;
          mv.push({
            date: x.date,
            type: isDirectSale && inv ? 'sale' : 'delivery',
            cls: 'bg-blue-100 text-blue-700',
            no: isDirectSale && inv ? inv.no : x.no,
            party: customerName(x.customerId),
            note: isDirectSale && inv ? inv.note || 'direct sale' : `invoice ${inv?.no || '—'}`,
            qty: r2(l.qty),
            delta: -r2(l.qty),
          });
        });
      });

      db.returnSlips.forEach((x) => {
        if (bFilter && x.branchId !== bId) return;
        x.lines.forEach((l) => {
          if (l.itemId !== itemId) return;
          mv.push({
            date: x.date,
            type: 'return',
            cls: 'bg-indigo-100 text-indigo-700',
            no: x.no,
            party: customerName(x.customerId),
            note: x.note || 'items returned',
            qty: r2(l.qty),
            delta: r2(l.qty),
          });
        });
      });
    }

    db.adjusts.forEach((a) => {
      if (a.itemId !== itemId) return;
      if (bFilter && a.branchId !== bId) return;
      mv.push({
        date: a.date,
        type: 'adjust',
        cls: 'bg-slate-200 text-slate-700',
        no: '—',
        party: a.user || '',
        note: a.reason || '',
        qty: r2(a.qty),
        delta: r2(a.qty),
      });
    });

    mv.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return mv;
  };

  const cardOpening = (() => {
    if (!cardItemId || !cardRange.from) return 0;
    let mv = allItemMoves(cardItemId, cardBranch);
    if (cardRange.from) mv = mv.filter((m) => (m.date || '') < cardRange.from);
    return r2(mv.reduce((a, m) => a + m.delta, 0));
  })();

  const itemCardRows = (() => {
    if (!cardItemId) return [];
    let mv = allItemMoves(cardItemId, cardBranch);
    if (cardRange.from) mv = mv.filter((m) => (m.date || '') >= cardRange.from);
    if (cardRange.until) mv = mv.filter((m) => (m.date || '') <= cardRange.until);
    let run = cardOpening;
    return mv.map((m, i) => {
      run = r2(run + m.delta);
      return { key: `${m.type}-${i}`, ...m, run };
    });
  })();

  // 4. Movement Velocity
  const fromDate = range.from || '0000-01-01';
  const toDate = range.end || '9999-12-31';
  const daysDiff = Math.max(1, (fromDate <= toDate ? diffDays(toDate, fromDate) : 0) + 1);
  const inRange = (d: string) => d && d >= fromDate && d <= toDate;

  const movementRows = db.items
    .map((it) => {
      const sold = r2(
        db.invoices
          .filter((s) => inRange(s.date))
          .reduce(
            (a, s) =>
              a + s.lines.filter((l) => l.itemId === it.id).reduce((x, l) => x + (+l.qty || 0), 0),
            0
          )
      );
      const delivered = r2(
        db.deliveries
          .filter((x) => inRange(x.date))
          .reduce(
            (a, x) =>
              a + x.lines.filter((l) => l.itemId === it.id).reduce((y, l) => y + (+l.qty || 0), 0),
            0
          )
      );
      const revenue = r2(
        db.invoices
          .filter((s) => inRange(s.date))
          .reduce(
            (a, s) =>
              a +
              s.lines
                .filter((l) => l.itemId === it.id)
                .reduce((x, l) => x + lineNet(l), 0),
            0
          )
      );
      const purchased = r2(
        db.intakes
          .filter((p) => inRange(p.date))
          .reduce(
            (a, p) =>
              a + p.lines.filter((l) => l.itemId === it.id).reduce((x, l) => x + (+l.qty || 0), 0),
            0
          )
      );
      const endStock = stockOf(it.id, null);
      const outQty = isDirectSale ? sold : delivered;
      const velocity = r2(outQty / daysDiff);
      const cls = outQty <= 0.005 ? 'dead' : velocity >= 1 ? 'fast' : 'slow';
      return { id: it.id, name: it.name, sku: it.sku, sold, delivered, outQty, revenue, purchased, endStock, velocity, cls };
    })
    .sort((a, b) => b.outQty - a.outQty);

  // 5. Loss Report
  const lossRows: any[] = [];
  if (canDisposals) {
    db.disposals
      .filter((d) => d.status === 'approved')
      .forEach((d) => {
        lossRows.push({
          key: `d-${d.id}`,
          date: d.date,
          source: 'Disposal',
          no: d.no,
          branchId: d.branchId,
          reason: d.lines.map((l) => l.reason).join(', '),
          loss: r2(d.lines.reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0)),
        });
      });
  }

  if (canBarter) {
    db.barters.forEach((b) => {
      if ((b.loss || 0) > 0.005) {
        lossRows.push({
          key: `b-${b.id}`,
          date: b.date,
          source: 'Barter',
          no: b.no,
          branchId: b.branchId,
          reason: `Exchange loss   gave ${fmt(b.giveValue)}, received ${fmt(b.recvValue)}`,
          loss: r2(b.loss),
        });
      }
    });
  }
  lossRows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const itemAcRows = db.items.map((i) => ({
    id: i.id,
    label: i.name,
    sub: i.sku || '',
    code: i.barcode || i.sku || '',
  }));

  const allReportTabs = [
    { id: 'aging', label: 'A/R Aging' },
    { id: 'valuation', label: 'Stock Valuation' },
    { id: 'itemcard', label: 'Item Card' },
    { id: 'movement', label: 'Item Velocity' },
    { id: 'loss', label: 'Loss Report' },
    { id: 'audit', label: 'Audit Log' },
  ];

  const reportTabs = allReportTabs.filter((tItem) => {
    if (tItem.id === 'aging' && !canSales) return false;
    if ((tItem.id === 'valuation' || tItem.id === 'itemcard' || tItem.id === 'movement') && !canInv) return false;
    if (tItem.id === 'loss' && !canDisposals && !canBarter) return false;
    return canViewReport(tItem.id);
  });
  const activeReport = reportTabs.some((tItem) => tItem.id === reportKind)
    ? reportKind
    : (reportTabs[0]?.id as any) || '';

  return (
    <div className="space-y-4">
      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2">
        {reportTabs.map((tItem) => (
          <button
            key={tItem.id}
            type="button"
            onClick={() => setReportKind(tItem.id as any)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeReport === tItem.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t(tItem.label)}
          </button>
        ))}
        {reportTabs.length === 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold">
            {t('You do not have permission to view any reports. Please contact an administrator.')}
          </div>
        )}
      </div>

      {/* Tab: A/R Aging */}
      {activeReport === 'aging' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">{t('A/R Aging')}</h2>
            <input
              type="text"
              value={agingSearch}
              onChange={(e) => setAgingSearch(e.target.value)}
              placeholder={t('Live search')}
              className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-44 bg-white"
            />
            <button
              type="button"
              onClick={() => setAgingSortAsc(!agingSortAsc)}
              className="text-xs text-slate-600 font-medium hover:text-slate-900 cursor-pointer"
            >
              Sort by days {agingSortAsc ? '↑' : '↓'}
            </button>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'ar-aging',
                  filteredAging.map((r) => ({
                    customer: r.name,
                    balanceDue: r.balance,
                    openDocs: r.count,
                    lastPayment: r.lastPay || 'never',
                    daysSinceLastPayment: r.days == null ? '' : r.days,
                    bucket: r.label,
                    oldestDocDays: r.docAge,
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {agingBucketKeys.map((bk) => (
              <div key={bk} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-0.5">
                  {bk} days
                </div>
                <div className="text-lg font-bold text-slate-900">{fmt(agingSum(bk))}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Customer')}</th>
                  <th className="text-center px-3 py-2.5">{t('Total Due')}</th>
                  <th className="text-center px-3 py-2.5">{t('Docs')}</th>
                  <th className="text-left px-3 py-2.5">{t('Last Payment')}</th>
                  <th className="text-center px-3 py-2.5">{t('Days Since')}</th>
                  <th className="text-center px-3 py-2.5">{t('Bucket')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAging.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
                    <td className="text-center py-2.5 font-bold text-rose-600">{fmt(r.balance)}</td>
                    <td className="text-center py-2.5 text-xs text-slate-500">{r.count}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {r.lastPay ? fmtDate(r.lastPay) : 'never'}
                    </td>
                    <td className="text-center py-2.5 text-xs font-semibold">
                      {r.days === null ? '—' : `${r.days}d`}
                    </td>
                    <td className="text-center py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${agingRowClass(r.label)}`}>
                        {r.label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Stock Valuation */}
      {activeReport === 'valuation' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t(
                trackLot && trackExpiry
                  ? 'Batch & Expiry Stock Valuation'
                  : trackLot
                  ? 'Batch Stock Valuation'
                  : trackExpiry
                  ? 'Expiry Stock Valuation'
                  : 'Stock Valuation'
              )}
            </h2>
            <select
              value={valBranch}
              onChange={(e) => setValBranch(e.target.value)}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm bg-white cursor-pointer"
            >
              <option value="0">{t('All branches')}</option>
              {db.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'stock-valuation',
                  valuationRows.map((s) => {
                    const row: Record<string, any> = {
                      item: itemName(s.itemId),
                      branch: branchName(s.branchId),
                    };
                    if (trackLot) row.batch = s.batchNo;
                    if (trackExpiry) {
                      row.expiry = s.expiry ? fmtDate(s.expiry) : '';
                      row.status = expiryLabel(s.expiry);
                    }
                    row.qty = s.qty;
                    row.unitCost = canViewCost() ? s.cost : '***';
                    row.value = canViewCost() ? r2(s.qty * s.cost) : '***';
                    return row;
                  })
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Item')}</th>
                  <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                  {trackLot && <th className="text-left px-3 py-2.5">{t('Batch')}</th>}
                  {trackExpiry && <th className="text-left px-3 py-2.5">{t('Expiry')}</th>}
                  {trackExpiry && <th className="text-center px-3 py-2.5">{t('Status')}</th>}
                  <th className="text-center px-3 py-2.5">{t('Qty')}</th>
                  <th className="text-right px-3 py-2.5">{t('Unit Cost')}</th>
                  <th className="text-right px-3 py-2.5">{t('Value')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {valuationRows.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-800">{itemName(s.itemId)}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{branchName(s.branchId)}</td>
                    {trackLot && <td className="px-3 py-2 font-mono text-xs">{s.batchNo || '—'}</td>}
                    {trackExpiry && (
                      <td className="px-3 py-2 text-xs text-slate-600 whitespace-nowrap">
                        {s.expiry ? fmtDate(s.expiry) : '—'}
                      </td>
                    )}
                    {trackExpiry && (
                      <td className="px-3 text-center py-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${expiryChip(s.expiry)}`}>
                          {expiryLabel(s.expiry)}
                        </span>
                      </td>
                    )}
                    <td className="px-3 text-center py-2 font-bold text-slate-900 tabular-nums">{s.qty}</td>
                    <td className="px-3 text-right py-2 text-xs text-slate-600 font-mono tabular-nums">
                      {maskCost(s.cost)}
                    </td>
                    <td className="px-3 text-right py-2 font-semibold text-slate-900 font-mono tabular-nums">
                      {canViewCost() ? fmt(r2(s.qty * s.cost)) : '***'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right font-bold text-slate-900">
            {t('Total inventory value')}:{' '}
            {canViewCompanyWorth()
              ? fmt(valuationRows.reduce((a, s) => a + r2(s.qty * s.cost), 0))
              : db.settings.isBranchCompany
              ? t('*** (Managed by Main Branch)')
              : t('*** (Restricted)')}
          </div>
        </div>
      )}

      {/* Tab: Item Card */}
      {activeReport === 'itemcard' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Item Card   Movement Audit Trail')}
            </h2>
            <div className="w-56">
              <AutoCompleteBox
                rows={itemAcRows}
                placeholder={t('Search item')}
                onPick={(row) => setCardItemId(row.id)}
              />
            </div>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              {t('From')}{' '}
              <input
                type="date"
                value={cardRange.from}
                onChange={(e) => setCardRange((p) => ({ ...p, from: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
              />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              {t('Until')}{' '}
              <input
                type="date"
                value={cardRange.until}
                onChange={(e) => setCardRange((p) => ({ ...p, until: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
              />
            </label>
            <select
              value={cardBranch}
              onChange={(e) => setCardBranch(e.target.value)}
              className="border border-slate-300 rounded-xl px-2.5 py-1 text-xs bg-white cursor-pointer"
            >
              <option value="0">{t('All branches')}</option>
              {db.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>

          {cardItemId && (
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5">{t('Date')}</th>
                    <th className="text-left px-3 py-2.5">{t('Doc')}</th>
                    <th className="text-left px-3 py-2.5">{t('Ref')}</th>
                    <th className="text-left px-3 py-2.5">{t('Party')}</th>
                    <th className="text-left px-3 py-2.5">{t('Note')}</th>
                    <th className="text-center px-3 py-2.5">{t('Qty')}</th>
                    <th className="text-center px-3 py-2.5">{t('Stock')}</th>
                    <th className="text-center px-3 py-2.5">{t('Running')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itemCardRows.map((r) => (
                    <tr key={r.key} className="hover:bg-slate-50/70">
                      <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.date)}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${r.cls}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-800">{r.no}</td>
                      <td className="px-3 py-2 text-xs text-slate-700">{r.party}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{r.note}</td>
                      <td className="text-center py-2 font-medium">
                        {r.qty > 0 ? `+${r.qty}` : r.qty}
                      </td>
                      <td
                        className={`text-center py-2 font-semibold ${
                          r.delta > 0 ? 'text-emerald-600' : r.delta < 0 ? 'text-rose-600' : 'text-slate-400'
                        }`}
                      >
                        {r.delta > 0 ? `+${r.delta}` : r.delta || '—'}
                      </td>
                      <td className="text-center py-2 font-bold text-slate-900">{r.run}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!cardItemId && (
            <div className="p-8 text-center text-slate-400 text-sm">
              {t('Choose an item to see its full movement history.')}
            </div>
          )}
        </div>
      )}

      {/* Tab: Item Velocity */}
      {activeReport === 'movement' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Item Velocity')}
            </h2>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              {t('From')}{' '}
              <input
                type="date"
                value={range.from}
                onChange={(e) => setRange((p) => ({ ...p, from: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
              />
            </label>
            <label className="text-xs text-slate-500 flex items-center gap-1">
              {t('To')}{' '}
              <input
                type="date"
                value={range.end}
                onChange={(e) => setRange((p) => ({ ...p, end: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
              />
            </label>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'item-velocity',
                  movementRows.map((r) => ({
                    item: r.name,
                    sku: r.sku,
                    ...(canSales
                      ? {
                          invoiced: r.sold,
                          ...(isDirectSale ? {} : { delivered: r.delivered }),
                          revenue: r.revenue,
                        }
                      : {}),
                    ...(canPur ? { bought: r.purchased } : {}),
                    endStock: r.endStock,
                    velocityPerDay: r.velocity,
                    class: r.cls,
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Item')}</th>
                  {canSales && <th className="text-center px-3 py-2.5">{t('Invoiced')}</th>}
                  {canSales && !isDirectSale && <th className="text-center px-3 py-2.5">{t('Delivered')}</th>}
                  {canSales && <th className="text-center px-3 py-2.5">{t('Revenue')}</th>}
                  {canPur && <th className="text-center px-3 py-2.5">{t('Bought')}</th>}
                  <th className="text-center px-3 py-2.5">{t('End Stock')}</th>
                  <th className="text-center px-3 py-2.5">{t('Velocity/d')}</th>
                  <th className="text-center px-3 py-2.5">{t('Class')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {movementRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 font-medium text-slate-900">
                      {r.name} <span className="text-xs text-slate-400 font-mono ml-1">{r.sku}</span>
                    </td>
                    {canSales && <td className="text-center py-2.5 font-semibold text-slate-900">{r.sold}</td>}
                    {canSales && !isDirectSale && (
                      <td className="text-center py-2.5 font-bold text-slate-900">{r.delivered}</td>
                    )}
                    {canSales && <td className="text-center py-2.5 text-xs text-slate-700">{fmt(r.revenue)}</td>}
                    {canPur && <td className="text-center py-2.5">{r.purchased}</td>}
                    <td className="text-center py-2.5 font-semibold text-slate-900">{r.endStock}</td>
                    <td className="text-center py-2.5 font-mono text-xs">{r.velocity.toFixed(2)}</td>
                    <td className="text-center py-2.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          r.cls === 'fast'
                            ? 'bg-emerald-100 text-emerald-700'
                            : r.cls === 'slow'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-rose-100 text-rose-700'
                        }`}
                      >
                        {r.cls}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Loss Report */}
      {activeReport === 'loss' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base md:text-lg text-slate-900">
              {t('Head-Office Loss / Write-off Audit Report')}
            </h2>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'loss-writeoffs',
                  lossRows.map((r) => ({
                    date: r.date,
                    source: r.source,
                    ref: r.no,
                    branch: branchName(r.branchId),
                    reason: r.reason,
                    loss: canViewCompanyWorth() ? r.loss : '***',
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Date')}</th>
                  <th className="text-left px-3 py-2.5">{t('Source')}</th>
                  <th className="text-left px-3 py-2.5">{t('Ref')}</th>
                  <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                  <th className="text-left px-3 py-2.5">{t('Reason')}</th>
                  <th className="text-center px-3 py-2.5">{t('Loss')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lossRows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 text-xs font-medium text-slate-700">{r.source}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">{r.no}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{branchName(r.branchId)}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{r.reason}</td>
                    <td className="text-center py-2.5 font-bold text-rose-600 font-mono">
                      {canViewCompanyWorth() ? fmt(r.loss) : '***'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right font-bold text-rose-600 text-base">
            {t('Total write-offs')}: {canViewCompanyWorth() ? fmt(lossRows.reduce((a, r) => a + r.loss, 0)) : '*** (Restricted)'}
          </div>
        </div>
      )}

      {/* Tab: Audit Log */}
      {activeReport === 'audit' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-base md:text-lg text-slate-900">{t('Audit Log')}</h2>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'audit-log',
                  db.audit.map((a) => ({
                    time: fmtDateTime(a.ts),
                    user: a.user,
                    action: a.action,
                    details: a.details,
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto max-h-[70vh] border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Time')}</th>
                  <th className="text-left px-3 py-2.5">{t('User')}</th>
                  <th className="text-left px-3 py-2.5">{t('Action')}</th>
                  <th className="text-left px-3 py-2.5">{t('Details')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...db.audit].reverse().map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 text-xs font-mono text-slate-500">{fmtDateTime(a.ts)}</td>
                    <td className="px-3 py-2 text-xs font-semibold text-slate-800">{a.user}</td>
                    <td className="px-3 py-2 text-xs font-bold text-slate-900">{a.action}</td>
                    <td className="px-3 py-2 text-xs text-slate-600">{a.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
