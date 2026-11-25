import React, { useState, useEffect } from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { r2, uid, todayStr } from '../../utils/formatters';
import { importNum, importBool, importExpiry } from '../../utils/exportImport';
import { resolveItemTracking } from '../../utils/tracking';
import { IMPORT_KINDS, type ImportFieldDef } from '../../data/constants';

interface ImportMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: string;
  fileName: string;
  headers: string[];
  rows: string[][];
  fields: ImportFieldDef[];
  initialMap: Record<string, string>;
  onShowReport: (kind: string, skippedRows: string[]) => void;
}

export const ImportMappingModal: React.FC<ImportMappingModalProps> = ({
  isOpen,
  onClose,
  kind,
  fileName,
  headers,
  rows,
  fields,
  initialMap,
  onShowReport,
}) => {
  const { db, setDb, audit, toastMsg, session, t } = useIMS();
  const [columnMap, setColumnMap] = useState<Record<string, string>>(initialMap);
  const [targetBranch, setTargetBranch] = useState<string>('');

  useEffect(() => {
    setColumnMap(initialMap);
    setTargetBranch('');
  }, [initialMap, isOpen]);

  const kindObj = IMPORT_KINDS.find((k) => k.id === kind);
  const selectedBranch = db.branches.find((b) => b.id === targetBranch);

  const handleApply = () => {
    const fOf = (key: string) => fields.find((f) => f.key === key) || { key, label: key, req: false, matches: [] };
    const hIdx: Record<string, number> = {};
    headers.forEach((h, i) => {
      hIdx[h] = i;
    });

    const get = (row: string[], f: ImportFieldDef) => {
      const col = columnMap[f.key];
      if (!col || hIdx[col] == null) return '';
      const v = row[hIdx[col]];
      return v == null ? '' : String(v).trim();
    };

    if (kind === 'stock' && !targetBranch) {
      toastMsg(t('Please select a target branch from the dropdown or map a branch column'), 'error');
      return;
    }

    const missing = fields.filter((f) => {
      if (kind === 'stock' && f.key === 'branch') {
        if (targetBranch && targetBranch !== '__column__') return false;
        return !columnMap[f.key];
      }
      return f.req && !columnMap[f.key];
    }).map((f) => f.label);

    if (missing.length) {
      toastMsg(`Cannot import   required column(s) not mapped: ${missing.join(', ')}`, 'error');
      return;
    }

    const normKey = (v: any) =>
      String(v == null ? '' : v)
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ');

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const skipLog: string[] = [];

    setDb((prev) => {
      let items = [...prev.items];
      let customers = [...prev.customers];
      let adjusts = [...prev.adjusts];
      let stocks = [...prev.stocks];

      if (kind === 'items') {
        const fn = fOf('name');
        rows.forEach((row, i) => {
          const name = get(row, fn);
          if (!name) {
            skipped++;
            skipLog.push(`Row ${i + 2}: item name is empty`);
            return;
          }
          const sku = get(row, fOf('sku'));
          const it = items.find(
            (x) => (sku && normKey(x.sku) === normKey(sku)) || normKey(x.name) === normKey(name)
          );
          const data = {
            name,
            sku,
            price: r2(importNum(get(row, fOf('price')))),
            cost: r2(importNum(get(row, fOf('cost')))),
            company: get(row, fOf('company')),
            group: get(row, fOf('group')),
            barcode: get(row, fOf('barcode')),
            reorder: r2(importNum(get(row, fOf('reorder')))),
            note: get(row, fOf('note')),
          };
          if (it) {
            items = items.map((x) => (x.id === it.id ? { ...x, ...data } : x));
            updated++;
          } else {
            items.push({ id: uid(), batch: true, trackingMode: 'global', ...data });
            created++;
          }
        });
      } else if (kind === 'customers') {
        rows.forEach((row, i) => {
          const name = get(row, fOf('name'));
          if (!name) {
            skipped++;
            skipLog.push(`Row ${i + 2}: customer name is empty`);
            return;
          }
          const c = customers.find((x) => normKey(x.name) === normKey(name));
          const data = {
            name,
            phone: get(row, fOf('phone')),
            address: get(row, fOf('address')),
            openingBalance: r2(importNum(get(row, fOf('openingBalance')))),
            isProvider: importBool(get(row, fOf('provider'))),
          };
          if (c) {
            customers = customers.map((x) => (x.id === c.id ? { ...x, ...data } : x));
            updated++;
          } else {
            customers.push({ id: uid(), ...data });
            created++;
          }
        });
      } else if (kind === 'stock') {
        rows.forEach((row, i) => {
          const rn = `Row ${i + 2}`;
          const itemKey = get(row, fOf('item'));
          const branchKey = targetBranch !== '__column__' ? '' : get(row, fOf('branch'));
          const qtyRaw = get(row, fOf('qty'));
          const qty = r2(importNum(qtyRaw));

          if (!itemKey) {
            skipped++;
            skipLog.push(`${rn}: item column is empty`);
            return;
          }
          if (targetBranch === '__column__' && !branchKey) {
            skipped++;
            skipLog.push(`${rn}: branch column is empty`);
            return;
          }
          if (!qty) {
            skipped++;
            skipLog.push(`${rn}: quantity "${qtyRaw}" is not a valid non-zero number`);
            return;
          }

          const ik = normKey(itemKey);
          const it =
            items.find((x) => normKey(x.sku) === ik) ||
            items.find((x) => normKey(x.barcode) === ik) ||
            items.find((x) => normKey(x.name) === ik);

          let br: (typeof prev.branches)[0] | undefined;
          if (targetBranch && targetBranch !== '__column__') {
            br = prev.branches.find((x) => x.id === targetBranch);
          } else {
            const bk = normKey(branchKey);
            br =
              prev.branches.find((x) => normKey(x.code) === bk) ||
              prev.branches.find((x) => normKey(x.name) === bk);
          }

          if (!it) {
            skipped++;
            skipLog.push(`${rn}: no item matches "${itemKey}" (tried SKU, barcode and full name)`);
            return;
          }
          if (!br) {
            skipped++;
            skipLog.push(`${rn}: no branch matches "${branchKey || targetBranch}"`);
            return;
          }

          const tr = resolveItemTracking(prev.settings, it);
          const batchNo = tr.trackLot ? get(row, fOf('batchNo')) : '';
          const expiry = tr.trackExpiry ? importExpiry(get(row, fOf('expiry'))) : '';
          const cost = r2(importNum(get(row, fOf('cost')))) || it.cost;

          const existingStock = stocks.find(
            (s) =>
              s.itemId === it.id &&
              s.branchId === br.id &&
              (s.batchNo || '') === (batchNo || '') &&
              (s.expiry || '') === (expiry || '')
          );
          if (existingStock) {
            existingStock.qty = r2(existingStock.qty + qty);
            if (cost != null) existingStock.cost = r2(cost);
          } else {
            stocks.push({
              id: uid(),
              itemId: it.id,
              branchId: br.id,
              batchNo: batchNo || '',
              expiry: expiry || '',
              qty,
              cost: r2(cost || 0),
            });
          }

          adjusts.push({
            id: uid(),
            date: todayStr(),
            branchId: br.id,
            itemId: it.id,
            batchNo: batchNo || '',
            expiry: expiry || '',
            qty,
            cost,
            reason: 'Import opening stock',
            user: session ? session.name : '',
          });
          created++;
        });
      }

      audit('Import', `${kind}: ${created} created, ${updated} updated, ${skipped} skipped`);
      return { ...prev, items, customers, adjusts, stocks };
    });

    onClose();
    if (skipped > 0) {
      onShowReport(kind, skipLog.slice(0, 50));
      toastMsg(`Import done   ${created} created, ${updated} updated, ${skipped} skipped`, 'error');
    } else {
      toastMsg(`Import done   ${created} created, ${updated} updated, 0 skipped`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Map Columns   ${kindObj?.label || kind}`}
      subtitle={`${fileName} • ${rows.length} rows • columns detected: ${headers.join(', ')}`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-xs">
        {kind === 'stock' && (
          <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <span>{t('Destination Branch')}</span>
                <span className="text-red-500">*</span>
              </label>
              {selectedBranch ? (
                <span className="text-[11px] font-semibold text-blue-700 bg-blue-100/70 border border-blue-300 px-2 py-0.5 rounded-lg">
                  {selectedBranch.name} ({selectedBranch.code})
                </span>
              ) : targetBranch === '__column__' ? (
                <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-lg">
                  {t('Using column')}
                </span>
              ) : (
                <span className="text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg">
                  {t('Manual selection required')}
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-600">
              {t('Select which branch will receive the imported stock, or choose to read branch codes from your file.')}
            </p>
            <select
              value={targetBranch}
              onChange={(e) => setTargetBranch(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs bg-white text-slate-800 font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('-- Select Target Branch --')}</option>
              {db.branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
              <option value="__column__">{t('Map branch from file column (multiple branches in file)')}</option>
            </select>
          </div>
        )}

        <div className="space-y-2.5 max-h-[55vh] overflow-y-auto pr-1">
          {fields.map((f) => {
            const isBranchOverridden = kind === 'stock' && f.key === 'branch' && targetBranch && targetBranch !== '__column__';
            const isReq = kind === 'stock' && f.key === 'branch' ? targetBranch === '__column__' : f.req;

            if (isBranchOverridden) {
              return (
                <div key={f.key} className="flex items-center gap-3">
                  <div className="w-36 text-slate-500 font-medium">
                    {f.label}
                  </div>
                  <div className="flex-1 text-xs text-blue-900 bg-blue-50/80 border border-blue-200 rounded-xl px-3 py-1.5 font-medium flex items-center justify-between">
                    <span>
                      {t('Using branch selected above:')}{' '}
                      <strong>{selectedBranch ? `${selectedBranch.name} (${selectedBranch.code})` : ''}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTargetBranch('__column__')}
                      className="text-[11px] text-blue-600 underline hover:text-blue-800 ml-2 cursor-pointer font-normal"
                    >
                      {t('Map from column instead')}
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div key={f.key} className="flex items-center gap-3">
                <div className={`w-36 ${isReq ? 'font-bold text-slate-800' : 'text-slate-600'}`}>
                  {f.label}
                  {isReq && ' *'}
                </div>
                <select
                  value={columnMap[f.key] || ''}
                  onChange={(e) =>
                    setColumnMap((prev) => ({
                      ...prev,
                      [f.key]: e.target.value,
                    }))
                  }
                  className="flex-1 border border-slate-300 rounded-xl px-2.5 py-1.5 text-xs bg-white cursor-pointer"
                >
                  <option value="">{t('not mapped')}</option>
                  {headers.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

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
            onClick={handleApply}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-md shadow-blue-500/20 cursor-pointer"
          >
            {t('Import')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
