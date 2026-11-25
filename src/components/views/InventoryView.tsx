import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt } from '../../utils/formatters';
import { resolveItemTracking } from '../../utils/tracking';
import { Plus, SlidersHorizontal, Layers, Edit2, Trash2 } from 'lucide-react';
import type { Item } from '../../types';

interface InventoryViewProps {
  onNewItem: () => void;
  onEditItem: (item: Item) => void;
  onOpenAdjust: () => void;
  onOpenBatches: (item: Item) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  onNewItem,
  onEditItem,
  onOpenAdjust,
  onOpenBatches,
}) => {
  const { db, branchId, stockOf, deleteItem, t, canDelete, canEdit, canAdjustInventory, canViewCost, maskCost } = useIMS();
  const [search, setSearch] = useState('');

  const q = search.trim().toLowerCase();
  let list = db.items;
  if (q) {
    list = list.filter((i) =>
      `${i.name} ${i.sku || ''} ${i.barcode || ''} ${i.company || ''} ${i.group || ''}`
        .toLowerCase()
        .includes(q)
    );
  }

  const stockChip = (i: Item) => {
    const isAll = branchId === 'all';
    const total = stockOf(i.id, null);
    const qty = isAll ? total : stockOf(i.id, branchId);
    const ro = +i.reorder || 0;
    const showOther = db.settings.showInOtherBranchStatus !== false;
    if (qty <= 0.005) {
      if (!isAll && showOther && total > 0.005) return 'bg-blue-100 text-blue-700';
      return 'bg-rose-100 text-rose-700';
    }
    if (ro > 0 && qty <= ro) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  };

  const stockLabel = (i: Item) => {
    const isAll = branchId === 'all';
    const total = stockOf(i.id, null);
    const qty = isAll ? total : stockOf(i.id, branchId);
    const ro = +i.reorder || 0;
    const showOther = db.settings.showInOtherBranchStatus !== false;
    if (qty <= 0.005) {
      if (!isAll && showOther && total > 0.005) return 'in other branch';
      return 'out of stock';
    }
    if (ro > 0 && qty <= ro) return 'low';
    return 'in stock';
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">{t('Items')}</h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search name / SKU / barcode')}
          className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-full sm:w-48 md:w-64 bg-white"
        />
        {canAdjustInventory() && (
          <button
            type="button"
            onClick={onOpenAdjust}
            className="bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-slate-900/10 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            {t('Adjust')}
          </button>
        )}
        <button
          type="button"
          onClick={onNewItem}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t('New Item')}
        </button>
      </div>

      {/* Mobile Inventory List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {list.map((i) => {
          const eff = resolveItemTracking(db.settings, i);
          const badgeText = eff.mode === 'both' ? 'Lot + Exp' : eff.mode === 'lot' ? 'Lot' : 'Exp';
          const hasBatches = eff.trackLot || eff.trackExpiry;

          return (
            <div key={i.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{i.sku}</span>
                    {eff.mode !== 'none' && (
                      <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                        {t(badgeText)}
                      </span>
                    )}
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5 break-words">
                    {i.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {i.company || '—'} / {i.group || '—'}
                  </div>
                  {i.note && <div className="text-[11px] text-slate-400 mt-0.5">{i.note}</div>}
                </div>
                <span
                  className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${stockChip(
                    i
                  )}`}
                >
                  {t(stockLabel(i))}
                </span>
              </div>

              <div className="grid grid-cols-4 gap-2 bg-slate-50 rounded-lg px-2.5 py-2 text-xs tabular-nums">
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Cost')}</div>
                  <div className="font-mono text-slate-600">{maskCost(i.cost)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Price')}</div>
                  <div className="font-semibold text-slate-900">{fmt(i.price)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">{t('Total')}</div>
                  <div className="font-bold text-slate-900">{stockOf(i.id, null)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase text-slate-400">
                    {branchId === 'all' ? t('All Branches') : t('This Branch')}
                  </div>
                  <div className="font-semibold text-slate-700">{stockOf(i.id, branchId)}</div>
                </div>
              </div>

              {(hasBatches || canEdit('inventory') || canDelete('inventory')) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  {hasBatches && (
                    <button
                      type="button"
                      onClick={() => onOpenBatches(i)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      {t('Batches')}
                    </button>
                  )}
                  {canEdit('inventory') && (
                    <button
                      type="button"
                      onClick={() => onEditItem(i)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {t('Edit')}
                    </button>
                  )}
                  {canDelete('inventory') && (
                    <button
                      type="button"
                      onClick={() => deleteItem(i)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
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
          <div className="p-8 text-center text-slate-400 text-sm">{t('No items.')}</div>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('SKU')}</th>
              <th className="text-left px-3 py-2.5">{t('Item')}</th>
              <th className="text-left px-3 py-2.5">{t('Company / Group')}</th>
              <th className="text-center px-3 py-2.5">{t('Cost')}</th>
              <th className="text-center px-3 py-2.5">{t('Price')}</th>
              <th className="text-center px-3 py-2.5">{t('Total')}</th>
              <th className="text-center px-3 py-2.5">{branchId === 'all' ? t('All Branches') : t('This Branch')}</th>
              <th className="text-center px-3 py-2.5">{t('Status')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((i) => (
              <tr key={i.id} className="hover:bg-slate-50/80 transition-colors">
                <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                  {i.sku}
                </td>
                <td className="px-3 py-2.5 font-medium text-slate-900">
                  <div className="flex items-center gap-1.5">
                    <span>{i.name}</span>
                    {(() => {
                      const eff = resolveItemTracking(db.settings, i);
                      if (eff.mode === 'none') return null;
                      const badgeText =
                        eff.mode === 'both' ? 'Lot + Exp' : eff.mode === 'lot' ? 'Lot' : 'Exp';
                      return (
                        <span className="text-[10px] bg-indigo-100 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                          {t(badgeText)}
                        </span>
                      );
                    })()}
                  </div>
                  {i.note && <div className="text-[11px] text-slate-400 mt-0.5">{i.note}</div>}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500">
                  {i.company || '—'} / {i.group || '—'}
                </td>
                <td className="text-center py-2.5 text-xs text-slate-600 font-mono">
                  {maskCost(i.cost)}
                </td>
                <td className="text-center py-2.5 font-semibold text-slate-900">{fmt(i.price)}</td>
                <td className="text-center py-2.5 font-bold text-slate-900">
                  {stockOf(i.id, null)}
                </td>
                <td className="text-center py-2.5 font-semibold text-slate-700">
                  {stockOf(i.id, branchId)}
                </td>
                <td className="text-center py-2.5">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${stockChip(
                      i
                    )}`}
                  >
                    {t(stockLabel(i))}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                  {(() => {
                    const eff = resolveItemTracking(db.settings, i);
                    return eff.trackLot || eff.trackExpiry;
                  })() && (
                    <button
                      type="button"
                      onClick={() => onOpenBatches(i)}
                      className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      {t('Batches')}
                    </button>
                  )}
                  {canEdit('inventory') && (
                    <button
                      type="button"
                      onClick={() => onEditItem(i)}
                      className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {t('Edit')}
                    </button>
                  )}
                  {canDelete('inventory') && (
                    <button
                      type="button"
                      onClick={() => deleteItem(i)}
                      className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                    >
                      {t('Del')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-400 text-sm">
                  {t('No items.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
