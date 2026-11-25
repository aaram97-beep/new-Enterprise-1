import React from 'react';
import { useIMS } from '../../context/IMSContext';

export const Toast: React.FC = () => {
  const { toast } = useIMS();
  if (!toast) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl shadow-xl text-sm font-medium text-white max-w-[90vw] transition-all transform animate-in fade-in slide-in-from-bottom-2 duration-200 ${
        toast.type === 'error' ? 'bg-rose-600 shadow-rose-600/25' : 'bg-emerald-600 shadow-emerald-600/25'
      }`}
    >
      {toast.message}
    </div>
  );
};
