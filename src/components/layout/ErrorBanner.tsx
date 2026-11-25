import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { AlertTriangle, X } from 'lucide-react';
import { Modal } from '../common/Modal';
import { fmtDateTime } from '../../utils/formatters';

export const ErrorBanner: React.FC = () => {
  const { errBanner, setErrBanner, errLog, setErrLog, t } = useIMS();
  const [modalOpen, setModalOpen] = useState(false);

  if (!errBanner) return null;

  return (
    <>
      <div className="bg-rose-600 text-white px-4 md:px-6 py-2 text-xs md:text-sm flex items-center gap-3 shadow-md z-40">
        <AlertTriangle className="w-4 h-4 shrink-0 text-rose-200" />
        <span className="flex-1 truncate" title={errBanner}>
          {errBanner}
        </span>
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="text-xs font-semibold underline underline-offset-2 hover:text-rose-100 whitespace-nowrap cursor-pointer"
        >
          {t('Details')}
        </button>
        <button
          type="button"
          onClick={() => setErrBanner('')}
          className="p-1 hover:bg-rose-700 rounded text-rose-200 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={t('Error Log')}
        subtitle={`Last ${errLog.length} recorded issue(s)`}
      >
        <div className="space-y-3">
          {errLog.length === 0 ? (
            <div className="text-sm text-slate-400 py-6 text-center">{t('No errors recorded.')}</div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {[...errLog].reverse().map((e, i) => (
                <div key={i} className="border border-slate-200 rounded-xl p-3 bg-slate-50 text-xs">
                  <div className="text-slate-400 font-mono text-[11px] mb-1">
                    {fmtDateTime(e.ts)} {e.src && `  [${e.src}]`}
                  </div>
                  <div className="text-rose-700 font-medium break-words">{e.msg}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            {errLog.length > 0 && (
              <button
                type="button"
                onClick={() => setErrLog([])}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                {t('Clear log')}
              </button>
            )}
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-1.5 rounded-lg bg-slate-900 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
            >
              {t('Close')}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
};
