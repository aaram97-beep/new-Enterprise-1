import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, r2 } from '../../utils/formatters';
import { Plus, Edit2, Trash2 } from 'lucide-react';
import type { Branch } from '../../types';

interface BranchesViewProps {
  onNewBranch: () => void;
  onEditBranch: (branch: Branch) => void;
}

export const BranchesView: React.FC<BranchesViewProps> = ({ onNewBranch, onEditBranch }) => {
  const { db, deleteBranch, t } = useIMS();

  const branchDistinctItems = (bid: string) =>
    new Set(db.stocks.filter((s) => s.branchId === bid).map((s) => s.itemId)).size;

  const branchStockValue = (bid: string) =>
    r2(
      db.stocks
        .filter((s) => s.branchId === bid)
        .reduce((a, s) => a + r2((+s.qty || 0) * (+s.cost || 0)), 0)
    );

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-base md:text-lg text-slate-900">
          {t('Branches & Warehouses')}
        </h2>
        <button
          type="button"
          onClick={onNewBranch}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t('New Branch')}
        </button>
      </div>

      {/* Mobile Branches List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {db.branches.map((b) => (
          <div key={b.id} className="p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs font-bold text-slate-900">{b.code}</span>
                  {b.isMain && (
                    <span className="text-[10px] bg-slate-900 text-white font-semibold px-2 py-0.5 rounded-full">
                      {t('main')}
                    </span>
                  )}
                </div>
                <div className="font-semibold text-sm text-slate-900 mt-0.5">{b.name}</div>
                <div className="text-xs text-slate-500">{b.address || '—'}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
              <div>
                <div className="text-[10px] uppercase text-slate-400">{t('Items')}</div>
                <div className="font-semibold text-slate-900">{branchDistinctItems(b.id)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-slate-400">{t('Stock Value')}</div>
                <div className="font-bold text-slate-900">{fmt(branchStockValue(b.id))}</div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => onEditBranch(b)}
                className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3 h-3" />
                {t('Edit')}
              </button>
              {!b.isMain && (
                <button
                  type="button"
                  onClick={() => deleteBranch(b)}
                  className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  {t('Del')}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('Code')}</th>
              <th className="text-left px-3 py-2.5">{t('Name')}</th>
              <th className="text-left px-3 py-2.5">{t('Address')}</th>
              <th className="text-center px-3 py-2.5">{t('Items')}</th>
              <th className="text-center px-3 py-2.5">{t('Stock Value')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {db.branches.map((b) => (
              <tr key={b.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">{b.code}</td>
                <td className="px-3 py-2.5 font-medium text-slate-900">
                  {b.name}
                  {b.isMain && (
                    <span className="text-[10px] bg-slate-900 text-white font-semibold px-2 py-0.5 rounded-full ml-1.5">
                      {t('main')}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">{b.address || '—'}</td>
                <td className="text-center py-2.5 font-medium">{branchDistinctItems(b.id)}</td>
                <td className="text-center py-2.5 font-bold text-slate-900">
                  {fmt(branchStockValue(b.id))}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                  <button
                    type="button"
                    onClick={() => onEditBranch(b)}
                    className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" />
                    {t('Edit')}
                  </button>
                  {!b.isMain && (
                    <button
                      type="button"
                      onClick={() => deleteBranch(b)}
                      className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                    >
                      {t('Del')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
