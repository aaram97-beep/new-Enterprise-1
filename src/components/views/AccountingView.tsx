import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, r2, addDays, todayStr, diffDays } from '../../utils/formatters';
import {
  computeTrialBalance,
  computeJournal,
  computePnL,
  computeBalanceSheet,
  computeCashFlow,
  custBalance,
  intakeBalance,
} from '../../utils/calculations';
import { exportCSV } from '../../utils/exportImport';
import { printHtml, prHead, prFoot } from '../../utils/printService';
import { Download, Printer, Info } from 'lucide-react';

export const AccountingView: React.FC = () => {
  const { db, t, canAccess, canViewReport, canViewCompanyWorth, maskWorth, canViewCost, maskCost } = useIMS();
  const canUseChecks = canAccess('checks');
  const canUsePurchasing = canAccess('purchasing');
  const isDirectSale = db.settings.directSaleMode === true;
  const today = todayStr();
  const [accTab, setAccTab] = useState<
    'trial' | 'journal' | 'income' | 'apaging' | 'balance' | 'cashflow'
  >('trial');
  const [accRange, setAccRange] = useState({ from: addDays(today, -365), end: today });
  const [pnlBasis, setPnlBasis] = useState<'invoice' | 'delivery'>('invoice');
  const effectivePnlBasis: 'invoice' | 'delivery' = isDirectSale ? 'invoice' : pnlBasis;

  const allAccTabs = [
    { id: 'trial', label: 'Trial Balance' },
    { id: 'journal', label: 'General Journal' },
    { id: 'income', label: 'Income Statement' },
    { id: 'apaging', label: 'A/P Aging' },
    { id: 'balance', label: 'Balance Sheet' },
    { id: 'cashflow', label: 'Cash Flow' },
  ];

  const accTabs = allAccTabs.filter((tab) => {
    if (tab.id === 'apaging' && !canUsePurchasing) return false;
    if (tab.id === 'balance' && !canViewCompanyWorth()) return false;
    return canViewReport(tab.id);
  });
  const activeAccTab = accTabs.some((t) => t.id === accTab) ? accTab : (accTabs[0]?.id as any) || '';

  // 1. Trial Balance
  const trialResult = computeTrialBalance(db, accRange.from, accRange.end);

  // 2. General Journal
  const journalRows = computeJournal(db, accRange.from, accRange.end);

  // 3. Income Statement
  const pnlRows = computePnL(db, accRange.from, accRange.end, effectivePnlBasis);

  // 4. A/P Aging
  const apAgingRows = db.customers
    .filter((c) => c.isProvider)
    .map((c) => {
      const balance = custBalance(db, c);
      const open = db.intakes.filter((p) => p.providerId === c.id && intakeBalance(db, p) > 0.005);
      if (balance >= -0.005 || !open.length) return null;
      const pays = db.payments.filter((p) => p.customerId === c.id && p.dir === 'out');
      const lastPay = pays.length ? pays.map((p) => p.date).sort().pop() : null;
      const docAge = Math.max(...open.map((p) => diffDays(today, p.date || today)));
      const label = docAge <= 30 ? '0-30' : docAge <= 60 ? '31-60' : docAge <= 90 ? '61-90' : '90+';
      return { id: c.id, name: c.name, balance: r2(-balance), count: open.length, lastPay, docAge, label };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.docAge - a.docAge);

  const apAgingSum = (bk: string) =>
    r2(apAgingRows.filter((r) => r.label === bk).reduce((a, r) => a + r.balance, 0));

  const agingRowClass = (label: string) =>
    ({
      '0-30': 'bg-emerald-100 text-emerald-700',
      '31-60': 'bg-amber-100 text-amber-700',
      '61-90': 'bg-orange-100 text-orange-700',
      '90+': 'bg-rose-100 text-rose-700',
    }[label] || 'bg-slate-100 text-slate-600');

  // 5. Balance Sheet
  const balanceRows = computeBalanceSheet(db, accRange.end);

  // 6. Cash Flow
  const cashflowResult = computeCashFlow(db, accRange.from, accRange.end);

  const printReport = (reportType: string) => {
    let title = '';
    let tableHtml = '';
    let footNotes = '';

    if (reportType === 'trial') {
      title = 'Trial Balance';
      tableHtml = `<div class="pr-table-wrap"><table class="report-table"><thead><tr><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
        ${trialResult.rows.map((r) => `<tr><td>${r.acct}</td><td class="num">${r.dr ? fmt(r.dr) : '—'}</td><td class="num">${r.cr ? fmt(r.cr) : '—'}</td></tr>`).join('')}
        <tr class="grand"><td>TOTAL</td><td class="num">${fmt(trialResult.totals.dr)}</td><td class="num">${fmt(trialResult.totals.cr)}</td></tr>
      </tbody></table></div>`;
      footNotes = 'Derived from operational records. Opening Balance Difference balances seeded/imported figures.';
    } else if (reportType === 'journal') {
      title = 'General Journal';
      tableHtml = `<div class="pr-table-wrap"><table class="report-table"><thead><tr><th class="nowrap">Date</th><th class="nowrap">Ref</th><th>Memo</th><th>Account</th><th class="num">Debit</th><th class="num">Credit</th></tr></thead><tbody>
        ${journalRows.map((e) => e.lines.map((l, i) => `<tr><td class="nowrap">${i === 0 ? e.date : ''}</td><td class="nowrap">${i === 0 ? e.ref : ''}</td><td>${i === 0 ? e.memo : ''}</td><td>${l.acct}</td><td class="num">${l.dr ? fmt(l.dr) : '—'}</td><td class="num">${l.cr ? fmt(l.cr) : '—'}</td></tr>`).join('')).join('')}
      </tbody></table></div>`;
      footNotes = 'Chronological debit/credit journal derived from transactions.';
    } else if (reportType === 'income') {
      title = 'Income Statement (P&L)';
      tableHtml = `<div class="pr-table-wrap"><table class="report-table"><tbody>
        <tr><td>Sales revenue</td><td class="num">${fmt(pnlRows.revenue)}</td></tr>
        <tr><td>Less: sales returns</td><td class="num">${fmt(pnlRows.returns)}</td></tr>
        <tr class="subtotal"><td>Net sales</td><td class="num">${fmt(pnlRows.net)}</td></tr>
        <tr><td>Cost of goods sold</td><td class="num">${canViewCost() ? fmt(pnlRows.cogs) : '***'}</td></tr>
        <tr class="subtotal"><td>Gross profit</td><td class="num">${canViewCost() ? fmt(pnlRows.gross) : '***'}</td></tr>
        <tr><td>Discounts given</td><td class="num">${fmt(pnlRows.discGiven)}</td></tr>
        <tr><td>Write-offs & loss</td><td class="num">${fmt(pnlRows.writeoffs)}</td></tr>
        <tr><td>Operating expenses</td><td class="num">${fmt(pnlRows.opex)}</td></tr>
        <tr class="grand"><td>NET INCOME</td><td class="num">${canViewCost() ? fmt(pnlRows.netIncome) : db.settings.isBranchCompany ? '*** (Managed by Main Branch)' : '*** (Restricted)'}</td></tr>
      </tbody></table></div>`;
      footNotes = db.settings.isBranchCompany
        ? 'Branch company mode: Costs, COGS, and profit figures are managed centrally by the main headquarters.'
        : isDirectSale
        ? 'COGS evaluated at latest buying cost.'
        : `COGS evaluated at latest buying cost (${effectivePnlBasis} basis).`;
    } else if (reportType === 'balance') {
      title = 'Balance Sheet';
      tableHtml = `<div class="pr-table-wrap"><table class="report-table"><tbody>
        <tr class="section-header"><td colspan="2">ASSETS</td></tr>
        <tr><td>Accounts receivable</td><td class="num">${fmt(balanceRows.ar)}</td></tr>
        <tr><td>Inventory (at cost)</td><td class="num">${canViewCost() ? fmt(balanceRows.inventory) : '***'}</td></tr>
        <tr><td>Cash & bank</td><td class="num">${fmt(balanceRows.cash)}</td></tr>
        ${canUseChecks ? `<tr><td>Cheques in hand</td><td class="num">${fmt(balanceRows.cheques)}</td></tr>` : ''}
        <tr class="subtotal"><td>Total assets</td><td class="num">${canViewCompanyWorth() ? fmt(balanceRows.assets) : '***'}</td></tr>
        <tr class="section-header"><td colspan="2">LIABILITIES & EQUITY</td></tr>
        <tr><td>Accounts payable</td><td class="num">${fmt(balanceRows.ap)}</td></tr>
        <tr><td>Equity (incl. retained)</td><td class="num">${canViewCompanyWorth() ? fmt(balanceRows.equity) : '***'}</td></tr>
        <tr class="grand"><td>Total liabilities & equity</td><td class="num">${canViewCompanyWorth() ? fmt(balanceRows.ap + balanceRows.equity) : '***'}</td></tr>
      </tbody></table></div>`;
      footNotes = `As of ${balanceRows.asOf}.`;
    }

    const head = prHead(db, title, { no: '', date: `${accRange.from}   ${accRange.end}` });
    const fullHtml = head + tableHtml + prFoot(db, footNotes);
    printHtml(fullHtml, title, `${title.replace(/\s+/g, '_')}_${accRange.from}_${accRange.end}`);
  };

  return (
    <div className="space-y-4">
      {/* Tabs and Date Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {accTabs.map((tb) => (
          <button
            key={tb.id}
            type="button"
            onClick={() => setAccTab(tb.id as any)}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
              activeAccTab === tb.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t(tb.label)}
          </button>
        ))}
        {accTabs.length === 0 && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-semibold">
            {t('You do not have permission to view accounting statements. Please contact an administrator.')}
          </div>
        )}
        <div className="flex items-center gap-2 text-xs text-slate-500 ml-auto">
          <label className="flex items-center gap-1">
            {t('From')}{' '}
            <input
              type="date"
              value={accRange.from}
              onChange={(e) => setAccRange((p) => ({ ...p, from: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
            />
          </label>
          <label className="flex items-center gap-1">
            {t('To')}{' '}
            <input
              type="date"
              value={accRange.end}
              onChange={(e) => setAccRange((p) => ({ ...p, end: e.target.value }))}
              className="border border-slate-300 rounded-lg px-2 py-1 text-xs"
            />
          </label>
        </div>
      </div>

      {/* 1. Trial Balance */}
      {activeAccTab === 'trial' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Trial Balance')}
            </h2>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'trial-balance',
                  trialResult.rows.map((r) => ({
                    account: r.acct,
                    debit: r.dr,
                    credit: r.cr,
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => printReport('trial')}
              title={t('Print')}
              aria-label={t('Print')}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('Account')}</th>
                  <th className="text-center px-4 py-2.5 w-36">{t('Debit')}</th>
                  <th className="text-center px-4 py-2.5 w-36">{t('Credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trialResult.rows.map((r) => (
                  <tr key={r.acct} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.acct}</td>
                    <td className="text-center py-2.5 font-semibold text-slate-900">
                      {r.dr ? fmt(r.dr) : '—'}
                    </td>
                    <td className="text-center py-2.5 font-semibold text-slate-900">
                      {r.cr ? fmt(r.cr) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-bold bg-slate-50/80">
                  <td className="px-4 py-2.5">{t('TOTAL')}</td>
                  <td className="text-center py-2.5 text-base text-slate-900">
                    {fmt(trialResult.totals.dr)}
                  </td>
                  <td className="text-center py-2.5 text-base text-slate-900">
                    {fmt(trialResult.totals.cr)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* 2. General Journal */}
      {activeAccTab === 'journal' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('General Journal')}
            </h2>
            <button
              type="button"
              onClick={() => {
                const rows: any[] = [];
                journalRows.forEach((e) =>
                  e.lines.forEach((l, i) =>
                    rows.push({
                      date: i === 0 ? e.date : '',
                      ref: i === 0 ? e.ref : '',
                      memo: i === 0 ? e.memo : '',
                      account: l.acct,
                      debit: l.dr,
                      credit: l.cr,
                    })
                  )
                );
                exportCSV('general-journal', rows);
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => printReport('journal')}
              title={t('Print')}
              aria-label={t('Print')}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <div className="overflow-x-auto max-h-[65vh] border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">{t('Date')}</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">{t('Ref')}</th>
                  <th className="text-left px-3 py-2.5">{t('Memo')}</th>
                  <th className="text-left px-3 py-2.5 whitespace-nowrap">{t('Account')}</th>
                  <th className="text-center px-3 py-2.5 w-28 whitespace-nowrap">{t('Debit')}</th>
                  <th className="text-center px-3 py-2.5 w-28 whitespace-nowrap">{t('Credit')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {journalRows.map((e) => (
                  <React.Fragment key={e.key}>
                    {e.lines.map((l, i) => (
                      <tr key={`${e.key}-${i}`} className="hover:bg-slate-50/70">
                        <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{i === 0 ? fmtDate(e.date) : ''}</td>
                        <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900 whitespace-nowrap">
                          {i === 0 ? e.ref : ''}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600 min-w-[140px]">{i === 0 ? e.memo : ''}</td>
                        <td className="px-3 py-2 text-xs font-medium text-slate-800 whitespace-nowrap">{l.acct}</td>
                        <td className="text-center px-3 py-2 text-xs font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                          {l.dr ? fmt(l.dr) : '—'}
                        </td>
                        <td className="text-center px-3 py-2 text-xs font-semibold text-slate-900 whitespace-nowrap tabular-nums">
                          {l.cr ? fmt(l.cr) : '—'}
                        </td>
                      </tr>
                    ))}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. Income Statement */}
      {activeAccTab === 'income' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Income Statement (P&L)')}
            </h2>
            {!isDirectSale && (
              <label className="text-xs text-slate-500 flex items-center gap-1.5">
                <span>Revenue basis:</span>
                <select
                  value={pnlBasis}
                  onChange={(e) => setPnlBasis(e.target.value as any)}
                  className="border border-slate-300 rounded-xl px-2.5 py-1 text-xs bg-white cursor-pointer"
                >
                  <option value="invoice">{t('Invoice date')}</option>
                  <option value="delivery">{t('Delivery date')}</option>
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() =>
                exportCSV('income-statement', [
                  { line: 'Sales revenue', amount: pnlRows.revenue, ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Less: sales returns', amount: pnlRows.returns, ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Net sales', amount: pnlRows.net, ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Cost of goods sold', amount: canViewCost() ? pnlRows.cogs : '***', ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Gross profit', amount: canViewCost() ? pnlRows.gross : '***', ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Discounts given', amount: pnlRows.discGiven, ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Write-offs', amount: pnlRows.writeoffs, ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'Operating expenses', amount: pnlRows.opex, ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                  { line: 'NET INCOME', amount: canViewCost() ? pnlRows.netIncome : '***', ...(isDirectSale ? {} : { basis: effectivePnlBasis }) },
                ])
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => printReport('income')}
              title={t('Print')}
              aria-label={t('Print')}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          {db.settings.isBranchCompany && (
            <div className="max-w-xl p-3 bg-amber-50 border border-amber-200/90 text-amber-900 rounded-xl text-xs flex items-center gap-2">
              <Info className="w-4 h-4 shrink-0 text-amber-600" />
              <span>
                {t(
                  'Branch Company Mode: Costs, COGS, and profit calculations are managed centrally by the main headquarters.'
                )}
              </span>
            </div>
          )}

          <div className="overflow-x-auto max-w-xl border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">{t('Sales revenue')}</td>
                  <td className="text-right px-4 py-2.5 font-semibold">{fmt(pnlRows.revenue)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">{t('Less: sales returns (credit notes)')}</td>
                  <td className="text-right px-4 py-2.5 text-slate-500">- {fmt(pnlRows.returns)}</td>
                </tr>
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-2.5">{t('Net sales')}</td>
                  <td className="text-right px-4 py-2.5">{fmt(pnlRows.net)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">{t('Cost of goods sold')}</td>
                  <td className="text-right px-4 py-2.5 text-slate-600">- {maskCost(pnlRows.cogs)}</td>
                </tr>
                <tr className="bg-slate-50 font-semibold text-slate-900">
                  <td className="px-4 py-2.5">{t('Gross profit')}</td>
                  <td className="text-right px-4 py-2.5">{maskCost(pnlRows.gross)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">{t('Settlement discounts given')}</td>
                  <td className="text-right px-4 py-2.5 text-slate-600">- {fmt(pnlRows.discGiven)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">{t('Write-offs & exchange losses')}</td>
                  <td className="text-right px-4 py-2.5 text-slate-600">- {fmt(pnlRows.writeoffs)}</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 text-slate-700">{t('Operating expenses')}</td>
                  <td className="text-right px-4 py-2.5 text-slate-600">- {fmt(pnlRows.opex)}</td>
                </tr>
                <tr className="border-t-2 border-slate-300 font-bold text-base bg-slate-50">
                  <td className="px-4 py-3">{t('NET INCOME')}</td>
                  <td
                    className={`text-right px-4 py-3 ${
                      pnlRows.netIncome >= 0 ? 'text-emerald-700' : 'text-rose-600'
                    }`}
                  >
                    {canViewCost()
                      ? fmt(pnlRows.netIncome)
                      : db.settings.isBranchCompany
                      ? t('*** (Managed by Main Branch)')
                      : t('*** (Restricted)')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. A/P Aging */}
      {activeAccTab === 'apaging' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('A/P Aging   Provider Payables')}
            </h2>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'ap-aging',
                  apAgingRows.map((r) => ({
                    provider: r.name,
                    totalPayable: r.balance,
                    openReceipts: r.count,
                    lastPayment: r.lastPay || 'never',
                    oldestDocDays: r.docAge,
                    bucket: r.label,
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['0-30', '31-60', '61-90', '90+'].map((bk) => (
              <div key={bk} className="rounded-xl border border-slate-200 p-3 bg-slate-50/50">
                <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-0.5">
                  {bk} days
                </div>
                <div className="text-lg font-bold text-slate-900">{fmt(apAgingSum(bk))}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('Provider')}</th>
                  <th className="text-center px-4 py-2.5">{t('Total Payable')}</th>
                  <th className="text-center px-4 py-2.5">{t('Open Receipts')}</th>
                  <th className="text-center px-4 py-2.5">{t('Oldest Doc')}</th>
                  <th className="text-center px-4 py-2.5">{t('Bucket')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {apAgingRows.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-medium text-slate-900">{r.name}</td>
                    <td className="text-center py-2.5 font-bold text-amber-600">{fmt(r.balance)}</td>
                    <td className="text-center py-2.5 text-xs text-slate-500">{r.count}</td>
                    <td className="text-center py-2.5 text-xs font-mono">{r.docAge}d</td>
                    <td className="text-center py-2.5">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${agingRowClass(r.label)}`}>
                        {r.label}
                      </span>
                    </td>
                  </tr>
                ))}
                {apAgingRows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-slate-400 text-sm">
                      {t('No provider payables outstanding.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Balance Sheet */}
      {activeAccTab === 'balance' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Balance Sheet')}
            </h2>
            <button
              type="button"
              onClick={() => printReport('balance')}
              title={t('Print')}
              aria-label={t('Print')}
              className="border border-slate-300 hover:bg-slate-50 text-slate-700 p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer"
            >
              <Printer className="w-4 h-4" />
            </button>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40">
              <div className="font-bold text-base text-blue-700 mb-3">{t('Assets')}</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-600">{t('Accounts receivable')}</span>
                  <b className="font-bold text-slate-900">{fmt(balanceRows.ar)}</b>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-600">{t('Inventory (at cost)')}</span>
                  <b className="font-bold text-slate-900">{maskCost(balanceRows.inventory)}</b>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-600">{t('Cash & bank')}</span>
                  <b className="font-bold text-slate-900">{fmt(balanceRows.cash)}</b>
                </div>
                {canUseChecks && (
                  <div className="flex justify-between border-b border-slate-100 pb-1.5">
                    <span className="text-slate-600">{t('Cheques in hand')}</span>
                    <b className="font-bold text-slate-900">{fmt(balanceRows.cheques)}</b>
                  </div>
                )}
                <div className="flex justify-between pt-2 border-t-2 border-slate-300 font-bold text-base text-slate-900">
                  <span>{t('Total assets')}</span>
                  <span>{maskWorth(balanceRows.assets)}</span>
                </div>
              </div>
            </div>

            <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/40">
              <div className="font-bold text-base text-amber-700 mb-3">
                {t('Liabilities & Equity')}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-600">{t('Accounts payable')}</span>
                  <b className="font-bold text-slate-900">{fmt(balanceRows.ap)}</b>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-1.5">
                  <span className="text-slate-600">{t('Equity (incl. retained result)')}</span>
                  <b className="font-bold text-slate-900">{maskWorth(balanceRows.equity)}</b>
                </div>
                <div className="flex justify-between pt-2 border-t-2 border-slate-300 font-bold text-base text-slate-900">
                  <span>{t('Total liabilities & equity')}</span>
                  <span>{maskWorth(balanceRows.ap + balanceRows.equity)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. Cash Flow */}
      {activeAccTab === 'cashflow' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Cash Flow Summary')}
            </h2>
            <button
              type="button"
              onClick={() =>
                exportCSV(
                  'cash-flow',
                  cashflowResult.rows.map((r) => ({
                    date: r.date,
                    ref: r.no,
                    account: r.account,
                    inflow: r.inflow,
                    outflow: r.outflow,
                  }))
                )
              }
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 p-3 bg-emerald-50/50">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800 mb-0.5">
                {t('Cash In')}
              </div>
              <div className="text-xl font-bold text-emerald-700">
                {fmt(cashflowResult.totals.in)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 bg-rose-50/50">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-rose-800 mb-0.5">
                {t('Cash Out')}
              </div>
              <div className="text-xl font-bold text-rose-600">
                {fmt(cashflowResult.totals.out)}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3 bg-slate-50">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-600 mb-0.5">
                Net
              </div>
              <div className="text-xl font-bold text-slate-900">
                {fmt(cashflowResult.totals.net)}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left px-3 py-2.5">{t('Date')}</th>
                  <th className="text-left px-3 py-2.5">{t('No')}</th>
                  <th className="text-left px-3 py-2.5">{t('Account')}</th>
                  <th className="text-center px-3 py-2.5">{t('In')}</th>
                  <th className="text-center px-3 py-2.5">{t('Out')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {cashflowResult.rows.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 text-xs text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2 font-mono text-xs font-semibold text-slate-900">
                      {r.no}
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-700">{r.account}</td>
                    <td className="text-center py-2 text-xs font-semibold text-emerald-600">
                      {r.inflow ? fmt(r.inflow) : '—'}
                    </td>
                    <td className="text-center py-2 text-xs font-semibold text-rose-600">
                      {r.outflow ? fmt(r.outflow) : '—'}
                    </td>
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
