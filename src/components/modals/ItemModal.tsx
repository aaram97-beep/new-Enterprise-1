import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, uid } from '../../utils/formatters';
import {
  getGlobalTrackFlags,
  getItemTrackingSelection,
  resolveItemTracking,
  trackingModeLabel,
} from '../../utils/tracking';
import type { Item, ItemTrackingMode } from '../../types';

interface ItemModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Item;
}

export const ItemModal: React.FC<ItemModalProps> = ({ isOpen, onClose, item }) => {
  const { db, saveItem, toastMsg, t, canViewCost } = useIMS();
  const [draft, setDraft] = useState<Item>(item);

  useEffect(() => {
    setDraft({
      ...item,
      trackingMode: getItemTrackingSelection(item),
    });
  }, [item, isOpen]);

  const globalFlags = getGlobalTrackFlags(db.settings);
  const currentSelection: ItemTrackingMode = getItemTrackingSelection(draft);
  const effectiveTracking = resolveItemTracking(db.settings, {
    ...draft,
    trackingMode: currentSelection,
  });

  const handleSave = () => {
    if (!draft.name || !draft.name.trim()) {
      toastMsg('Item name is required', 'error');
      return;
    }

    const selection = getItemTrackingSelection(draft);
    const rec: Item = {
      id: draft.id || uid(),
      sku: (draft.sku || '').trim(),
      name: draft.name.trim(),
      company: draft.company || '',
      group: draft.group || '',
      cost: canViewCost() ? r2(draft.cost) : (item.cost || 0),
      price: r2(draft.price),
      reorder: r2(draft.reorder),
      barcode: (draft.barcode || '').trim(),
      note: draft.note || '',
      batch: selection !== 'none',
      trackingMode: selection,
    };

    saveItem(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('Item')}`}
      maxWidth="max-w-md"
    >
      <div className="space-y-4 text-xs">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('SKU')}
            </label>
            <input
              type="text"
              value={draft.sku}
              onChange={(e) => setDraft((p) => ({ ...p, sku: e.target.value }))}
              placeholder="RICE-5K"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-mono bg-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Selling price')}
            </label>
            <input
              type="number"
              step="0.01"
              value={draft.price || ''}
              onChange={(e) => setDraft((p) => ({ ...p, price: +e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm font-semibold bg-white"
            />
          </div>

          <div className="col-span-2">
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Item name')} *
            </label>
            <input
              type="text"
              required
              value={draft.name}
              onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))}
              placeholder="Basmati Rice 5kg"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Company')}
            </label>
            <input
              type="text"
              value={draft.company}
              onChange={(e) => setDraft((p) => ({ ...p, company: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Group')}
            </label>
            <input
              type="text"
              value={draft.group}
              onChange={(e) => setDraft((p) => ({ ...p, group: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Latest buying cost')}
            </label>
            {canViewCost() ? (
              <input
                type="number"
                step="0.01"
                value={draft.cost || ''}
                onChange={(e) => setDraft((p) => ({ ...p, cost: +e.target.value }))}
                className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
              />
            ) : (
              <input
                type="text"
                disabled
                value="*** (Restricted)"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm bg-slate-100 text-slate-400 font-mono italic cursor-not-allowed"
              />
            )}
          </div>

          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Reorder level')}
            </label>
            <input
              type="number"
              step="0.01"
              value={draft.reorder || ''}
              onChange={(e) => setDraft((p) => ({ ...p, reorder: +e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>

          <div className="col-span-2">
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Barcode / GTIN')}
            </label>
            <input
              type="text"
              value={draft.barcode}
              onChange={(e) => setDraft((p) => ({ ...p, barcode: e.target.value }))}
              placeholder="6210000000012"
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono bg-white"
            />
          </div>

          <div className="col-span-2">
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Special note')}
            </label>
            <input
              type="text"
              value={draft.note}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white"
            />
          </div>

          <div className="col-span-2 pt-1">
            <label htmlFor="itemTrackingMode" className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Lot & Expiry Tracking')}
            </label>
            <select
              id="itemTrackingMode"
              value={currentSelection}
              onChange={(e) => {
                const mode = e.target.value as ItemTrackingMode;
                setDraft((p) => ({
                  ...p,
                  trackingMode: mode,
                  batch: mode !== 'none',
                }));
              }}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white font-medium text-slate-800 cursor-pointer"
            >
              <option value="global">
                {`${t('Follow Global Setting')} (${t(trackingModeLabel(globalFlags.mode))})`}
              </option>
              <option value="both" disabled={!globalFlags.trackLot || !globalFlags.trackExpiry}>
                {t('Lot & Expiry Date')}
                {!globalFlags.trackLot || !globalFlags.trackExpiry ? ` (${t('Disabled globally')})` : ''}
              </option>
              <option value="lot" disabled={!globalFlags.trackLot}>
                {t('Lot / Batch only')}
                {!globalFlags.trackLot ? ` (${t('Disabled globally')})` : ''}
              </option>
              <option value="expiry" disabled={!globalFlags.trackExpiry}>
                {t('Expiry Date only')}
                {!globalFlags.trackExpiry ? ` (${t('Disabled globally')})` : ''}
              </option>
              <option value="none">{t('None (Quantity only)')}</option>
            </select>
            {currentSelection !== 'global' && effectiveTracking.mode !== currentSelection && (
              <div className="text-[11px] text-amber-600 mt-1">
                {t('Effective with current global setting')}: <b>{t(trackingModeLabel(effectiveTracking.mode))}</b>
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {t('Save')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
