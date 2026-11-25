import { pad2 } from './formatters';

export interface GS1ParsedData {
  gtin?: string;
  batch?: string;
  expiry?: string;
  serial?: string;
}

const gs1Date = (s: string): string => {
  const yy = +s.slice(0, 2);
  const mm = +s.slice(2, 4);
  const dd = +s.slice(4, 6);
  if (!(yy >= 0 && mm >= 1 && mm <= 12 && dd >= 0 && dd <= 31)) return '';
  const y = 2000 + yy;
  if (dd === 0) {
    const e = new Date(y, mm, 0).getDate();
    return `${y}-${pad2(mm)}-${pad2(e)}`;
  }
  return `${y}-${pad2(mm)}-${pad2(dd)}`;
};

export const parseGS1 = (raw: string | null | undefined): GS1ParsedData | null => {
  let s = (raw || '').trim();
  if (!s) return null;
  s = s.replace(/^\]C1/, ''); // strip common symbology identifier
  const out: GS1ParsedData = {};
  if (/^\d{13}$/.test(s)) out.gtin = s;
  if (!out.gtin) {
    const m = s.match(/(?:^|[^0-9])01(\d{14})/);
    if (m) out.gtin = m[1];
  }
  if (!out.gtin) return null;
  const GS = '\u001d';
  const rest = s.slice(s.indexOf(out.gtin) + 14).replace(new RegExp(`^${GS}`), '');
  const segs = rest.split(GS);
  let head = segs[0] || '';
  const m17 = head.match(/^17(\d{2})(0[1-9]|1[0-2])([0-3]\d)/);
  if (m17) {
    out.expiry = gs1Date(m17[1] + m17[2] + m17[3]);
    head = head.slice(8);
  }
  let serialTail: string | null = null;
  if (head.indexOf('10') === 0) {
    let b = head.slice(2);
    const m21t = b.match(/21([^\u001d]*)$/);
    if (m21t && m21t[1]) {
      serialTail = m21t[1];
      b = b.slice(0, b.length - m21t[0].length);
    }
    if (b) out.batch = b;
  } else {
    const m10 = head.match(/10([^\u001d]*)/);
    if (m10 && m10[1]) out.batch = m10[1];
    const m21h = head.match(/21([^\u001d]*)/);
    if (m21h && m21h[1]) serialTail = m21h[1];
  }
  const seg21 = segs.slice(1).map((x) => x.match(/^21([^\u001d]*)/)).find(Boolean);
  out.serial = (seg21 && seg21[1]) || serialTail || undefined;
  return out;
};
