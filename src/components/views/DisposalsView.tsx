import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, r2 } from '../../utils/formatters';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, Check, X } from 'lucide-react';
import type { Disposal } from '../../types';

interface DisposalsViewProps {
  onNewDisposal: () => void;
}

export const DisposalsView: React.FC<DisposalsViewProps> = ({ onNewDisposal }) => {
  const { db, approveDisposal, rejectDisposal, sessionUser, t, canDelete, canEdit, canViewCost, maskCost } = useIMS();

  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const itemName = (id: string | null) => (db.items.find((i) => i.id === id) || {}).name || '—';

  const myDisposals = ((): Disposal[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.disposals;
    return db.disposals.filter((d) => (sessionUser.branchIds || []).includes(d.branchId));
  })().slice().reverse();

  const handleExport = () => {
    exportCSV(
      'disposals',
      myDisposals.map((d) => ({
        no: d.no,
        date: d.date,
        branch: branchName(d.branchId),
        status: d.status,
        lines: d.lines.map((l) => `${itemName(l.itemId)} x${l.qty} (${l.reason})`).join(' | '),
        writeOff: r2(d.lines.reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0)),
      }))
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
          {t('Disposals & Write-offs')}
        </h2>
        {canEdit('disposals') && (
          <button
            type="button"
            onClick={onNewDisposal}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('Log Disposal')}
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

      {/* Mobile Disposals List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {myDisposals.map((d) => {
          const writeOff = r2(
            d.lines.reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0)
          );

          return (
            <div key={d.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{d.no}</span>
                    <span className="text-xs text-slate-500">{fmtDate(d.date)}</span>
                  </div>
                  <div className="text-xs text-slate-600 mt-0.5">{branchName(d.branchId)}</div>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    d.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : d.status === 'rejected'
                      ? 'bg-slate-200 text-slate-600'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {d.status}
                </span>
              </div>

              <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2 break-words">
                {d.lines.map((l) => `${itemName(l.itemId)} ×${l.qty} (${l.reason})`).join(', ')}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{t('Cost Write-off')}</span>
                <span className="font-bold text-rose-600 tabular-nums">{maskCost(writeOff)}</span>
              </div>

              {d.status === 'pending' && canEdit('disposals') && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  <button
                    type="button"
                    onClick={() => approveDisposal(d)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    {t('Approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => rejectDisposal(d)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    {t('Reject')}
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {myDisposals.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">No disposals logged.</div>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('No')}</th>
              <th className="text-left px-3 py-2.5">{t('Date')}</th>
              <th className="text-left px-3 py-2.5">{t('Branch')}</th>
              <th className="text-left px-3 py-2.5">{t('Lines')}</th>
              <th className="text-center px-3 py-2.5">{t('Cost Write-off')}</th>
              <th className="text-center px-3 py-2.5">{t('Status')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {myDisposals.map((d) => {
              const writeOff = r2(
                d.lines.reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0)
              );

              return (
                <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {d.no}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(d.date)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{branchName(d.branchId)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 max-w-sm truncate">
                    {d.lines
                      .map((l) => `${itemName(l.itemId)} ×${l.qty} (${l.reason})`)
                      .join(', ')}
                  </td>
                  <td className="text-center py-2.5 font-bold text-rose-600">{maskCost(writeOff)}</td>
                  <td className="text-center py-2.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        d.status === 'approved'
                          ? 'bg-emerald-100 text-emerald-700'
                          : d.status === 'rejected'
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {d.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    {d.status === 'pending' && canEdit('disposals') ? (
                      <>
                        <button
                          type="button"
                          onClick={() => approveDisposal(d)}
                          className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {t('Approve')}
                        </button>
                        <button
                          type="button"
                          onClick={() => rejectDisposal(d)}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          {t('Reject')}
                        </button>
                      </>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {myDisposals.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                  No disposals logged.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
