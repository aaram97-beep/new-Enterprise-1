import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate } from '../../utils/formatters';
import { checkCollected, checkRemaining, effCheckStatus } from '../../utils/calculations';
import { exportCSV } from '../../utils/exportImport';
import { CHECK_STATUSES } from '../../data/constants';
import { Plus, Download, Trash2, Banknote } from 'lucide-react';
import type { CheckDoc } from '../../types';

interface ChecksViewProps {
  onNewCheck: () => void;
  onOpenPayout: (check: CheckDoc) => void;
}

export const ChecksView: React.FC<ChecksViewProps> = ({ onNewCheck, onOpenPayout }) => {
  const { db, deleteCheck, setCheckStatus, t, canDelete, canEdit } = useIMS();
  const [statusFilter, setStatusFilter] = useState('');

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';

  let list = db.checks.slice().reverse();
  if (statusFilter) {
    list = list.filter((c) => effCheckStatus(c) === statusFilter);
  }

  // Check stats by status
  const checkStats: Record<string, { count: number; value: number }> = {};
  CHECK_STATUSES.forEach((s) => {
    checkStats[s] = { count: 0, value: 0 };
  });

  db.checks.forEach((c) => {
    const s = effCheckStatus(c);
    if (checkStats[s]) {
      checkStats[s].count++;
      checkStats[s].value += +c.amount || 0;
    }
  });

  const checkChip = (c: CheckDoc) => {
    const s = effCheckStatus(c);
    switch (s) {
      case 'cleared':
        return 'bg-emerald-100 text-emerald-700';
      case 'deposited':
        return 'bg-blue-100 text-blue-700';
      case 'bounced':
        return 'bg-rose-100 text-rose-700';
      case 'overdue':
        return 'bg-amber-100 text-amber-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const handleExport = () => {
    exportCSV(
      'checks',
      list.map((c) => ({
        ref: c.no,
        customer: customerName(c.customerId),
        checkNo: c.checkNo,
        bank: c.bank,
        amount: c.amount,
        collected: checkCollected(c),
        remaining: checkRemaining(c),
        status: effCheckStatus(c),
        receivedDate: c.receivedDate,
        dueDate: c.dueDate,
      }))
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
          {t('Checks')}
        </h2>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs sm:text-sm bg-white cursor-pointer"
        >
          <option value="">{t('All statuses')}</option>
          {CHECK_STATUSES.map((st) => (
            <option key={st} value={st}>
              {t(st)}
            </option>
          ))}
        </select>
        {canEdit('checks') && (
          <button
            type="button"
            onClick={onNewCheck}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('Receive Check')}
          </button>
        )}
        <button
          type="button"
          onClick={handleExport}
          title="Export CSV"
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Status pills breakdown */}
      <div className="flex flex-wrap gap-2 text-xs">
        {CHECK_STATUSES.map((st) => (
          <span
            key={st}
            className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-medium"
          >
            {t(st)}: <b>{checkStats[st].count}</b> • {fmt(checkStats[st].value)}
          </span>
        ))}
      </div>

      {/* Mobile Checks List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {list.map((c) => {
          const collected = checkCollected(c);
          const rem = checkRemaining(c);
          const effStatus = effCheckStatus(c);

          return (
            <div key={c.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{c.no}</span>
                    <span className="font-mono text-xs text-slate-600">#{c.checkNo}</span>
                    <span className="text-xs text-slate-500">{fmtDate(c.dueDate)}</span>
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5">
                    {customerName(c.customerId)}
                  </div>
                  <div className="text-xs text-slate-500">{c.bank}</div>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${checkChip(c)}`}
                >
                  {t(effStatus)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Amount')}</div>
                  <div className="font-semibold text-slate-900">{fmt(c.amount)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Collected')}</div>
                  <div className="font-medium text-emerald-600">{fmt(collected)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Remaining')}</div>
                  <div className={`font-semibold ${rem > 0.005 ? 'text-rose-600' : 'text-slate-500'}`}>
                    {fmt(rem)}
                  </div>
                </div>
              </div>

              {(canEdit('checks') || canDelete('checks')) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  {canEdit('checks') && rem > 0.005 && (
                    <button
                      type="button"
                      onClick={() => onOpenPayout(c)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Banknote className="w-3 h-3" />
                      {t('Payout')}
                    </button>
                  )}
                  {canEdit('checks') && c.status === 'received' && (
                    <button
                      type="button"
                      onClick={() => setCheckStatus(c, 'deposited')}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold cursor-pointer"
                    >
                      {t('Deposit')}
                    </button>
                  )}
                  {canEdit('checks') &&
                    (c.status === 'received' || c.status === 'deposited' || c.status === 'overdue') && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCheckStatus(c, 'cleared')}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold cursor-pointer"
                        >
                          {t('Clear')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckStatus(c, 'bounced')}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold cursor-pointer"
                        >
                          {t('Bounce')}
                        </button>
                      </>
                    )}
                  {canDelete('checks') && (
                    <button
                      type="button"
                      onClick={() => deleteCheck(c)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-rose-50 hover:text-rose-700 font-semibold inline-flex items-center gap-1 cursor-pointer"
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
          <div className="p-8 text-center text-slate-400 text-sm">{t('No checks recorded.')}</div>
        )}
      </div>

      {/* Table */}
      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('Ref')}</th>
              <th className="text-left px-3 py-2.5">{t('Customer')}</th>
              <th className="text-left px-3 py-2.5">{t('Check No')}</th>
              <th className="text-left px-3 py-2.5">{t('Bank / Disbursing Officer or Entity')}</th>
              <th className="text-center px-3 py-2.5">{t('Amount')}</th>
              <th className="text-center px-3 py-2.5">{t('Collected')}</th>
              <th className="text-center px-3 py-2.5">{t('Remaining')}</th>
              <th className="text-left px-3 py-2.5">{t('Due')}</th>
              <th className="text-center px-3 py-2.5">{t('Status')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((c) => {
              const collected = checkCollected(c);
              const rem = checkRemaining(c);
              const effStatus = effCheckStatus(c);

              return (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {c.no}
                  </td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {customerName(c.customerId)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-700">
                    {c.checkNo}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{c.bank}</td>
                  <td className="text-center py-2.5 font-semibold text-slate-900">{fmt(c.amount)}</td>
                  <td className="text-center py-2.5 text-emerald-600 font-medium">
                    {fmt(collected)}
                  </td>
                  <td
                    className={`text-center py-2.5 font-semibold ${
                      rem > 0.005 ? 'text-rose-600' : 'text-slate-500'
                    }`}
                  >
                    {fmt(rem)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(c.dueDate)}</td>
                  <td className="text-center py-2.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${checkChip(
                        c
                      )}`}
                    >
                      {t(effStatus)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    {canEdit('checks') && rem > 0.005 && (
                      <button
                        type="button"
                        onClick={() => onOpenPayout(c)}
                        className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Banknote className="w-3 h-3" />
                        {t('Payout')}
                      </button>
                    )}
                    {canEdit('checks') && c.status === 'received' && (
                      <button
                        type="button"
                        onClick={() => setCheckStatus(c, 'deposited')}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Deposit')}
                      </button>
                    )}
                    {canEdit('checks') && (c.status === 'received' || c.status === 'deposited' || c.status === 'overdue') && (
                      <>
                        <button
                          type="button"
                          onClick={() => setCheckStatus(c, 'cleared')}
                          className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline cursor-pointer"
                        >
                          {t('Clear')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCheckStatus(c, 'bounced')}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                        >
                          {t('Bounce')}
                        </button>
                      </>
                    )}
                    {canDelete('checks') && (
                      <button
                        type="button"
                        onClick={() => deleteCheck(c)}
                        className="text-slate-400 hover:text-rose-600 font-medium hover:underline cursor-pointer"
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
                <td colSpan={10} className="p-8 text-center text-slate-400 text-sm">
                  {t('No checks recorded.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
