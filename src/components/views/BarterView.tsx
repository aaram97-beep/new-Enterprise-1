import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate } from '../../utils/formatters';
import { printDocument } from '../../utils/printService';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, Printer, Trash2 } from 'lucide-react';
import type { Barter } from '../../types';

interface BarterViewProps {
  onNewBarter: () => void;
}

export const BarterView: React.FC<BarterViewProps> = ({ onNewBarter }) => {
  const { db, deleteBarter, sessionUser, t, canDelete, canEdit, canViewCost, maskCost } = useIMS();

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const itemName = (id: string | null) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';

  const myBarters = ((): Barter[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.barters;
    return db.barters.filter((b) => (sessionUser.branchIds || []).includes(b.branchId));
  })().slice().reverse();

  const handleExport = () => {
    exportCSV(
      'barters',
      myBarters.map((b) => ({
        no: b.no,
        date: b.date,
        partner: customerName(b.partnerId),
        branch: branchName(b.branchId),
        gave: b.giveLines.map((l) => `${itemName(l.itemId)} x${l.qty}`).join(' | '),
        received: b.recvLines.map((l) => `${itemName(l.itemId)} x${l.qty}`).join(' | '),
        gaveValue: b.giveValue,
        receivedValue: b.recvValue,
        lossWriteOff: b.loss,
      }))
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      {/* Title & Actions */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="font-bold text-base md:text-lg text-slate-900">
            {t('Barter / Item Exchange')}
          </h2>
          <div className="text-xs text-slate-500 mt-0.5">
            {t('We swap items with a partner at')} <b>{t('selling price')}</b>
            {t('. Exchange losses are logged as write-offs. Customer balances are')}{' '}
            <b>{t('never')}</b> {t('disturbed (zero financial impact).')}
          </div>
        </div>
        {canEdit('barter') && (
          <button
            type="button"
            onClick={onNewBarter}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('New Exchange')}
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

      {/* Mobile Barter List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {myBarters.map((b) => (
          <div key={b.id} className="p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-900">{b.no}</span>
                  <span className="text-xs text-slate-500">{fmtDate(b.date)}</span>
                </div>
                <div className="font-semibold text-sm text-slate-900 mt-0.5">
                  {customerName(b.partnerId)}
                </div>
              </div>
              <div className="text-right shrink-0 text-xs">
                <div className="text-[10px] uppercase text-slate-400">{t('Loss Write-off')}</div>
                {b.loss > 0 ? (
                  <span className="text-rose-600 font-bold tabular-nums">{maskCost(b.loss)}</span>
                ) : (
                  <span className="text-emerald-600 font-medium">—</span>
                )}
              </div>
            </div>

            <div className="space-y-1.5 text-xs bg-slate-50 rounded-lg px-2.5 py-2 break-words">
              <div>
                <span className="text-slate-400 font-medium">{t('We Gave')}: </span>
                <span className="text-slate-700">
                  {b.giveLines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}
                </span>{' '}
                <span className="text-slate-400">({maskCost(b.giveValue)})</span>
              </div>
              <div>
                <span className="text-slate-400 font-medium">{t('We Received')}: </span>
                <span className="text-slate-700">
                  {b.recvLines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}
                </span>{' '}
                <span className="text-slate-400">({maskCost(b.recvValue)})</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => printDocument('barter', b, db)}
                className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Printer className="w-3 h-3" />
                {t('Print')}
              </button>
              {canDelete('barter') && (
                <button
                  type="button"
                  onClick={() => deleteBarter(b)}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('Del')}
                </button>
              )}
            </div>
          </div>
        ))}
        {myBarters.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">{t('No barter exchanges.')}</div>
        )}
      </div>

      {/* Barter Table */}
      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('No')}</th>
              <th className="text-left px-3 py-2.5">{t('Date')}</th>
              <th className="text-left px-3 py-2.5">{t('Partner')}</th>
              <th className="text-left px-3 py-2.5">{t('We Gave')}</th>
              <th className="text-left px-3 py-2.5">{t('We Received')}</th>
              <th className="text-center px-3 py-2.5">{t('Loss Write-off')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {myBarters.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">{b.no}</td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(b.date)}</td>
                <td className="px-3 py-2.5 font-medium text-slate-800">
                  {customerName(b.partnerId)}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-700">
                  {b.giveLines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}{' '}
                  <span className="text-slate-400">({maskCost(b.giveValue)})</span>
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-700">
                  {b.recvLines.map((l) => `${itemName(l.itemId)} ×${l.qty}`).join(', ')}{' '}
                  <span className="text-slate-400">({maskCost(b.recvValue)})</span>
                </td>
                <td className="text-center py-2.5">
                  {b.loss > 0 ? (
                    <span className="text-rose-600 font-bold">{maskCost(b.loss)}</span>
                  ) : (
                    <span className="text-emerald-600 font-medium">—</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                  <button
                    type="button"
                    onClick={() => printDocument('barter', b, db)}
                    className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    {t('Print')}
                  </button>
                  {canDelete('barter') && (
                    <button
                      type="button"
                      onClick={() => deleteBarter(b)}
                      className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                    >
                      {t('Del')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {myBarters.length === 0 && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                  {t('No barter exchanges.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
