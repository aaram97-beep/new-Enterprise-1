import * as XLSX from 'xlsx';
import { todayStr, pad2, fmtDate, toIsoDate } from './formatters';

export const exportCSV = (fname: string, rows: Record<string, any>[]): void => {
  if (!rows || !rows.length) return;
  const keys: string[] = [];
  rows.forEach((r) => {
    Object.keys(r).forEach((k) => {
      if (!keys.includes(k)) keys.push(k);
    });
  });

  const escCell = (v: any) => {
    const s = String(v == null ? '' : v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const csv = [keys.join(',')]
    .concat(rows.map((r) => keys.map((k) => escCell(r[k])).join(',')))
    .join('\n');

  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fname}-${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 5000);
};

export const exportJSON = (fname: string, data: any): void => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${fname}-${todayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 5000);
};

export function parseCSVText(text: string): string[][] {
  const first = text.split(/\r?\n/)[0] || '';
  const delim = first.split(';').length > first.split(',').length ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQ = true;
    } else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    if (row.some((v) => v !== '')) rows.push(row);
  }
  return rows.map((r) => r.map((v) => v.trim()));
}

export const importNum = (v: any): number => {
  const s = String(v == null ? '' : v)
    .trim()
    .replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/[$€£¥]/g, '')
    .replace(/ /g, '.')
    .replace(/,/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export const importBool = (v: any): boolean => {
  return /^(y|yes|1|true|t|نعم)$/i.test(String(v == null ? '' : v).trim());
};

export function importExpiry(v: any): string {
  const s = String(v == null ? '' : v).trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}[.\-/][A-Za-z]{3,9}[.\-/]\d{1,2}$/.test(s) && /^\d{4}-\d{2}-\d{2}$/.test(toIsoDate(s))) {
    return fmtDate(s);
  }
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + parseInt(s, 10) * 86400000);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    return `${y}-${pad2(parseInt(m[2], 10))}-${pad2(parseInt(m[1], 10))}`;
  }
  return s;
}

export async function parseFileForImport(
  file: File
): Promise<{ headers: string[]; rows: string[][] }> {
  if (/\.(xlsx|xls)$/i.test(file.name)) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const arr = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' });
    const headers = (arr[0] || []).map((h) => String(h || '').trim()).filter(Boolean);
    const rows = arr.slice(1).map((r) => (r || []).map((v) => String(v || '').trim()));
    return { headers, rows };
  } else {
    const text = await file.text();
    const parsed = parseCSVText(text);
    const headers = (parsed[0] || []).map((h) => String(h || '').trim()).filter(Boolean);
    const rows = parsed.slice(1);
    return { headers, rows };
  }
}
