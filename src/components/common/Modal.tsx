import React, { useEffect, useState, useRef } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidth?: string;
  closeOnBackdropClick?: boolean;
  closeOnEscape?: boolean;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidth = 'max-w-2xl',
  closeOnBackdropClick = false,
  closeOnEscape = false,
  children,
}) => {
  const [isBouncing, setIsBouncing] = useState(false);
  const bounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const triggerAttention = () => {
    setIsBouncing(true);
    if (bounceTimeoutRef.current) clearTimeout(bounceTimeoutRef.current);
    bounceTimeoutRef.current = setTimeout(() => {
      setIsBouncing(false);
    }, 250);
  };

  useEffect(() => {
    return () => {
      if (bounceTimeoutRef.current) clearTimeout(bounceTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (closeOnEscape) {
          onClose();
        } else {
          triggerAttention();
        }
      }
    };
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose, closeOnEscape]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      if (closeOnBackdropClick) {
        onClose();
      } else {
        triggerAttention();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start md:items-center justify-center overflow-y-auto bg-slate-950/70 p-1.5 sm:p-4 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={handleBackdropClick}
    >
      <div
        className={`relative w-full ${maxWidth} my-2 sm:my-6 rounded-xl sm:rounded-2xl bg-white dark:bg-slate-900 p-3.5 sm:p-5 md:p-6 shadow-2xl dark:shadow-[0_25px_60px_-15px_rgba(2,6,23,0.95),0_0_35px_-5px_rgba(30,58,138,0.35)] border border-slate-200/80 dark:border-blue-900/40 max-h-[96vh] sm:max-h-[92vh] flex flex-col transition-all duration-200 transform ${
          isBouncing
            ? 'scale-[1.018] ring-4 ring-blue-500/40 shadow-blue-500/20'
            : 'scale-100 ring-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-slate-100 dark:border-slate-800/90 pb-2 sm:pb-3 mb-2.5 sm:mb-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-tight">{title}</h3>
            {subtitle && <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto pr-1 text-slate-800 dark:text-slate-200">{children}</div>
      </div>
    </div>
  );
};
