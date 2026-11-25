import React from 'react';
import { useIMS } from '../../context/IMSContext';
import { Modal } from '../common/Modal';
import { fmt, fmtDate, r2, diffDays, todayStr } from '../../utils/formatters';
import { resolveItemTracking } from '../../utils/tracking';

interface BatchesModalProps {
  isOpen: boolean;
  onClose: () => void;
  itemId: string | null;
}

export const BatchesModal: React.FC<BatchesModalProps> = ({ isOpen, onClose, itemId }) => {
  const { db, t } = useIMS();
  const item = db.items.find((i) => i.id === itemId);
  const batches = db.stocks.filter((s) => s.itemId === itemId && s.qty > 0.005);
  const { trackLot, trackExpiry } = resolveItemTracking(db.settings, item);
  const colSpanCount = 4 + (trackLot ? 1 : 0) + (trackExpiry ? 1 : 0);

  const expiryChip = (expiry?: string) => {
    if (!expiry) return 'bg-slate-100 text-slate-600';
    const dd = diffDays(expiry, todayStr());
    if (dd < 0) return 'bg-rose-100 text-rose-700 font-semibold';
    if (dd <= (+db.settings.expiryWarnDays || 30)) return 'bg-amber-100 text-amber-700 font-semibold';
    return 'bg-emerald-100 text-emerald-700 font-medium';
  };

  const branchName = (bId: string) => (db.branches.find((b) => b.id === bId) || {}).name || '—';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${t('Batches')}   ${item?.name || ''}`}
      maxWidth="max-w-2xl"
    >
      <div className="space-y-4">
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('Branch')}</th>
                {trackLot && <th className="text-left px-3 py-2.5">{t('Batch')}</th>}
                {trackExpiry && <th className="text-left px-3 py-2.5">{t('Expiry')}</th>}
                <th className="text-center px-2 py-2.5 w-20">{t('Qty')}</th>
                <th className="text-right px-3 py-2.5 w-24">{t('Cost')}</th>
                <th className="text-right px-3 py-2.5 w-24">{t('Value')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 text-xs text-slate-700">{branchName(s.branchId)}</td>
                  {trackLot && <td className="px-3 py-2 font-mono text-xs">{s.batchNo || '—'}</td>}
                  {trackExpiry && (
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs ${expiryChip(s.expiry)}`}>
                        {s.expiry ? fmtDate(s.expiry) : 'n/a'}
                      </span>
                    </td>
                  )}
                  <td className="px-2 py-2 text-center font-bold text-slate-900">{s.qty}</td>
                  <td className="px-3 py-2 text-right text-xs text-slate-600">{fmt(s.cost)}</td>
                  <td className="px-3 py-2 text-right font-semibold text-slate-900">
                    {fmt(r2(s.qty * s.cost))}
                  </td>
                </tr>
              ))}
              {batches.length === 0 && (
                <tr>
                  <td colSpan={colSpanCount} className="text-center py-6 text-sm text-slate-400">
                    {t('None.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium cursor-pointer"
          >
            {t('Close')}
          </button>
        </div>
      </div>
    </Modal>
  );
};
