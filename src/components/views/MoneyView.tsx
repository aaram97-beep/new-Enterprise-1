import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, r2, addDays, todayStr } from '../../utils/formatters';
import { accBalance } from '../../utils/calculations';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, ArrowRightLeft } from 'lucide-react';
import type { MoneyAccount } from '../../types';

interface MoneyViewProps {
  onNewAccount: () => void;
  onEditAccount: (acc: MoneyAccount) => void;
  onNewMove: () => void;
  onNewExpense: () => void;
}

export const MoneyView: React.FC<MoneyViewProps> = ({
  onNewAccount,
  onEditAccount,
  onNewMove,
  onNewExpense,
}) => {
  const {
    db,
    myBranches,
    deleteAccount,
    acceptMove,
    cancelMove,
    deleteExpense,
    sessionUser,
    toastMsg,
    t,
    canDelete,
    canEdit,
    canAccess,
    canViewCompanyWorth,
    maskWorth,
  } = useIMS();
  const canUseChecks = canAccess('checks');
  const [tab, setTab] = useState<'accounts' | 'transfers' | 'expenses' | 'history'>('accounts');
  const [expenseFilter, setExpenseFilter] = useState('');
  const [ledgerAccountFilter, setLedgerAccountFilter] = useState('');
  const today = todayStr();

  const branchName = (id: string | null) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const accountName = (id?: string | null) =>
    (db.accounts.find((a) => a.id === id) || {}).name || '—';

  // Allowed accounts for user
  const myAccounts = ((): MoneyAccount[] => {
    if (!sessionUser) return [];
    return db.accounts.filter((a) => {
      if (a.type === 'cheques') return canUseChecks;
      if (sessionUser.role === 'admin') return true;
      return myBranches.some((b) => b.id === a.branchId);
    });
  })();

  // Collected metrics
  const sumCollected = (from: string) =>
    r2(
      db.payments
        .filter((p) => p.dir !== 'out' && (p.date || '') >= from && (p.date || '') <= today)
        .reduce((s, p) => s + (+p.amount || 0), 0)
    );

  const collectedStats = {
    today: sumCollected(today),
    week: sumCollected(addDays(today, -7)),
    month: sumCollected(addDays(today, -30)),
  };

  // Money movements in transit & completed
  const moneyTransit = db.moneyMoves.filter((m) => m.status === 'transit');
  const moneyDone = db.moneyMoves.filter((m) => m.status === 'done');

  // Ledger rows
  const ledgerRows: {
    key: string;
    date: string;
    no: string;
    account: string;
    other: string;
    kind: string;
    inflow: number;
    outflow: number;
  }[] = [];

  db.payments.forEach((p) => {
    const cust = db.customers.find((c) => c.id === p.customerId);
    ledgerRows.push({
      key: `pay-${p.id}`,
      date: p.date,
      no: p.no,
      account: p.accountId || '',
      other: cust?.name || '',
      kind: p.dir === 'out' ? 'Payment out' : 'Payment in',
      inflow: p.dir === 'out' ? 0 : +p.amount || 0,
      outflow: p.dir === 'out' ? +p.amount || 0 : 0,
    });
  });

  if (canUseChecks) {
    db.checks.forEach((c) => {
      const cust = db.customers.find((custItem) => custItem.id === c.customerId);
      (c.payouts || []).forEach((p) => {
        ledgerRows.push({
          key: `chk-${c.id}-${p.id}`,
          date: p.date,
          no: c.checkNo,
          account: p.accountId || '',
          other: cust?.name || '',
          kind: 'Check payout',
          inflow: +p.amount || 0,
          outflow: 0,
        });
      });
    });
  }

  db.expenses.forEach((e) => {
    ledgerRows.push({
      key: `exp-${e.id}`,
      date: e.date,
      no: e.no,
      account: e.accountId,
      other: e.category,
      kind: 'Expense',
      inflow: 0,
      outflow: +e.amount || 0,
    });
  });

  db.moneyMoves
    .filter((m) => m.status === 'done')
    .forEach((m) => {
      ledgerRows.push({
        key: `move-${m.id}-out`,
        date: m.date,
        no: m.no,
        account: m.fromAccountId,
        other: accountName(m.toAccountId),
        kind: 'Transfer out',
        inflow: 0,
        outflow: +m.amount || 0,
      });
      ledgerRows.push({
        key: `move-${m.id}-in`,
        date: m.acceptedDate || m.date,
        no: m.no,
        account: m.toAccountId,
        other: accountName(m.fromAccountId),
        kind: 'Transfer in',
        inflow: +m.amount || 0,
        outflow: 0,
      });
    });

  const mineAccountIds = myAccounts.map((a) => a.id);
  const filteredLedger = ledgerRows
    .filter((r) => mineAccountIds.includes(r.account) && (!ledgerAccountFilter || r.account === ledgerAccountFilter))
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  const selectedFilteredAcc = db.accounts.find((a) => a.id === ledgerAccountFilter);
  let runningAccum = selectedFilteredAcc ? +selectedFilteredAcc.opening || 0 : 0;
  const ledgerWithBalance = filteredLedger.map((r) => {
    runningAccum = r2(runningAccum + r.inflow - r.outflow);
    return { ...r, running: runningAccum };
  });

  const handleExportLedger = () => {
    exportCSV(
      'money-ledger',
      ledgerWithBalance.map((r) => ({
        date: r.date,
        ref: r.no,
        account: accountName(r.account),
        details: r.other,
        kind: r.kind,
        inflow: r.inflow,
        outflow: r.outflow,
        ...(ledgerAccountFilter ? { running: r.running } : {}),
      }))
    );
  };

  const handleExportExpenses = () => {
    exportCSV(
      'expenses',
      db.expenses.map((e) => ({
        no: e.no,
        date: e.date,
        category: e.category,
        account: accountName(e.accountId),
        amount: e.amount,
        note: e.note,
      }))
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs bar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setTab('accounts')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tab === 'accounts'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('Accounts')}
        </button>
        <button
          type="button"
          onClick={() => setTab('transfers')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
            tab === 'transfers'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          <span>{t('Money Transfers')}</span>
          {moneyTransit.length > 0 && (
            <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {moneyTransit.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('expenses')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tab === 'expenses'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('Expenses')}
        </button>
        <button
          type="button"
          onClick={() => setTab('history')}
          className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            tab === 'history'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {t('History')}
        </button>
      </div>

      {/* Tab 1: Accounts */}
      {tab === 'accounts' && (
        <div className="space-y-4">
          {/* Collection stats cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 shadow-2xs">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-emerald-800 mb-1">
                {t('Collected today')}
              </div>
              <div className="text-2xl font-bold text-emerald-700">{maskWorth(collectedStats.today)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                {t('Collected this week')}
              </div>
              <div className="text-2xl font-bold text-slate-800">{maskWorth(collectedStats.week)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs">
              <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                {t('Collected this month')}
              </div>
              <div className="text-2xl font-bold text-slate-800">{maskWorth(collectedStats.month)}</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900">{t('Bank & Cash Accounts')}</h2>
            {canEdit('money') && (
              <button
                type="button"
                onClick={onNewAccount}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                {t('New Account')}
              </button>
            )}
          </div>

          {/* Accounts Grid */}
          <div className="grid md:grid-cols-3 gap-4">
            {myAccounts.map((a) => {
              const bal = accBalance(db, a);
              return (
                <div
                  key={a.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 space-y-2 relative overflow-hidden"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-bold text-slate-900 text-base">{a.name}</div>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        a.type === 'bank'
                          ? 'bg-indigo-100 text-indigo-700'
                          : a.type === 'cheques'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {a.type === 'cashbox'
                        ? t('Branch Cashbox')
                        : a.type === 'bank'
                        ? t('Bank Account')
                        : t('Cheques in Hand')}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {a.type === 'cheques' ? t('company-wide') : branchName(a.branchId)}
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 pt-1">{maskWorth(bal)}</div>
                  <div className="text-[11px] text-slate-400">
                    {t('Opening balance')}: {maskWorth(a.opening)}
                  </div>
                  {a.note && <div className="text-[11px] text-slate-400 italic">{a.note}</div>}
                  <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 text-xs">
                    <button
                      type="button"
                      onClick={() => {
                        setLedgerAccountFilter(a.id);
                        setTab('history');
                      }}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold cursor-pointer"
                    >
                      {t('View Movements')}
                    </button>
                    {canEdit('money') && (
                      <button
                        type="button"
                        onClick={() => onEditAccount(a)}
                        className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                      >
                        {t('Edit')}
                      </button>
                    )}
                    {canDelete('money') && (
                      <button
                        type="button"
                        onClick={() => {
                          const res = deleteAccount(a);
                          if (!res.ok && res.error) toastMsg(res.error, 'error');
                        }}
                        className="text-rose-600 hover:text-rose-800 font-semibold cursor-pointer"
                      >
                        {t('Del')}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {myAccounts.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm md:col-span-3">
                {t('No money accounts yet.')}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Transfers */}
      {tab === 'transfers' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold text-base md:text-lg text-slate-900">{t('Money Transfers')}</h2>
            <button
              type="button"
              onClick={onNewMove}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <ArrowRightLeft className="w-4 h-4" />
              {t('Move Money')}
            </button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            {t(
              'Cashbox to cashbox between two branches is sent in transit and must be accepted by the receiving branch. Deposits and withdrawals are instant.'
            )}
          </div>

          {/* In Transit */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-slate-900">
              {t('In Transit')} ({moneyTransit.length})
            </div>
            {moneyTransit.length > 0 ? (
              <>
                <div className="md:hidden divide-y divide-slate-200">
                  {moneyTransit.map((m) => (
                    <div key={m.id} className="p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-900">{m.no}</span>
                            <span className="text-xs text-slate-500">{fmtDate(m.date)}</span>
                          </div>
                          <div className="text-xs text-slate-700 mt-0.5 font-medium">
                            {accountName(m.fromAccountId)} → {accountName(m.toAccountId)}
                          </div>
                        </div>
                        <div className="font-bold text-sm text-slate-900 tabular-nums shrink-0">
                          {fmt(m.amount)}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                        <button
                          type="button"
                          onClick={() => acceptMove(m)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold cursor-pointer"
                        >
                          {t('Accept')}
                        </button>
                        {canDelete('transfers') && (
                          <button
                            type="button"
                            onClick={() => cancelMove(m)}
                            className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold cursor-pointer"
                          >
                            {t('Cancel')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5">{t('No')}</th>
                        <th className="text-left px-3 py-2.5">{t('Date')}</th>
                        <th className="text-left px-3 py-2.5">{t('From')}</th>
                        <th className="text-left px-3 py-2.5">{t('To')}</th>
                        <th className="text-center px-3 py-2.5">{t('Amount')}</th>
                        <th className="text-right px-4 py-2.5">{t('Actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {moneyTransit.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold">{m.no}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(m.date)}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-700">
                            {accountName(m.fromAccountId)}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-700">
                            {accountName(m.toAccountId)}
                          </td>
                          <td className="text-center py-2.5 font-bold text-slate-900">{fmt(m.amount)}</td>
                          <td className="px-4 py-2.5 text-right text-xs space-x-2">
                            <button
                              type="button"
                              onClick={() => acceptMove(m)}
                              className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline cursor-pointer"
                            >
                              {t('Accept')}
                            </button>
                            {canDelete('transfers') && (
                              <button
                                type="button"
                                onClick={() => cancelMove(m)}
                                className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                              >
                                {t('Cancel')}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-4 text-xs text-slate-400">{t('No transfers in transit.')}</div>
            )}
          </div>

          {/* Completed Moves */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/80 font-bold text-sm text-slate-900">
              {t('Completed Moves')}
            </div>
            {moneyDone.length > 0 ? (
              <>
                <div className="md:hidden divide-y divide-slate-200">
                  {moneyDone.map((m) => (
                    <div key={m.id} className="p-3.5 space-y-1.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-slate-900">{m.no}</span>
                            <span className="text-xs text-slate-500">{fmtDate(m.date)}</span>
                          </div>
                          <div className="text-xs text-slate-700 mt-0.5 font-medium">
                            {accountName(m.fromAccountId)} → {accountName(m.toAccountId)}
                          </div>
                          {m.note && <div className="text-[11px] text-slate-400 italic mt-0.5">{m.note}</div>}
                        </div>
                        <div className="font-bold text-sm text-slate-900 tabular-nums shrink-0">
                          {fmt(m.amount)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-4 py-2.5">{t('No')}</th>
                        <th className="text-left px-3 py-2.5">{t('Date')}</th>
                        <th className="text-left px-3 py-2.5">{t('From')}</th>
                        <th className="text-left px-3 py-2.5">{t('To')}</th>
                        <th className="text-center px-3 py-2.5">{t('Amount')}</th>
                        <th className="text-left px-3 py-2.5">{t('Note')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {moneyDone.map((m) => (
                        <tr key={m.id} className="hover:bg-slate-50/70">
                          <td className="px-4 py-2.5 font-mono text-xs font-semibold">{m.no}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(m.date)}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-700">
                            {accountName(m.fromAccountId)}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-700">
                            {accountName(m.toAccountId)}
                          </td>
                          <td className="text-center py-2.5 font-semibold text-slate-900">{fmt(m.amount)}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">{m.note || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className="p-4 text-xs text-slate-400">{t('No completed moves yet.')}</div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Expenses */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">{t('Expenses')}</h2>
            <select
              value={expenseFilter}
              onChange={(e) => setExpenseFilter(e.target.value)}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white cursor-pointer"
            >
              <option value="">{t('All categories')}</option>
              {Array.from(new Set(db.expenses.map((x) => x.category))).map((c) => (
                <option key={c} value={c}>
                  {t(c)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportExpenses}
              title="Export CSV"
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onNewExpense}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t('New Expense')}
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            {/* Mobile Expenses List */}
            <div className="md:hidden divide-y divide-slate-200">
              {db.expenses
                .filter((x) => !expenseFilter || x.category === expenseFilter)
                .slice()
                .reverse()
                .map((e) => (
                  <div key={e.id} className="p-3.5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-slate-900">{e.no}</span>
                          <span className="text-xs text-slate-500">{fmtDate(e.date)}</span>
                        </div>
                        <div className="font-semibold text-sm text-slate-900 mt-0.5">{t(e.category)}</div>
                        <div className="text-xs text-slate-500">{accountName(e.accountId)}</div>
                        {e.note && <div className="text-[11px] text-slate-400 italic mt-0.5">{e.note}</div>}
                      </div>
                      <div className="font-bold text-sm text-rose-600 tabular-nums shrink-0">
                        {fmt(e.amount)}
                      </div>
                    </div>
                    {canDelete('expenses') && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                        <button
                          type="button"
                          onClick={() => deleteExpense(e)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold cursor-pointer"
                        >
                          {t('Del')}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              {db.expenses.length === 0 && (
                <div className="p-8 text-center text-slate-400 text-sm">
                  {t('No expenses recorded yet.')}
                </div>
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2.5">{t('No')}</th>
                    <th className="text-left px-3 py-2.5">{t('Date')}</th>
                    <th className="text-left px-3 py-2.5">{t('Category')}</th>
                    <th className="text-left px-3 py-2.5">{t('Account')}</th>
                    <th className="text-center px-3 py-2.5">{t('Amount')}</th>
                    <th className="text-left px-3 py-2.5">{t('Note')}</th>
                    <th className="text-right px-4 py-2.5">{t('Actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.expenses
                    .filter((x) => !expenseFilter || x.category === expenseFilter)
                    .slice()
                    .reverse()
                    .map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/70">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">{e.no}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(e.date)}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-800">{t(e.category)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">
                          {accountName(e.accountId)}
                        </td>
                        <td className="text-center py-2.5 font-bold text-rose-600">{fmt(e.amount)}</td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">{e.note || '—'}</td>
                        <td className="px-4 py-2.5 text-right">
                          {canDelete('expenses') && (
                            <button
                              type="button"
                              onClick={() => deleteExpense(e)}
                              className="text-rose-600 hover:text-rose-800 font-semibold text-xs hover:underline cursor-pointer"
                            >
                              {t('Del')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {db.expenses.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                        {t('No expenses recorded yet.')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Movement Ledger History */}
      {tab === 'history' && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden space-y-3">
          <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-slate-200/80">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
              {t('Movement Ledger')}
            </h2>
            <select
              value={ledgerAccountFilter}
              onChange={(e) => setLedgerAccountFilter(e.target.value)}
              className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white cursor-pointer"
            >
              <option value="">{t('All accounts')}</option>
              {myAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleExportLedger}
              title="Export CSV"
              className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* Mobile Movement Ledger List */}
          <div className="md:hidden divide-y divide-slate-200 max-h-[65vh] overflow-y-auto">
            {ledgerWithBalance.map((r) => (
              <div key={r.key} className="p-3.5 space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">{r.no}</span>
                      <span className="text-xs text-slate-500">{fmtDate(r.date)}</span>
                      <span className="text-xs text-slate-500">· {t(r.kind)}</span>
                    </div>
                    <div className="text-xs font-medium text-slate-800 mt-0.5">
                      {accountName(r.account)}
                    </div>
                    {r.other && <div className="text-xs text-slate-500">{r.other}</div>}
                  </div>
                  <div className="text-right shrink-0 tabular-nums text-xs">
                    {r.inflow > 0 && (
                      <div className="text-emerald-600 font-bold">+{fmt(r.inflow)}</div>
                    )}
                    {r.outflow > 0 && (
                      <div className="text-rose-600 font-bold">-{fmt(r.outflow)}</div>
                    )}
                    {ledgerAccountFilter && (
                      <div className="font-mono font-semibold text-slate-700 mt-0.5">
                        {fmt(r.running)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {ledgerWithBalance.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-sm">{t('No movements yet.')}</div>
            )}
          </div>

          <div className="hidden md:block overflow-x-auto max-h-[65vh]">
            <table className="w-full text-sm">
              <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2.5">{t('Date')}</th>
                  <th className="text-left px-3 py-2.5">{t('Ref')}</th>
                  <th className="text-left px-3 py-2.5">{t('Account')}</th>
                  <th className="text-left px-3 py-2.5">{t('Details')}</th>
                  <th className="text-left px-3 py-2.5">{t('Kind')}</th>
                  <th className="text-center px-3 py-2.5">{t('In')}</th>
                  <th className="text-center px-3 py-2.5">{t('Out')}</th>
                  {ledgerAccountFilter && (
                    <th className="text-center px-3 py-2.5">{t('Running Balance')}</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledgerWithBalance.map((r) => (
                  <tr key={r.key} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 text-xs text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold">{r.no}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-700">
                      {accountName(r.account)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">{r.other}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 font-medium">
                      {t(r.kind)}
                    </td>
                    <td className="text-center py-2.5 text-emerald-600 font-semibold">
                      {r.inflow ? fmt(r.inflow) : '—'}
                    </td>
                    <td className="text-center py-2.5 text-rose-600 font-semibold">
                      {r.outflow ? fmt(r.outflow) : '—'}
                    </td>
                    {ledgerAccountFilter && (
                      <td className="text-center py-2.5 font-mono font-bold text-slate-900">
                        {fmt(r.running)}
                      </td>
                    )}
                  </tr>
                ))}
                {ledgerWithBalance.length === 0 && (
                  <tr>
                    <td colSpan={ledgerAccountFilter ? 8 : 7} className="p-8 text-center text-slate-400 text-sm">
                      {t('No movements yet.')}
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
