import React from 'react';
import { Modal } from '../common/Modal';

interface ImportReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  kind: string;
  skippedRows: string[];
}

export const ImportReportModal: React.FC<ImportReportModalProps> = ({
  isOpen,
  onClose,
  kind,
  skippedRows,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Import • ${kind}: skipped rows`}
      subtitle={`${skippedRows.length} row(s) were skipped — see why below. Fix the file or the column mapping and import again.`}
      maxWidth="max-w-lg"
    >
      <div className="space-y-4 text-xs">
        <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
          {skippedRows.map((r, i) => (
            <div
              key={i}
              className="border-b border-slate-100 pb-1.5 text-rose-700 font-medium"
            >
              {r}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
};
