export const r2 = (v: number | string | null | undefined): number => {
  return Math.round((Number(v) || 0) * 100) / 100;
};

export const pad2 = (n: number | string): string => {
  return String(n).padStart(2, '0');
};

export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const MONTH_TO_NUM: Record<string, string> = {
  jan: '01',
  january: '01',
  feb: '02',
  february: '02',
  mar: '03',
  march: '03',
  apr: '04',
  april: '04',
  may: '05',
  jun: '06',
  june: '06',
  jul: '07',
  july: '07',
  aug: '08',
  august: '08',
  sep: '09',
  sept: '09',
  september: '09',
  oct: '10',
  october: '10',
  nov: '11',
  november: '11',
  dec: '12',
  december: '12',
};

const NAMED_MONTH_DATE_RE = /^(\d{4})[.\-/]([A-Za-z]{3,9})[.\-/](\d{1,2})$/;

export const toIsoDate = (val: string | null | undefined): string => {
  const s = String(val ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(NAMED_MONTH_DATE_RE);
  if (m) {
    const mon = MONTH_TO_NUM[m[2].toLowerCase()];
    if (mon) {
      return `${m[1]}-${mon}-${pad2(parseInt(m[3], 10))}`;
    }
  }
  return s.slice(0, 10);
};

export const addDays = (iso: string | null | undefined, n: number): string => {
  const normalized = toIsoDate(iso) || todayStr();
  const d = new Date(`${normalized}T00:00:00`);
  d.setDate(d.getDate() + (Number(n) || 0));
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

export const diffDays = (a: string, b: string): number => {
  const na = toIsoDate(a);
  const nb = toIsoDate(b);
  const da = new Date(`${na}T00:00:00`).getTime();
  const db = new Date(`${nb}T00:00:00`).getTime();
  return Math.round((da - db) / 86400000);
};

export const uid = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
};

export const esc = (s: unknown): string => {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
  }[c] || c));
};

let globalMoneyDecimals = 2;

export const setGlobalMoneyDecimals = (decimals: number | undefined | null) => {
  if (typeof decimals === 'number' && !isNaN(decimals)) {
    globalMoneyDecimals = Math.max(0, Math.min(3, Math.round(decimals)));
  } else {
    globalMoneyDecimals = 2;
  }
};

export const getGlobalMoneyDecimals = (): number => globalMoneyDecimals;

export const fmt = (v: number | string | null | undefined, decimals?: number): string => {
  const d =
    decimals !== undefined && decimals !== null && !isNaN(Number(decimals))
      ? Math.max(0, Math.min(3, Math.round(Number(decimals))))
      : globalMoneyDecimals;
  const num = Number(v) || 0;
  const factor = Math.pow(10, d);
  let rounded = Math.round((num + Number.EPSILON) * factor) / factor;
  if (Object.is(rounded, -0) || rounded === 0) rounded = 0;
  return rounded.toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
};

export const fmtDate = (iso: string | null | undefined): string => {
  const s = String(iso ?? '').trim();
  if (!s) return '';
  const m = s.match(NAMED_MONTH_DATE_RE);
  if (m && MONTH_TO_NUM[m[2].toLowerCase()]) {
    const mon = m[2].slice(0, 3).toUpperCase();
    return `${m[1]}.${mon}.${pad2(parseInt(m[3], 10))}`;
  }
  return s.slice(0, 10);
};

export const fmtDateTime = (ts: number | string | Date): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const parseDiscountInput = (
  raw: string | number | null | undefined,
  maxDigits = 7
): { display: string; numeric: number } => {
  if (raw === '' || raw === null || raw === undefined) {
    return { display: '', numeric: 0 };
  }
  const s = String(raw).trim();
  if (!s) return { display: '', numeric: 0 };

  const num = Number(s);
  if (!Number.isFinite(num) || num <= 0) {
    return { display: num < 0 ? '0' : s, numeric: 0 };
  }

  const dotIdx = s.indexOf('.');
  const intRaw = dotIdx >= 0 ? s.slice(0, dotIdx) : s;
  const decRaw = dotIdx >= 0 ? s.slice(dotIdx + 1) : undefined;
  const cleanInt = intRaw.replace(/[^0-9]/g, '');

  if (cleanInt.length > maxDigits) {
    const slicedInt = cleanInt.slice(0, maxDigits);
    const display = decRaw !== undefined ? `${slicedInt}.${decRaw}` : slicedInt;
    const numeric = Number(display);
    return { display, numeric: Number.isFinite(numeric) ? numeric : 0 };
  }

  return { display: s, numeric: num };
};

