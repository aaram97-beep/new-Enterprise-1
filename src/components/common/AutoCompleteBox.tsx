import React, { useState, useRef, useEffect } from 'react';
import { parseGS1, type GS1ParsedData } from '../../utils/gs1Parser';
import { ChevronDown } from 'lucide-react';

export interface AutoCompleteRow {
  id: string;
  label: string;
  sub?: string;
  code?: string;
  gs1?: GS1ParsedData;
}

interface AutoCompleteBoxProps {
  rows: AutoCompleteRow[];
  placeholder?: string;
  onPick: (row: AutoCompleteRow) => void;
  defaultValue?: string;
}

export const AutoCompleteBox: React.FC<AutoCompleteBoxProps> = ({
  rows = [],
  placeholder = '',
  onPick,
  defaultValue = '',
}) => {
  const [q, setQ] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQ(defaultValue || '');
  }, [defaultValue]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const t = q.trim().toLowerCase();
  const isSelectedExact = !!defaultValue && t === defaultValue.trim().toLowerCase();

  // If query is empty or matches the currently selected label, show the complete catalog rows!
  const matches = t && !isSelectedExact
    ? rows.filter((r) =>
        `${r.label || ''} ${r.sub || ''} ${r.code || ''}`.toLowerCase().includes(t)
      )
    : rows;

  const handlePick = (m: AutoCompleteRow, g: GS1ParsedData | null) => {
    const payload = { ...m };
    if (g) payload.gs1 = g;
    setQ(m.label);
    setOpen(false);
    onPick(payload);
  };

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQ(v);
    setOpen(true);
    const g = parseGS1(v);
    const code = (g && g.gtin) || (/^\d{8,14}$/.test(v.trim()) ? v.trim() : null);
    if (code) {
      const digits = ('' + code).replace(/\D/g, '');
      const m = rows.find((r) => r.code && ('' + r.code).replace(/\D/g, '').endsWith(digits));
      if (m) {
        handlePick(m, g);
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const m = matches[0];
      if (m) {
        e.preventDefault();
        handlePick(m, parseGS1(q));
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full ${open ? 'z-50' : 'z-10'}`}>
      <div className="relative flex items-center">
        <input
          type="text"
          value={q}
          onChange={handleInput}
          onFocus={(e) => {
            setOpen(true);
            e.target.select();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 pl-3 pr-7 rtl:pl-7 rtl:pr-3 py-1.5 text-xs sm:text-sm transition-colors focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:shadow-sm dark:shadow-blue-950/40"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setOpen((prev) => !prev)}
          className="absolute right-2 rtl:right-auto rtl:left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer p-0.5"
          aria-label="Toggle items catalog"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl dark:shadow-[0_15px_35px_rgba(2,6,23,0.9),0_0_20px_rgba(30,58,138,0.3)] ring-1 ring-black/5 dark:ring-blue-900/30 text-xs sm:text-sm">
          {matches.map((m) => {
            const isChosen = defaultValue === m.label;
            return (
              <button
                key={m.id}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handlePick(m, null);
                }}
                className={`w-full border-b border-slate-50 dark:border-slate-800 px-3 py-2 text-left rtl:text-right transition-colors last:border-0 hover:bg-blue-50 dark:hover:bg-slate-800/80 cursor-pointer ${
                  isChosen ? 'bg-blue-50/60 dark:bg-slate-800' : ''
                }`}
              >
                <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>{m.label}</span>
                  {isChosen && (
                    <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold uppercase">✓</span>
                  )}
                </div>
                {m.sub && <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{m.sub}</div>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
