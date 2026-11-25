import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmtDate } from '../../utils/formatters';
import { printDocument } from '../../utils/printService';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, Printer, CheckCircle2, XCircle } from 'lucide-react';
import type { Transfer } from '../../types';

interface TransfersViewProps {
  onNewTransfer: () => void;
}

export const TransfersView: React.FC<TransfersViewProps> = ({ onNewTransfer }) => {
  const { db, receiveTransfer, cancelTransfer, sessionUser, t, canDelete, canEdit } = useIMS();

  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';

  const myTransfers = ((): Transfer[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.transfers;
    return db.transfers.filter(
      (tr) =>
        (sessionUser.branchIds || []).includes(tr.fromBranchId) ||
        (sessionUser.branchIds || []).includes(tr.toBranchId)
    );
  })().slice().reverse();

  const handleExport = () => {
    exportCSV(
      'transfers',
      myTransfers.map((tr) => ({
        no: tr.no,
        date: tr.date,
        from: branchName(tr.fromBranchId),
        to: branchName(tr.toBranchId),
        status: tr.status,
        lines: tr.lines.map((l) => `${itemName(l.itemId)} x${l.qty}`).join(' | '),
        qtyTotal: tr.lines.reduce((a, l) => a + (+l.qty || 0), 0),
      }))
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
            <span>{t('Transfers')}</span>
            <span className="text-xs font-normal text-slate-400 hidden sm:inline">
              {t('two-way, with transit tracking')}
            </span>
          </h2>
        </div>
        {canEdit('transfers') && (
          <button
            type="button"
            onClick={onNewTransfer}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('New Transfer')}
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

      {/* Mobile Transfers List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {myTransfers.map((tr) => {
          const totalQty = tr.lines.reduce((a, l) => a + (+l.qty || 0), 0);
          return (
            <div key={tr.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{tr.no}</span>
                    <span className="text-xs text-slate-500">{fmtDate(tr.date)}</span>
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-0.5">
                    {branchName(tr.fromBranchId)} → {branchName(tr.toBranchId)}
                  </div>
                </div>
                <span
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                    tr.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : tr.status === 'transit'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tr.status}
                </span>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs bg-slate-50 rounded-lg px-2.5 py-2">
                <span className="text-slate-600 break-words">
                  {tr.lines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}
                </span>
                <span className="font-bold text-slate-900 shrink-0 tabular-nums">
                  {t('Qty')}: {totalQty}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                {canEdit('transfers') && tr.status === 'transit' && (
                  <button
                    type="button"
                    onClick={() => receiveTransfer(tr)}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {t('Receive')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => printDocument('transfer', tr, db)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  {t('Voucher')}
                </button>
                {(canDelete('transfers') || canEdit('transfers')) && tr.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={() => cancelTransfer(tr)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    {t('Cancel')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {myTransfers.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">{t('No transfers.')}</div>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('No')}</th>
              <th className="text-left px-3 py-2.5">{t('Date')}</th>
              <th className="text-left px-3 py-2.5">{t('From')}</th>
              <th className="text-left px-3 py-2.5">{t('To')}</th>
              <th className="text-left px-3 py-2.5">{t('Lines')}</th>
              <th className="text-center px-3 py-2.5">{t('Qty')}</th>
              <th className="text-center px-3 py-2.5">{t('Status')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {myTransfers.map((tr) => {
              const totalQty = tr.lines.reduce((a, l) => a + (+l.qty || 0), 0);
              return (
                <tr key={tr.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {tr.no}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(tr.date)}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700">
                    {branchName(tr.fromBranchId)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-700">
                    {branchName(tr.toBranchId)}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-600 max-w-xs truncate">
                    {tr.lines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}
                  </td>
                  <td className="text-center py-2.5 font-bold text-slate-900">{totalQty}</td>
                  <td className="text-center py-2.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                        tr.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-700'
                          : tr.status === 'transit'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {tr.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    {canEdit('transfers') && tr.status === 'transit' && (
                      <button
                        type="button"
                        onClick={() => receiveTransfer(tr)}
                        className="text-emerald-700 hover:text-emerald-800 font-bold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t('Receive')}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => printDocument('transfer', tr, db)}
                      className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Voucher')}
                    </button>
                    {(canDelete('transfers') || canEdit('transfers')) && tr.status !== 'completed' && (
                      <button
                        type="button"
                        onClick={() => cancelTransfer(tr)}
                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        {t('Cancel')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {myTransfers.length === 0 && (
              <tr>
                <td colSpan={8} className="p-8 text-center text-slate-400 text-sm">
                  {t('No transfers.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
