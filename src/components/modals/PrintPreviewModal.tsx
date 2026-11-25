import React, { useState } from 'react';
import { Printer, ExternalLink, Download, Copy, Check, X, FileText, Info, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useIMS } from '../../context/IMSContext';
import {
  triggerNativePrint,
  openInNewTabAndPrint,
  downloadPrintHtml,
} from '../../utils/printService';

interface PrintPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  html: string;
  title: string;
  docRef?: string;
}

export const PrintPreviewModal: React.FC<PrintPreviewModalProps> = ({
  isOpen,
  onClose,
  html,
  title,
  docRef,
}) => {
  const { t, db } = useIMS();
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [isIframe] = useState(() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  });

  if (!isOpen) return null;

  const currentLang = db?.settings?.lang || 'en';
  const isRtl = currentLang === 'ar';

  const handlePrint = () => {
    triggerNativePrint(html, currentLang);
  };

  const handleOpenNewTab = () => {
    openInNewTabAndPrint(html, title, currentLang);
  };

  const handleDownload = () => {
    const filename = `${docRef ? docRef.replace(/[^a-zA-Z0-9-_]/g, '_') : 'document'}.html`;
    downloadPrintHtml(html, filename, title, currentLang);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 140));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 60));
  const handleZoomReset = () => setZoom(100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        className="bg-slate-100 dark:bg-slate-900 rounded-2xl shadow-2xl dark:shadow-[0_25px_60px_-15px_rgba(2,6,23,0.95),0_0_35px_-5px_rgba(30,58,138,0.35)] w-full max-w-5xl max-h-[94vh] flex flex-col border border-slate-300 dark:border-blue-900/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="bg-slate-900 text-white px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-blue-600/30 text-blue-400 border border-blue-500/30 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base text-white truncate">
                {title || t('Document Print Preview')}
              </h3>
              {docRef && (
                <div className="text-[11px] text-slate-400 font-mono truncate">{docRef}</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center bg-slate-800/90 border border-slate-700/80 rounded-xl px-1.5 py-1 text-slate-300 text-xs gap-1 mr-1">
              <button
                type="button"
                onClick={handleZoomOut}
                className="p-1 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title={t('Zoom Out')}
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                className="px-1.5 py-0.5 hover:text-white font-mono text-[11px] cursor-pointer"
                title={t('Reset Zoom')}
              >
                {zoom}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                className="p-1 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
                title={t('Zoom In')}
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Primary Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-500 text-white px-3 sm:px-3.5 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-blue-600/30 transition-all cursor-pointer"
              title={t('Print using browser print dialog')}
            >
              <Printer className="w-4 h-4" />
              <span>{t('Print')}</span>
            </button>

            {/* Open in Clean Tab Button (Escapes Google AI Studio iframe sandbox) */}
            <button
              type="button"
              onClick={handleOpenNewTab}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
              title={t('Open document in a new tab (bypasses iframe restrictions)')}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>{t('Open New Tab')}</span>
            </button>

            {/* Download HTML */}
            <button
              type="button"
              onClick={handleDownload}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              title={t('Download printable document HTML file')}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">{t('Download')}</span>
            </button>

            {/* Copy HTML */}
            <button
              type="button"
              onClick={handleCopy}
              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 p-2 rounded-xl text-xs transition-all cursor-pointer"
              title={t('Copy HTML')}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors ml-1 cursor-pointer"
              title={t('Close')}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Informational banner about iframe environments like Google AI Studio */}
        {isIframe && (
          <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-900 flex items-center gap-2">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              {t(
                'AI Studio Preview Notice: If your browser blocks the print dialog inside this embedded frame, click "Open New Tab" to print in a clean standalone window.'
              )}
            </span>
          </div>
        )}

        {/* Scrollable Document Canvas with perfect paper margins and no clipping */}
        <div className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-6 md:p-8 bg-slate-200/80 dark:bg-slate-950/80 flex justify-center custom-scrollbar">
          <div
            className="print-paper-sheet bg-white text-slate-900 p-6 sm:p-10 md:p-12 rounded-lg shadow-xl border border-slate-300 w-full max-w-[21cm] min-h-[29.7cm] box-border transition-transform"
            style={{
              transform: zoom === 100 ? 'none' : `scale(${zoom / 100})`,
              transformOrigin: 'top center',
            }}
          >
            <div
              className="pr-a4"
              dir={isRtl ? 'rtl' : 'ltr'}
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        </div>

        {/* Bottom bar */}
        <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-5 py-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div>
            <span>{t('Standard A4 Document')}</span> • <span>{t('Ready for printing or PDF export')}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold cursor-pointer border border-transparent dark:border-slate-700"
          >
            {t('Close')}
          </button>
        </div>
      </div>
    </div>
  );
};

