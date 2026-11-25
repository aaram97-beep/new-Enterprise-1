import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, fmt, todayStr, uid } from '../../utils/formatters';
import { intakeTotal } from '../../utils/calculations';
import type { Intake, IntakeLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface BuyingReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  intake: Intake;
}

export const BuyingReceiptModal: React.FC<BuyingReceiptModalProps> = ({
  isOpen,
  onClose,
  intake,
}) => {
  const { db, branchId, myBranches, saveIntake, nextNo, toastMsg, stockOf, t } = useIMS();
  const [draft, setDraft] = useState<Intake>(intake);

  useEffect(() => {
    setDraft({
      ...intake,
      branchId: intake.branchId || branchId,
      date: intake.date || todayStr(),
      lines: intake.lines?.length
        ? intake.lines.map((l) => ({
            ...l,
            itemId: l.itemId || '',
            qty: l.qty || 1,
            cost: l.cost || (db.items.find((i) => i.id === l.itemId) || {}).cost || 0,
            code: l.code || (db.items.find((i) => i.id === l.itemId) || {}).sku || '',
          }))
        : [{ itemId: '', qty: 1, cost: 0, code: '' }],
    });
  }, [intake, branchId, isOpen, db.items]);

  const providerAcRows = db.customers
    .filter((c) => c.isProvider)
    .map((c) => ({
      id: c.id,
      label: c.name,
      sub: c.phone || '',
      code: c.phone || '',
    }));

  const itemAcRows = db.items.map((i) => ({
    id: i.id,
    label: i.name,
    sub: `${i.sku || ''}   stock ${stockOf(i.id, draft.branchId)}`.trim(),
    code: i.barcode || i.sku || '',
  }));

  const selectedProvider = db.customers.find((c) => c.id === draft.providerId);

  const handleLineChange = (index: number, patch: Partial<IntakeLine>) => {
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = { ...lines[index], ...patch };
      return { ...prev, lines };
    });
  };

  const handlePickItem = (index: number, itemId: string) => {
    const it = db.items.find((i) => i.id === itemId);
    setDraft((prev) => {
      const lines = [...prev.lines];
      lines[index] = {
        ...lines[index],
        itemId,
        code: it ? (it.sku || it.name) : '',
        cost: it ? it.cost : lines[index].cost || 0,
      };
      return { ...prev, lines };
    });
  };

  const handleAddLine = () => {
    setDraft((prev) => ({
      ...prev,
      lines: [...prev.lines, { itemId: '', qty: 1, cost: 0, code: '' }],
    }));
  };

  const handleRemoveLine = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index),
    }));
  };

  const handleSave = () => {
    if (!draft.providerId) {
      toastMsg(t('Choose a provider first'), 'error');
      return;
    }
    const validLines = draft.lines.filter((l) => l.itemId && r2(l.qty) > 0);
    if (!validLines.length) {
      toastMsg(t('Add at least one line with an item and quantity'), 'error');
      return;
    }

    const bId = draft.branchId || branchId;
    const rec: Intake = {
      id: draft.id || uid(),
      no: draft.no || nextNo(bId, 'INT'),
      date: draft.date || todayStr(),
      providerId: draft.providerId,
      branchId: bId,
      note: draft.note || '',
      lines: validLines.map((l) => {
        const it = db.items.find((i) => i.id === l.itemId);
        return {
          itemId: l.itemId,
          qty: r2(l.qty),
          cost: r2(l.cost),
          code: it ? (it.sku || it.name) : l.code || '',
        };
      }),
      total: 0,
    };
    rec.total = intakeTotal(rec);
    const res = saveIntake(rec);
    if (res.ok) onClose();
  };

  const total = intakeTotal({
    ...draft,
    lines: draft.lines
      .filter((l) => l.itemId)
      .map((l) => ({
        itemId: l.itemId,
        qty: r2(l.qty),
        cost: r2(l.cost),
      })),
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${draft.id ? t('Edit') : t('+ New')} ${t('Purchase Receipt')}`}
      subtitle={t('Search items by name, set quantity and buying cost. Goods stay on the way until arrival note is created.')}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4">
        {/* Provider, Branch, Date */}
        <div className="grid sm:grid-cols-4 gap-3 text-sm">
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Provider')}
            </label>
            <AutoCompleteBox
              rows={providerAcRows}
              placeholder={t('Search provider')}
              defaultValue={selectedProvider ? selectedProvider.name : ''}
              onPick={(row) => setDraft((p) => ({ ...p, providerId: row.id }))}
            />
            {selectedProvider && (
              <div className="text-[11px] text-slate-500 mt-1">
                {t('Selected:')} <b>{selectedProvider.name}</b>
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Branch')}
            </label>
            <select
              value={draft.branchId}
              onChange={(e) => setDraft((p) => ({ ...p, branchId: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white cursor-pointer"
            >
              {myBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Date')}
            </label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((p) => ({ ...p, date: e.target.value }))}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        {/* Lines Table */}
        <div className="border border-slate-200 rounded-xl overflow-visible bg-white">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="rounded-tl-xl text-left px-3 py-2.5 min-w-[180px]">{t('Item')}</th>
                <th className="text-center px-2 py-2.5 w-28">{t('Qty')}</th>
                <th className="text-center px-2 py-2.5 w-36">{t('Buy price')}</th>
                <th className="text-right px-3 py-2.5 w-32">{t('Total')}</th>
                <th className="rounded-tr-xl w-9 px-1"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.lines.map((line, idx) => {
                const itemObj = db.items.find((i) => i.id === line.itemId);
                return (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 [&>td]:align-top">
                    <td className="px-2.5 py-2">
                      <AutoCompleteBox
                        rows={itemAcRows}
                        placeholder={t('Item')}
                        defaultValue={itemObj ? itemObj.name : ''}
                        onPick={(row) => handlePickItem(idx, row.id)}
                      />
                      {line.itemId && (
                        <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-2">
                          {itemObj?.sku && (
                            <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.2 rounded text-slate-600 dark:text-slate-300">
                              {itemObj.sku}
                            </span>
                          )}
                          <span>
                            {t('Stock:')} {stockOf(line.itemId, draft.branchId)}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.qty || ''}
                        onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                        className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[6rem] px-2.5 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={line.cost ?? ''}
                        onChange={(e) => handleLineChange(idx, { cost: +e.target.value })}
                        className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[8rem] px-2.5 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                      />
                    </td>
                    <td className="px-3 py-2 pt-3.5 text-right font-medium text-slate-700 dark:text-slate-200 text-sm tabular-nums whitespace-nowrap">
                      {fmt(r2((line.qty || 0) * (line.cost || 0)))}
                    </td>
                    <td className="px-1 py-2 pt-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveLine(idx)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                        title={t('Remove row')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Add line & Note */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={handleAddLine}
            className="text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('Add line')}
          </button>
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              value={draft.note || ''}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
              placeholder={t('Note')}
              className="border border-slate-300 rounded-lg w-full px-3 py-1.5 text-xs"
            />
          </div>
        </div>

        {/* Total bar */}
        <div className="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
          <span className="text-sm text-slate-500 font-medium">{t('Total:')}</span>
          <span className="text-lg font-bold text-slate-900">{fmt(total)}</span>
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
            {t('Save   Items on the Way')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
