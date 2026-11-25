import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { AutoCompleteBox } from '../common/AutoCompleteBox';
import { r2, fmt, todayStr, uid } from '../../utils/formatters';
import { calcBarterSummary } from '../../utils/calculations';
import { getLinesTrackingFlags, resolveItemTracking } from '../../utils/tracking';
import type { Barter, BarterGiveLine, BarterRecvLine } from '../../types';
import { Plus, Trash2 } from 'lucide-react';

interface BarterModalProps {
  isOpen: boolean;
  onClose: () => void;
  barter: Barter;
}

export const BarterModal: React.FC<BarterModalProps> = ({ isOpen, onClose, barter }) => {
  const { db, branchId, saveBarter, nextNo, takeFEFO, addStock, stockOf, toastMsg, t } = useIMS();
  const [partnerId, setPartnerId] = useState<string>('');
  const [date, setDate] = useState<string>(todayStr());
  const [note, setNote] = useState<string>('');
  const [giveLines, setGiveLines] = useState<BarterGiveLine[]>([]);
  const [recvLines, setRecvLines] = useState<BarterRecvLine[]>([]);

  useEffect(() => {
    if (isOpen) {
      setPartnerId(barter.partnerId || '');
      setDate(barter.date || todayStr());
      setNote(barter.note || '');
      setGiveLines(
        barter.giveLines?.length
          ? barter.giveLines.map((l) => ({ ...l, price: l.price ?? l.cost ?? 0 }))
          : [{ itemId: null, qty: 1, price: 0, cost: 0 }]
      );
      setRecvLines(
        barter.recvLines?.length
          ? barter.recvLines.map((l) => ({ ...l, price: l.price ?? l.cost ?? 0, expiry: l.expiry || '' }))
          : [{ itemId: null, qty: 1, price: 0, cost: 0, batchNo: '', expiry: '' }]
      );
    }
  }, [barter, isOpen]);

  const custAcRows = db.customers.map((c) => ({
    id: c.id,
    label: c.name,
    sub: c.phone || '',
    code: c.phone || '',
  }));

  const itemAcRows = db.items.map((i) => ({
    id: i.id,
    label: i.name,
    sub: `${t('Price')} ${fmt(i.price)}`,
    code: i.barcode || i.sku || '',
  }));

  const selectedPartner = db.customers.find((c) => c.id === partnerId);
  const { giveValue, recvValue, loss: barterLoss } = calcBarterSummary(giveLines, recvLines);

  const handlePickGiveItem = (idx: number, itemId: string) => {
    const it = db.items.find((i) => i.id === itemId);
    setGiveLines((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        itemId,
        price: it ? it.price : 0,
        cost: it ? it.cost : 0,
      };
      return updated;
    });
  };

  const { showLotCol: showRecvLotCol, showExpiryCol: showRecvExpiryCol } = getLinesTrackingFlags(
    db.settings,
    db.items,
    recvLines.map((l) => l.itemId)
  );

  const handlePickRecvItem = (idx: number, itemId: string, batch?: string, expiry?: string) => {
    const it = db.items.find((i) => i.id === itemId);
    const eff = resolveItemTracking(db.settings, it);
    setRecvLines((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        itemId,
        price: it ? it.price : 0,
        cost: it ? it.cost : 0,
        batchNo: eff.trackLot ? batch || updated[idx].batchNo || '' : '',
        expiry: eff.trackExpiry ? expiry || updated[idx].expiry || '' : '',
      };
      return updated;
    });
  };

  const handleSave = () => {
    if (!partnerId) {
      toastMsg('Choose a partner first', 'error');
      return;
    }
    const give = giveLines.filter((l) => l.itemId && r2(l.qty) > 0);
    const recv = recvLines.filter((l) => l.itemId && r2(l.qty) > 0);
    if (!give.length || !recv.length) {
      toastMsg('Both sides need at least one line', 'error');
      return;
    }

    // Check available stock in branch
    const needByItem: Record<string, number> = {};
    give.forEach((l) => {
      if (l.itemId) needByItem[l.itemId] = r2((needByItem[l.itemId] || 0) + r2(l.qty));
    });

    for (const iid in needByItem) {
      if (stockOf(iid, branchId) + 0.000001 < needByItem[iid]) {
        const it = db.items.find((i) => i.id === iid);
        toastMsg(`Not enough stock of ${it?.name || 'item'} in branch`, 'error');
        return;
      }
    }

    // Deduct given lines via FEFO
    const finalGiveLines: BarterGiveLine[] = [];
    for (const l of give) {
      const res = takeFEFO(l.itemId!, branchId, r2(l.qty));
      if (!res.ok) {
        toastMsg(res.msg || 'Stock deduction error', 'error');
        return;
      }
      (res.taken || []).forEach((t) => {
        finalGiveLines.push({
          itemId: l.itemId,
          qty: t.qty,
          price: r2(l.price ?? l.cost ?? 0),
          cost: r2(l.cost),
          batchNo: t.batchNo,
          expiry: t.expiry,
        });
      });
    }

    // Add received lines into stock (only retain lot/expiry when item tracks them)
    const finalRecvLines: BarterRecvLine[] = recv.map((l) => {
      const it = db.items.find((i) => i.id === l.itemId);
      const eff = resolveItemTracking(db.settings, it);
      return {
        itemId: l.itemId,
        qty: r2(l.qty),
        price: r2(l.price ?? l.cost ?? 0),
        cost: r2(l.cost),
        batchNo: eff.trackLot ? l.batchNo || '' : '',
        expiry: eff.trackExpiry ? l.expiry || '' : '',
      };
    });

    finalRecvLines.forEach((l) => {
      if (l.itemId) addStock(l.itemId, branchId, l.batchNo, l.expiry || '', l.qty, l.cost);
    });

    const rec: Barter = {
      id: uid(),
      no: nextNo(branchId, 'BRT'),
      date: date || todayStr(),
      partnerId,
      branchId,
      note: note.trim(),
      giveLines: finalGiveLines,
      recvLines: finalRecvLines,
      giveValue,
      recvValue,
      loss: barterLoss,
    };

    saveBarter(rec);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('Barter / Item Exchange')}
      subtitle={t('Values at selling price (editable per line). Loss (what we give worth more than we receive) becomes a write-off. Customer balance untouched.')}
      maxWidth="max-w-7xl"
    >
      <div className="space-y-4 text-xs">
        {/* Partner & Date */}
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Partner')}
            </label>
            <AutoCompleteBox
              rows={custAcRows}
              placeholder={t('Search partner')}
              defaultValue={selectedPartner ? selectedPartner.name : ''}
              onPick={(row) => setPartnerId(row.id)}
            />
            {selectedPartner && (
              <div className="text-[11px] text-slate-500 mt-1">
                {t('Selected:')} <b>{selectedPartner.name}</b>
              </div>
            )}
          </div>
          <div>
            <label className="block font-semibold text-slate-700 uppercase mb-1">
              {t('Date')}
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
            />
          </div>
        </div>

        {/* Give vs Receive Tables */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
          {/* We Give */}
          <div className="xl:col-span-5">
            <div className="font-bold text-slate-800 mb-2">
              {t('We give (out of our stock)')}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-visible bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                  <tr>
                    <th className="rounded-tl-xl text-left px-2.5 py-2">{t('Item')}</th>
                    <th className="text-center px-1.5 py-2 w-20">{t('Qty')}</th>
                    <th className="text-center px-1.5 py-2 w-28">{t('Price')}</th>
                    <th className="rounded-tr-xl w-7"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {giveLines.map((l, idx) => {
                    const it = db.items.find((i) => i.id === l.itemId);
                    return (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          <AutoCompleteBox
                            rows={itemAcRows}
                            placeholder={t('Item')}
                            defaultValue={it ? it.name : ''}
                            onPick={(row) => handlePickGiveItem(idx, row.id)}
                          />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.qty || ''}
                            onChange={(e) => {
                              const val = +e.target.value;
                              setGiveLines((prev) => {
                                const up = [...prev];
                                up[idx] = { ...up[idx], qty: val };
                                return up;
                              });
                            }}
                            className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[4.5rem] px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={t('Give Price')}
                            value={l.price || ''}
                            onChange={(e) => {
                              const val = +e.target.value;
                              setGiveLines((prev) => {
                                const up = [...prev];
                                up[idx] = { ...up[idx], price: val };
                                return up;
                              });
                            }}
                            className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[5.5rem] px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-1 text-center">
                          <button
                            type="button"
                            onClick={() => setGiveLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
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
            <button
              type="button"
              onClick={() => setGiveLines((p) => [...p, { itemId: null, qty: 1, price: 0, cost: 0 }])}
              className="mt-1.5 text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('give line')}
            </button>
          </div>

          {/* We Receive */}
          <div className="xl:col-span-7">
            <div className="font-bold text-slate-800 mb-2">
              {t('We receive (into stock)')}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-visible bg-white">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase">
                  <tr>
                    <th className="rounded-tl-xl text-left px-2.5 py-2">{t('Item')}</th>
                    <th className="text-center px-1.5 py-2 w-18">{t('Qty')}</th>
                    <th className="text-center px-1.5 py-2 w-24">{t('Price')}</th>
                    {showRecvLotCol && <th className="text-left px-1.5 py-2 w-24">{t('Batch')}</th>}
                    {showRecvExpiryCol && <th className="text-left px-1.5 py-2 w-32">{t('Expiry')}</th>}
                    <th className="rounded-tr-xl w-7"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recvLines.map((l, idx) => {
                    const it = db.items.find((i) => i.id === l.itemId);
                    const rowTrack = l.itemId
                      ? resolveItemTracking(db.settings, it)
                      : { trackLot: showRecvLotCol, trackExpiry: showRecvExpiryCol };
                    return (
                      <tr key={idx}>
                        <td className="px-2 py-1.5">
                          <AutoCompleteBox
                            rows={itemAcRows}
                            placeholder={t('Item')}
                            defaultValue={it ? it.name : ''}
                            onPick={(row) => handlePickRecvItem(idx, row.id, row.gs1?.batch, row.gs1?.expiry)}
                          />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={l.qty || ''}
                            onChange={(e) => {
                              const val = +e.target.value;
                              setRecvLines((prev) => {
                                const up = [...prev];
                                up[idx] = { ...up[idx], qty: val };
                                return up;
                              });
                            }}
                            className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[4rem] px-1.5 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                          />
                        </td>
                        <td className="px-1.5 py-1.5">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            aria-label={t('Receive Price')}
                            value={l.price || ''}
                            onChange={(e) => {
                              const val = +e.target.value;
                              setRecvLines((prev) => {
                                const up = [...prev];
                                up[idx] = { ...up[idx], price: val };
                                return up;
                              });
                            }}
                            className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[5.25rem] px-2 py-1.5 text-center text-sm tabular-nums bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                          />
                        </td>
                        {showRecvLotCol && (
                          <td className="px-1.5 py-1.5">
                            {rowTrack.trackLot ? (
                              <input
                                type="text"
                                aria-label={t('Batch')}
                                value={l.batchNo || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRecvLines((prev) => {
                                    const up = [...prev];
                                    up[idx] = { ...up[idx], batchNo: val };
                                    return up;
                                  });
                                }}
                                placeholder="LOT"
                                className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[5rem] px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                              />
                            ) : (
                              <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                            )}
                          </td>
                        )}
                        {showRecvExpiryCol && (
                          <td className="px-1.5 py-1.5">
                            {rowTrack.trackExpiry ? (
                              <input
                                type="date"
                                aria-label={t('Expiry')}
                                value={l.expiry || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setRecvLines((prev) => {
                                    const up = [...prev];
                                    up[idx] = { ...up[idx], expiry: val };
                                    return up;
                                  });
                                }}
                                className="border border-slate-300 dark:border-slate-700 rounded-lg w-full min-w-[8rem] px-2 py-1.5 text-xs bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100"
                              />
                            ) : (
                              <div className="text-center text-slate-400 text-xs py-1.5">—</div>
                            )}
                          </td>
                        )}
                        <td className="px-1 text-center">
                          <button
                            type="button"
                            onClick={() => setRecvLines((prev) => prev.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
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
            <button
              type="button"
              onClick={() =>
                setRecvLines((p) => [...p, { itemId: null, qty: 1, price: 0, cost: 0, batchNo: '', expiry: '' }])
              }
              className="mt-1.5 text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('receive line')}
            </button>
          </div>
        </div>

        {/* Note / Remarks */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
            {t('Note')}
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('Barter exchange terms, valuation agreement, or remarks')}
            className="w-full border border-slate-300 rounded-xl px-3 py-2 text-sm bg-white"
          />
        </div>

        {/* Value summary bar */}
        <div className="flex flex-wrap justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="text-slate-600">
            {t('We give value:')} <b>{fmt(giveValue)}</b> • {t('We receive value:')} <b>{fmt(recvValue)}</b>
          </div>
          <div
            className={`font-bold ${
              barterLoss > 0 ? 'text-rose-600' : 'text-emerald-600'
            }`}
          >
            Exchange loss: {fmt(barterLoss)}
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
            {t('Settle Exchange')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
