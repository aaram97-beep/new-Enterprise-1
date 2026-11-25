import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, fmt, todayStr, uid } from '../../utils/formatters';
import {
  buildIntakeArrivalLines,
  splitIntakeArrivalLine,
  totalAllocatedForItem,
  validateIntakeArrivalSave,
  validateStockReductionOnEdit,
  type IntakeArrivalDraftLine,
} from '../../utils/arrivalHelpers';
import type { Arrival, ArrivalLine } from '../../types';
import { getLinesTrackingFlags, resolveItemTracking } from '../../utils/tracking';
import { Plus, Trash2 } from 'lucide-react';

interface ArrivalNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  intakeId: string;
  arrival?: Arrival | null;
}

export const ArrivalNoteModal: React.FC<ArrivalNoteModalProps> = ({
  isOpen,
  onClose,
  intakeId,
  arrival,
}) => {
  const { db, branchId, myBranches, saveArrival, nextNo, toastMsg, stockOf, t } = useIMS();
  const effectiveIntakeId = arrival?.intakeId || intakeId;
  const intake = db.intakes.find((x) => x.id === effectiveIntakeId);

  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState('');

  // Mode A: Intake-based arrival lines (supports multiple lot/expiry rows per item)
  const [lines, setLines] = useState<IntakeArrivalDraftLine[]>([]);

  // Mode B: Direct branch arrival state
  const [targetBranchId, setTargetBranchId] = useState<string>('');
  const [directLines, setDirectLines] = useState<ArrivalLine[]>([]);

  useEffect(() => {
    if (!isOpen) return;

    if (intake) {
      setLines(buildIntakeArrivalLines(intake, db.arrivals, arrival));
      setDate(arrival?.date || todayStr());
      setNote(arrival?.note || '');
    } else {
      // Mode B: Direct branch arrival mode
      const defaultBranch =
        arrival?.branchId ||
        (branchId === 'all'
          ? (myBranches[0]?.id || db.branches[0]?.id || 'b1')
          : branchId);
      setTargetBranchId(defaultBranch);
      setDate(arrival?.date || todayStr());
      setNote(arrival?.note || '');

      if (arrival?.lines?.length) {
        setDirectLines(
          arrival.lines.map((l) => ({
            itemId: l.itemId,
            qty: l.qty || 1,
            cost: l.cost || (db.items.find((i) => i.id === l.itemId)?.cost || 0),
            batchNo: l.batchNo || '',
            expiry: l.expiry || '',
          }))
        );
      } else {
        setDirectLines([{ itemId: '', qty: 1, cost: 0, batchNo: '', expiry: '' }]);
      }
    }
  }, [intake, isOpen, db.arrivals, db.branches, db.items, arrival, branchId, myBranches]);

  const handleLineChange = (index: number, patch: Partial<ArrivalLine>) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  };

  const handleSplitLine = (index: number) => {
    setLines((prev) => splitIntakeArrivalLine(prev, index));
  };

  const handleRemoveSplitLine = (index: number) => {
    setLines((prev) => {
      const target = prev[index];
      if (!target) return prev;
      const countForItem = prev.filter((l) => l.itemId === target.itemId).length;
      if (countForItem <= 1) return prev;
      return prev.filter((_, idx) => idx !== index);
    });
  };

  const handleSaveIntakeArrival = () => {
    if (!intake) return;
    const check = validateIntakeArrivalSave({
      lines,
      intake,
      arrivals: db.arrivals,
      editingArrival: arrival,
      stocks: db.stocks,
      items: db.items,
      t,
    });

    if (!check.ok) {
      toastMsg(check.message, 'error');
      return;
    }

    const normalizedIntakeLines: ArrivalLine[] = check.validLines.map((l) => {
      const it = db.items.find((i) => i.id === l.itemId);
      const eff = resolveItemTracking(db.settings, it);
      return {
        ...l,
        batchNo: eff.trackLot ? l.batchNo : '',
        expiry: eff.trackExpiry ? l.expiry : '',
      };
    });

    const rec: Arrival = {
      id: arrival?.id || uid(),
      no: arrival?.no || nextNo(intake.branchId, 'ARR'),
      date: date || todayStr(),
      intakeId: intake.id,
      branchId: arrival?.branchId || intake.branchId,
      note,
      lines: normalizedIntakeLines,
    };

    saveArrival(rec);
    onClose();
  };

  // Direct branch arrival line handlers
  const handleDirectLineChange = (index: number, patch: Partial<ArrivalLine>) => {
    setDirectLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  };

  const handlePickItem = (index: number, itemId: string) => {
    const it = db.items.find((i) => i.id === itemId);
    const eff = resolveItemTracking(db.settings, it);
    setDirectLines((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        itemId,
        cost: it?.cost || 0,
        batchNo: eff.trackLot ? updated[index].batchNo || '' : '',
        expiry: eff.trackExpiry ? updated[index].expiry || '' : '',
      };
      return updated;
    });
  };

  const handleAddDirectLine = () => {
    setDirectLines((prev) => [
      ...prev,
      { itemId: '', qty: 1, cost: 0, batchNo: '', expiry: '' },
    ]);
  };

  const handleRemoveDirectLine = (index: number) => {
    setDirectLines((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveDirectArrival = () => {
    const valid = directLines.filter((l) => l.itemId && r2(l.qty) > 0.005);
    if (!valid.length) {
      toastMsg(t('Please select an item and enter quantity'), 'error');
      return;
    }

    const targetBranch = targetBranchId || (myBranches[0]?.id || db.branches[0]?.id || 'b1');

    const normalizedLines: ArrivalLine[] = valid.map((l) => {
      const it = db.items.find((i) => i.id === l.itemId);
      const eff = resolveItemTracking(db.settings, it);
      return {
        itemId: l.itemId,
        qty: r2(l.qty),
        cost: r2(l.cost || it?.cost || 0),
        batchNo: eff.trackLot ? (l.batchNo || '').trim() : '',
        expiry: eff.trackExpiry ? l.expiry || '' : '',
      };
    });

    const stockCheck = validateStockReductionOnEdit(arrival, normalizedLines, db.stocks, db.items);
    if (!stockCheck.ok) {
      toastMsg(stockCheck.message, 'error');
      return;
    }

    const rec: Arrival = {
      id: arrival?.id || uid(),
      no: arrival?.no || nextNo(targetBranch, 'ARR'),
      date: date || todayStr(),
      intakeId: '', // direct arrival note from branch company
      branchId: arrival?.branchId || targetBranch,
      note: note.trim(),
      lines: normalizedLines,
    };

    saveArrival(rec);
    onClose();
  };

  if (!isOpen) return null;

  // Render Direct Branch Arrival Modal if no intake was found (Branch Company mode)
  if (!intake) {
    const { showLotCol: showDirectLotCol, showExpiryCol: showDirectExpiryCol } =
      getLinesTrackingFlags(
        db.settings,
        db.items,
        directLines.map((l) => l.itemId)
      );
    const availableBranches = myBranches.length > 0 ? myBranches : db.branches;
    const itemAcRows = [...db.items]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((i) => {
        const avail = stockOf(i.id, targetBranchId);
        return {
          id: i.id,
          label: i.name,
          sub: `${i.sku ? `${i.sku} • ` : ''}${t('Stock')}: ${avail}`,
          code: i.barcode || i.sku || '',
        };
      });

    return (
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={arrival ? `${t('Edit Arrival Note')}   ${arrival.no}` : t('New Arrival Note')}
        maxWidth="max-w-5xl"
      >
        <div className="space-y-4 text-xs">
          {/* Branch, Date, Note */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                {t('Destination Branch')}
              </label>
              <select
                value={targetBranchId}
                onChange={(e) => setTargetBranchId(e.target.value)}
                disabled={!!arrival}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 cursor-pointer disabled:bg-slate-100 dark:disabled:bg-slate-800/50"
              >
                {availableBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase">
                  {t('Date')}
                </label>
                <button
                  type="button"
                  onClick={() => setDate(todayStr())}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline font-semibold cursor-pointer"
                >
                  {t('Today')}
                </button>
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 uppercase mb-1">
                {t('Note')}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('Note')}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-sm bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Lines table styled identical to TransferModal */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-visible bg-white dark:bg-slate-900">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 uppercase text-[11px]">
                <tr>
                  <th className="text-left px-3 py-2.5 rounded-tl-xl">{t('Item')}</th>
                  {showDirectLotCol && (
                    <th className="text-left px-2.5 py-2.5 w-40">{t('Batch / Lot')}</th>
                  )}
                  {showDirectExpiryCol && (
                    <th className="text-left px-2.5 py-2.5 w-40">{t('Expiry')}</th>
                  )}
                  <th className="text-center px-2 py-2.5 w-24">{t('Current')}</th>
                  <th className="text-center px-2 py-2.5 w-32">{t('Qty')}</th>
                  <th className="w-10 px-1 rounded-tr-xl"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {directLines.map((l, idx) => {
                  const itemObj = db.items.find((i) => i.id === l.itemId);
                  const rowTrack = l.itemId
                    ? resolveItemTracking(db.settings, itemObj)
                    : { trackLot: showDirectLotCol, trackExpiry: showDirectExpiryCol };

                  return (
                    <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 [&>td]:align-top">
                      <td className="px-2.5 py-2">
                        <AutoCompleteBox
                          rows={itemAcRows}
                          placeholder={t('Search item')}
                          defaultValue={itemObj ? itemObj.name : ''}
                          onPick={(row) => handlePickItem(idx, row.id)}
                        />
                        {itemObj && (
                          <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                            {itemObj.sku ? `${itemObj.sku} • ` : ''}
                            {t('Total branch stock')}:{' '}
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              {stockOf(itemObj.id, targetBranchId)}
                            </span>
                          </div>
                        )}
                      </td>

                      {showDirectLotCol && (
                        <td className="px-2 py-2">
                          {rowTrack.trackLot ? (
                            <input
                              type="text"
                              value={l.batchNo || ''}
                              onChange={(e) => handleDirectLineChange(idx, { batchNo: e.target.value })}
                              placeholder="LOT-123"
                              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                            />
                          ) : (
                            <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                          )}
                        </td>
                      )}
                      {showDirectExpiryCol && (
                        <td className="px-2 py-2">
                          {rowTrack.trackExpiry ? (
                            <input
                              type="date"
                              value={l.expiry || ''}
                              onChange={(e) => handleDirectLineChange(idx, { expiry: e.target.value })}
                              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:border-blue-500 focus:outline-none"
                            />
                          ) : (
                            <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                          )}
                        </td>
                      )}

                      <td className="px-2 py-2 pt-3 text-center text-xs tabular-nums">
                        {itemObj ? (
                          <span className="font-semibold text-slate-800 dark:text-slate-200">
                            {stockOf(itemObj.id, targetBranchId)}
                          </span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">—</span>
                        )}
                      </td>

                      <td className="px-2 py-2">
                        <input
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={l.qty || ''}
                          onChange={(e) => handleDirectLineChange(idx, { qty: +e.target.value })}
                          placeholder="1"
                          className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[7rem] px-2.5 py-1.5 text-center font-semibold text-sm text-blue-600 dark:text-blue-400 bg-white dark:bg-slate-800 focus:border-blue-500 focus:outline-none tabular-nums"
                        />
                      </td>

                      <td className="px-1 py-2 pt-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveDirectLine(idx)}
                          disabled={directLines.length === 1 && !l.itemId}
                          className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                          title={t('Remove line')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add line */}
          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={handleAddDirectLine}
              className="text-blue-600 dark:text-blue-400 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer text-xs"
            >
              <Plus className="w-4 h-4" />
              {t('+ New Item')}
            </button>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium cursor-pointer"
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={handleSaveDirectArrival}
              className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
            >
              {arrival ? t('Update Arrival Note') : t('Save')}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // Mode A: Intake-linked Arrival Note
  const branch = db.branches.find((b) => b.id === (arrival?.branchId || intake.branchId));

  const itemRowCounts: Record<string, number> = {};
  lines.forEach((l) => {
    itemRowCounts[l.itemId] = (itemRowCounts[l.itemId] || 0) + 1;
  });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        arrival
          ? `${t('Edit Arrival Note')}   ${arrival.no}`
          : `${t('Arrival Note')}   ${intake.no}`
      }
      subtitle={`${t('The goods have arrived: set how much of each line came in and give it a')} ${t('lot number')} + ${t('expiry date')}. ${branch?.name || ''}`}
      maxWidth="max-w-5xl"
    >
      <div className="space-y-4">
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase">
                {t('Arrival date')}
              </label>
              <button
                type="button"
                onClick={() => setDate(todayStr())}
                className="text-[10px] text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
              >
                {t('Today')}
              </button>
            </div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white font-medium text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
              {t('Note')}
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('Note')}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white font-medium text-slate-800 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
            />
          </div>
        </div>

        {/* Lines table */}
        {(() => {
          const { showLotCol: showIntakeLotCol, showExpiryCol: showIntakeExpiryCol } =
            getLinesTrackingFlags(
              db.settings,
              db.items,
              lines.map((l) => l.itemId)
            );
          return (
            <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
              <table className="w-full text-sm">
                <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-3 py-2.5 min-w-[160px]">{t('Item')}</th>
                    <th className="text-center px-2 py-2.5 w-24">{t('On way')}</th>
                    <th className="text-center px-2 py-2.5 w-32">{t('Arriving')}</th>
                    {showIntakeLotCol && <th className="text-left px-2 py-2.5 w-36">{t('Lot no')}</th>}
                    {showIntakeExpiryCol && <th className="text-left px-2 py-2.5 w-40">{t('Expiry')}</th>}
                    <th className="text-right px-3 py-2.5 w-28">{t('Cost')}</th>
                    <th className="text-center px-2 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lines.map((l, idx) => {
                    const itemObj = db.items.find((i) => i.id === l.itemId);
                    const rowTrack = resolveItemTracking(db.settings, itemObj);
                    const countForItem = itemRowCounts[l.itemId] || 1;
                    const allocatedSum = totalAllocatedForItem(lines, l.itemId);
                    const isOver = allocatedSum > r2(l.rem || 0) + 0.000001;
                    const isFirstRowForItem = lines.findIndex((x) => x.itemId === l.itemId) === idx;

                    return (
                  <tr key={idx} className="hover:bg-slate-50/70">
                    <td className="px-3 py-2 font-medium text-slate-800">
                      <div>{itemObj?.name || '—'}</div>
                      {countForItem > 1 && isFirstRowForItem && (
                        <div
                          className={`text-[10px] mt-0.5 font-semibold tabular-nums ${
                            isOver ? 'text-rose-600' : 'text-blue-600'
                          }`}
                        >
                          {t('Total arriving')}: {allocatedSum} / {l.rem}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-center text-xs text-slate-500 tabular-nums">
                      {l.rem}
                    </td>
                    <td className="px-2 py-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={l.rem}
                        value={l.qty === 0 ? '0' : l.qty || ''}
                        onChange={(e) => handleLineChange(idx, { qty: +e.target.value })}
                        className={`border rounded-lg w-full min-w-[6.5rem] px-2.5 py-1.5 text-center text-sm font-semibold tabular-nums ${
                          isOver
                            ? 'border-rose-400 bg-rose-50 text-rose-700'
                            : 'border-slate-300 text-blue-600'
                        }`}
                      />
                    </td>
                    {showIntakeLotCol && (
                      <td className="px-2 py-2">
                        {rowTrack.trackLot ? (
                          <input
                            type="text"
                            value={l.batchNo}
                            onChange={(e) => handleLineChange(idx, { batchNo: e.target.value })}
                            placeholder="LOT-123"
                            className="border border-slate-300 rounded-lg w-full min-w-[7.5rem] px-2.5 py-1.5 text-xs"
                          />
                        ) : (
                          <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                        )}
                      </td>
                    )}
                    {showIntakeExpiryCol && (
                      <td className="px-2 py-2">
                        {rowTrack.trackExpiry ? (
                          <input
                            type="date"
                            value={l.expiry}
                            onChange={(e) => handleLineChange(idx, { expiry: e.target.value })}
                            className="border border-slate-300 rounded-lg w-full px-2 py-1.5 text-xs"
                          />
                        ) : (
                          <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-xs text-slate-600 tabular-nums">
                      {fmt(l.cost)}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <div className="inline-flex items-center gap-1">
                        {(rowTrack.trackLot || rowTrack.trackExpiry) && (
                          <button
                            type="button"
                            onClick={() => handleSplitLine(idx)}
                            title={t('Add another lot / expiry line')}
                            className="text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-0.5 cursor-pointer transition-colors whitespace-nowrap"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>{t('Split lot')}</span>
                          </button>
                        )}
                        {countForItem > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSplitLine(idx)}
                            title={t('Remove lot line')}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
          );
        })()}

        <div className="text-[11px] text-slate-400">
          {t('One receipt can have several arrival notes   arrive part of it now and the rest later.')}
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
            onClick={handleSaveIntakeArrival}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {arrival ? t('Update Arrival Note') : t('Save   Add to Stock')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
