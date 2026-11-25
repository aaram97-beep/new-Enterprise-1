import React, { useState, useRef } from 'react';
import { useIMS } from '../../context/IMSContext';
import { r2 } from '../../utils/formatters';
import {
  invoiceTotal,
  paidOfInvoice,
  invBalance,
  intakeTotal,
  effCheckStatus,
} from '../../utils/calculations';
import { exportCSV, exportJSON, parseFileForImport } from '../../utils/exportImport';
import { getGlobalTrackFlags } from '../../utils/tracking';
import { IMPORT_KINDS, IMPORT_FIELDS } from '../../data/constants';
import { Download, Upload, RotateCcw, AlertOctagon } from 'lucide-react';
import { Modal } from '../common/Modal';

interface DataViewProps {
  onStartImport: (
    kind: string,
    fileName: string,
    headers: string[],
    rows: string[][],
    fields: any[],
    initialMap: Record<string, string>
  ) => void;
}

export const DataView: React.FC<DataViewProps> = ({ onStartImport }) => {
  const {
    db,
    loadDemoData,
    eraseAllData,
    restoreDatabase,
    sessionUser,
    canAccess,
    toastMsg,
    t,
  } = useIMS();
  const canSales = canAccess('sales');
  const canDeliveries = canAccess('deliveries');
  const canPur = canAccess('purchasing');
  const canPaybook = canAccess('paybook');
  const canChecks = canAccess('checks');
  const canInv = canAccess('inventory');
  const canCust = canAccess('customers');
  const visibleImportKinds = IMPORT_KINDS.filter((k) => {
    if (k.id === 'items' || k.id === 'stock') return canInv;
    if (k.id === 'customers') return canCust;
    return true;
  });
  const [confirmAction, setConfirmAction] = useState<'erase' | 'demo' | null>(null);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const itemName = (id: string | null) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string) => (db.branches.find((b) => b.id === id) || {}).name || '—';
  const invoiceById = (id: string) => db.invoices.find((x) => x.id === id) || null;

  const handleFileSelect = async (kind: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    try {
      const { headers, rows } = await parseFileForImport(file);
      if (!rows.length) {
        toastMsg('File has no data rows', 'error');
        return;
      }
      const fields = IMPORT_FIELDS[kind] || [];
      const normH = (s: string) =>
        String(s == null ? '' : s)
          .toLowerCase()
          .replace(/[^0-9a-z\u0600-\u06ff]+/g, '');

      const map: Record<string, string> = {};
      fields.forEach((fd) => {
        const syns = fd.matches || [fd.key];
        const guess = headers.find((h) => {
          const hn = normH(h);
          return syns.some((sy) => hn.includes(normH(sy)));
        });
        if (guess) map[fd.key] = guess;
      });

      onStartImport(kind, file.name, headers, rows, fields, map);
    } catch (err: any) {
      toastMsg(`Could not read file: ${err.message || err}`, 'error');
    }
  };

  const handleRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || !Array.isArray(parsed.invoices)) {
        toastMsg('Invalid backup file', 'error');
        return;
      }
      restoreDatabase(parsed);
    } catch {
      toastMsg('Could not read or parse backup JSON', 'error');
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Column Mapping Imports */}
        <div className="min-w-0 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-center gap-2">
              <Upload className="w-5 h-5 text-blue-600" />
              <span>{t('Import with Column Mapping')}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {t("CSV or Excel. After choosing a file you'll map its columns to system fields.")}
            </p>
          </div>

          <div className="space-y-2.5">
            {visibleImportKinds.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between gap-3 border border-slate-200 rounded-xl p-3 bg-slate-50/50 hover:bg-slate-50 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-slate-800 text-sm">{t(k.label)}</div>
                  <div className="text-[11px] text-slate-400 truncate">{t(k.hint)}</div>
                </div>
                <label className="bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-xl px-3 py-1.5 text-xs font-semibold cursor-pointer shrink-0 transition-colors">
                  Choose file
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    className="hidden"
                    onChange={(e) => handleFileSelect(k.id, e)}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* One-Click Exports & Backup */}
        <div className="min-w-0 bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
          <div>
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-center gap-2">
              <Download className="w-5 h-5 text-emerald-600" />
              <span>{t('One-Click Exports')}</span>
            </h2>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            {canSales && (
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    'invoices',
                    db.invoices.map((s) => ({
                      no: s.no,
                      date: s.date,
                      customer: customerName(s.customerId),
                      total: invoiceTotal(s, db.settings.taxRate),
                      paid: paidOfInvoice(db, s),
                      balance: invBalance(db, s),
                    }))
                  )
                }
                className="border border-slate-200 rounded-xl p-2.5 text-left font-medium hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {t('Invoices')}
              </button>
            )}
            {canDeliveries && (
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    'deliveries',
                    db.deliveries.map((d) => ({
                      no: d.no,
                      date: d.date,
                      invoice:
                        (d.invoiceId ? db.invoices.find((i) => i.id === d.invoiceId)?.no : '') ||
                        (d.returnSlipId ? db.returnSlips.find((r) => r.id === d.returnSlipId)?.no : '') ||
                        '',
                      customer: customerName(d.customerId),
                    }))
                  )
                }
                className="border border-slate-200 rounded-xl p-2.5 text-left font-medium hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {t('Delivery Slips')}
              </button>
            )}
            {canPur && (
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    'buying-receipts',
                    db.intakes.map((p) => ({
                      no: p.no,
                      date: p.date,
                      provider: customerName(p.providerId),
                      total: intakeTotal(p),
                    }))
                  )
                }
                className="border border-slate-200 rounded-xl p-2.5 text-left font-medium hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {t('Purchase Receipts')}
              </button>
            )}
            {canPaybook && (
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    'payments',
                    db.payments.map((p) => ({
                      no: p.no,
                      date: p.date,
                      customer: customerName(p.customerId),
                      amount: p.amount,
                      direction: p.dir,
                    }))
                  )
                }
                className="border border-slate-200 rounded-xl p-2.5 text-left font-medium hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {t('Payment Book')}
              </button>
            )}
            {canChecks && (
              <button
                type="button"
                onClick={() =>
                  exportCSV(
                    'checks',
                    db.checks.map((c) => ({
                      ref: c.no,
                      customer: customerName(c.customerId),
                      checkNo: c.checkNo,
                      amount: c.amount,
                      status: effCheckStatus(c),
                    }))
                  )
                }
                className="border border-slate-200 rounded-xl p-2.5 text-left font-medium hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {t('Checks')}
              </button>
            )}
            {canInv && (
              <button
                type="button"
                onClick={() => {
                  const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
                  exportCSV(
                    'stock-valuation',
                    db.stocks.map((s) => {
                      const row: Record<string, any> = {
                        item: itemName(s.itemId),
                        branch: branchName(s.branchId),
                      };
                      if (trackLot) row.batch = s.batchNo;
                      if (trackExpiry) row.expiry = s.expiry || '';
                      row.qty = s.qty;
                      row.cost = s.cost;
                      row.value = r2(s.qty * s.cost);
                      return row;
                    })
                  );
                }}
                className="border border-slate-200 rounded-xl p-2.5 text-left font-medium hover:bg-slate-50 text-slate-700 cursor-pointer"
              >
                {t('Stock Valuation')}
              </button>
            )}
          </div>

          {/* Backup & System Maintenance */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h3 className="font-bold text-sm text-slate-900">{t('Backup & Migration')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => exportJSON('enterprise-ims-backup', db)}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl py-2 px-3 font-semibold shadow-sm cursor-pointer"
              >
                {t('Download Full Backup')}
              </button>
              <label className="border border-slate-300 rounded-xl py-2 px-3 text-center font-medium hover:bg-slate-50 cursor-pointer">
                Restore Backup
                <input
                  ref={restoreInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={handleRestoreFile}
                />
              </label>
              {sessionUser?.role === 'admin' && (
                <button
                  type="button"
                  onClick={() => setConfirmAction('demo')}
                  className="border border-slate-200 rounded-xl py-2 px-3 hover:bg-slate-50 font-medium text-slate-700 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  {t('Reset to fresh demo data')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setConfirmAction('erase')}
                className="bg-rose-600 hover:bg-rose-700 text-white rounded-xl py-2 px-3 font-semibold shadow-sm flex items-center justify-center gap-1 cursor-pointer"
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                {t('Erase All Data')}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* In-app Confirmation Modal for Reset & Erase Actions */}
      <Modal
        isOpen={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === 'erase' ? t('Erase All Data') : t('Reset to fresh demo data')}
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed">
              {confirmAction === 'erase' ? (
                <>
                  <p className="font-semibold text-rose-800 text-sm mb-1">
                    {t('Erase all data and start fresh?')}
                  </p>
                  <p className="text-slate-600">
                    {t(
                      'This will permanently delete all transactions, items, customers, and accounts. This action cannot be undone. We strongly recommend downloading a backup first.'
                    )}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold text-rose-800 text-sm mb-1">
                    {t('Reset to fresh demo data?')}
                  </p>
                  <p className="text-slate-600">
                    {t(
                      'This will replace your current database with the default 6-month demonstration dataset. Any unsaved custom records will be overwritten.'
                    )}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setConfirmAction(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              {t('Cancel')}
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmAction === 'erase') {
                  eraseAllData();
                } else if (confirmAction === 'demo') {
                  loadDemoData();
                }
                setConfirmAction(null);
              }}
              className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <AlertOctagon className="w-3.5 h-3.5" />
              {confirmAction === 'erase' ? t('Erase All Data') : t('Reset to fresh demo data')}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
