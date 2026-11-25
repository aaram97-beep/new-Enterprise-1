import type { DatabaseSchema, Invoice } from '../types';
import { defaultAllFeatures } from './constants';
import { addDays, todayStr, r2, uid } from '../utils/formatters';
import { simulateStock } from '../utils/stockSimulation';

export function emptyData(): DatabaseSchema {
  return {
    settings: {
      companyName: 'My Company',
      address: '',
      phone: '',
      currency: '$',
      taxRate: 0,
      expiryWarnDays: 30,
      logo: '',
      lang: 'en',
      features: defaultAllFeatures(),
      trackBatchExpiry: true,
      lotExpiryMode: 'both',
      showInOtherBranchStatus: true,
      moneyDecimals: 2,
      isBranchCompany: false,
    },
    branches: [{ id: 'b1', code: 'BR1', name: 'Main Warehouse', address: '', isMain: true }],
    users: [
      {
        id: 'u1',
        name: 'Administrator',
        username: 'admin',
        pass: 'admin',
        role: 'admin',
        branchIds: ['b1'],
        active: true,
        perms: {},
      },
    ],
    customers: [],
    items: [],
    invoices: [],
    deliveries: [],
    returnSlips: [],
    returnInvoices: [],
    intakes: [],
    arrivals: [],
    payments: [],
    checks: [],
    transfers: [],
    disposals: [],
    barters: [],
    adjusts: [],
    accounts: [
      { id: 'acc-b1-cash', name: 'Main Warehouse   Cashbox', type: 'cashbox', branchId: 'b1', opening: 0, note: '' },
      { id: 'acc-cheq', name: 'Cheques in Hand', type: 'cheques', branchId: null, opening: 0, note: '' },
    ],
    moneyMoves: [],
    expenses: [],
    stocks: [],
    audit: [{ id: uid(), ts: Date.now(), user: 'Administrator', action: 'System initialized', details: 'Fresh database' }],
    counters: {
      b1: { INV: 1000, DEL: 1000, RSL: 1000, RIN: 1000, INT: 1000, ARR: 1000, TRF: 1000, DSP: 1000, CHK: 1000, BRT: 1000, PAY: 1000, MTR: 1000, EXP: 1000 },
    },
  };
}

export function seedData(): DatabaseSchema {
  const d = (n: number) => addDays(todayStr(), n);
  const db: DatabaseSchema = {
    settings: {
      companyName: 'A97 Trading Co.',
      address: 'Main Street, Baghdad, Iraq',
      phone: '+964 771 000 0000',
      currency: '$',
      taxRate: 0,
      expiryWarnDays: 30,
      logo: '',
      lang: 'en',
      features: defaultAllFeatures(),
      trackBatchExpiry: true,
      lotExpiryMode: 'both',
      showInOtherBranchStatus: true,
      moneyDecimals: 2,
      isBranchCompany: false,
    },
    branches: [
      { id: 'b1', code: 'BR1', name: 'Main Warehouse', address: 'Baghdad HQ', isMain: true },
      { id: 'b2', code: 'BR2', name: 'North Branch', address: 'Erbil', isMain: false },
      { id: 'b3', code: 'BR3', name: 'Port Depot', address: 'Basra port', isMain: false },
    ],
    users: [
      {
        id: 'u1',
        name: 'Administrator',
        username: 'admin',
        pass: 'admin',
        role: 'admin',
        branchIds: ['b1', 'b2', 'b3'],
        active: true,
        perms: {},
      },
      {
        id: 'u2',
        name: 'Sara (North)',
        username: 'sara',
        pass: '1234',
        role: 'user',
        branchIds: ['b2'],
        active: true,
        perms: {
          sales: true,
          purchasing: false,
          barter: false,
          checks: false,
          inventory: true,
          transfers: false,
          disposals: false,
          customers: false,
          ledger: true,
          reports: false,
          data: false,
          settings: false,
        },
      },
    ],
    customers: [
      { id: 'c1', name: 'Baghdad Mart', phone: '0770 123 4567', address: 'Karrada St 12, Baghdad', openingBalance: 0, isProvider: false },
      { id: 'c2', name: 'Karrada Superstore', phone: '0770 222 3344', address: 'Karrada, Baghdad', openingBalance: 0, isProvider: false },
      { id: 'c3', name: 'Zaho Trading', phone: '0771 345 6789', address: 'Ainkawa, Erbil', openingBalance: 175, isProvider: false },
      { id: 'c4', name: 'Duhok Market', phone: '0772 456 7890', address: 'City Center, Duhok', openingBalance: 0, isProvider: false },
      { id: 'c5', name: 'Al-Mansur Mall', phone: '0773 567 8901', address: 'Mansur, Baghdad', openingBalance: 0, isProvider: false },
      { id: 'c6', name: 'Hilla Wholesale', phone: '0774 678 9012', address: 'Hilla, Babil', openingBalance: 0, isProvider: false },
      { id: 'c7', name: 'Kirkuk Supplies', phone: '0775 789 0123', address: 'Kirkuk', openingBalance: 0, isProvider: false },
      { id: 'c8', name: 'Basra Traders', phone: '0776 890 1234', address: 'Ashar, Basra', openingBalance: 0, isProvider: false },
      { id: 'c9', name: 'Sulaymaniyah Stores', phone: '0777 901 2345', address: 'Sulaymaniyah', openingBalance: 0, isProvider: false },
      { id: 'c10', name: 'Ramadi Retail', phone: '0778 012 3456', address: 'Ramadi', openingBalance: 0, isProvider: false },
      { id: 'c11', name: 'Mosul Market', phone: '0779 123 4560', address: 'Mosul', openingBalance: 0, isProvider: false },
      { id: 'c12', name: 'Najaf Goods', phone: '0770 234 5671', address: 'Najaf', openingBalance: 0, isProvider: false },
      { id: 'c13', name: 'Karbala Corner Shop', phone: '0771 345 6782', address: 'Karbala', openingBalance: 0, isProvider: false },
      { id: 'c14', name: 'Taji Depot', phone: '0772 456 7893', address: 'Taji', openingBalance: 0, isProvider: false },
      { id: 'c15', name: 'Fallujah Foods', phone: '0773 567 8904', address: 'Fallujah', openingBalance: 0, isProvider: false },
      { id: 'c16', name: 'Al-Nour Foods', phone: '0774 678 9015', address: 'Al-Sadoun St, Baghdad', openingBalance: 0, isProvider: true },
      { id: 'c17', name: 'Erbil Logistics', phone: '0775 789 0126', address: 'Industrial Zone, Erbil', openingBalance: 0, isProvider: true },
      { id: 'c18', name: 'GrainCo Iraq', phone: '0776 890 1237', address: 'Baghdad', openingBalance: 0, isProvider: true },
      { id: 'c19', name: 'FoodsCo Import', phone: '0777 901 2348', address: 'Baghdad', openingBalance: 0, isProvider: true },
      { id: 'c20', name: 'Aqua Beverages', phone: '0778 012 3459', address: 'Basra', openingBalance: 0, isProvider: true },
      { id: 'c21', name: 'CleanCo Supplies', phone: '0779 123 4561', address: 'Baghdad', openingBalance: 0, isProvider: true },
      { id: 'c22', name: 'Electro Trading', phone: '0770 234 5672', address: 'Baghdad', openingBalance: 0, isProvider: true },
      { id: 'c23', name: 'OfficePro Iraq', phone: '0771 345 6783', address: 'Baghdad', openingBalance: 0, isProvider: true },
      { id: 'c24', name: 'SweetCo Snacks', phone: '0772 456 7894', address: 'Erbil', openingBalance: 0, isProvider: true },
    ],
    items: [
      { id: 'i1', sku: 'RICE-5K', name: 'Basmati Rice 5kg', company: 'GrainCo', group: 'Rice', cost: 8, price: 12, reorder: 50, barcode: '6210000000012', note: 'Premium long grain', batch: true },
      { id: 'i2', sku: 'OIL-1L', name: 'Sunflower Oil 1L', company: 'GoldenPress', group: 'Oils', cost: 2.1, price: 3.2, reorder: 100, barcode: '6210000000029', note: '', batch: true },
      { id: 'i3', sku: 'PAS-800', name: 'Tomato Paste 800g', company: 'FoodsCo', group: 'Canned', cost: 1.2, price: 2, reorder: 80, barcode: '6210000000036', note: '', batch: true },
      { id: 'i4', sku: 'WAT-500', name: 'Mineral Water 500ml', company: 'Aqua', group: 'Drinks', cost: 0.15, price: 0.35, reorder: 500, barcode: '6210000000043', note: '', batch: true },
      { id: 'i5', sku: 'SOAP-750', name: 'Dish Soap 750ml', company: 'CleanCo', group: 'Cleaning', cost: 0.8, price: 1.5, reorder: 60, barcode: '6210000000050', note: '', batch: false },
      { id: 'i6', sku: 'BULB-9W', name: 'LED Bulb 9W', company: 'Electro', group: 'Electronics', cost: 1.1, price: 2.5, reorder: 40, barcode: '6210000000067', note: '', batch: false },
      { id: 'i7', sku: 'TUN-185', name: 'Canned Tuna 185g', company: 'FoodsCo', group: 'Canned', cost: 1.4, price: 2.6, reorder: 70, barcode: '6210000000074', note: '', batch: true },
      { id: 'i8', sku: 'PPR-A4', name: 'Printer Paper A4', company: 'OfficePro', group: 'Office', cost: 3, price: 4.75, reorder: 30, barcode: '6210000000081', note: '80gsm', batch: false },
      { id: 'i9', sku: 'TEA-450', name: 'Black Tea 450g', company: 'FoodsCo', group: 'Tea', cost: 1.6, price: 2.9, reorder: 60, barcode: '6210000000090', note: '', batch: true },
      { id: 'i10', sku: 'SUG-1K', name: 'White Sugar 1kg', company: 'GrainCo', group: 'Sugar', cost: 0.9, price: 1.6, reorder: 100, barcode: '6210000000106', note: '', batch: true },
      { id: 'i11', sku: 'FLR-2K', name: 'Wheat Flour 2kg', company: 'GrainCo', group: 'Flour', cost: 1.5, price: 2.4, reorder: 80, barcode: '6210000000113', note: '', batch: true },
      { id: 'i12', sku: 'BIS-400', name: 'Biscuits 400g', company: 'SweetCo', group: 'Snacks', cost: 0.7, price: 1.3, reorder: 90, barcode: '6210000000120', note: '', batch: true },
    ],
    accounts: [
      { id: 'acc-b1-cash', name: 'Main Warehouse   Cashbox', type: 'cashbox', branchId: 'b1', opening: 500, note: '' },
      { id: 'acc-b2-cash', name: 'North Branch   Cashbox', type: 'cashbox', branchId: 'b2', opening: 300, note: '' },
      { id: 'acc-b3-cash', name: 'Port Depot   Cashbox', type: 'cashbox', branchId: 'b3', opening: 200, note: '' },
      { id: 'acc-bank-main', name: 'Main Bank Account', type: 'bank', branchId: null, opening: 5000, note: 'Company bank account' },
      { id: 'acc-bank-north', name: 'North Bank', type: 'bank', branchId: 'b2', opening: 1500, note: '' },
      { id: 'acc-cheq', name: 'Cheques in Hand', type: 'cheques', branchId: null, opening: 0, note: 'Received checks' },
    ],
    invoices: [],
    deliveries: [],
    returnSlips: [],
    returnInvoices: [],
    intakes: [],
    arrivals: [],
    payments: [],
    checks: [],
    transfers: [],
    disposals: [],
    barters: [],
    adjusts: [],
    moneyMoves: [],
    expenses: [],
    stocks: [],
    counters: {},
    audit: [
      { id: uid(), ts: Date.now() - 180 * 86400000, user: 'Administrator', action: 'System initialized', details: 'Demo data loaded' },
      { id: uid(), ts: Date.now() - 170 * 86400000, user: 'Administrator', action: 'Opening stock', details: 'All branches counted in' },
      { id: uid(), ts: Date.now() - 90 * 86400000, user: 'Sara (North)', action: 'Login', details: 'sara' },
      { id: uid(), ts: Date.now() - 30 * 86400000, user: 'Administrator', action: 'Login', details: 'admin' },
      { id: uid(), ts: Date.now() - 2 * 86400000, user: 'Sara (North)', action: 'Delivery', details: 'North Branch deliveries logged' },
    ],
  };

  const BR: Record<string, string> = { b1: 'BR1', b2: 'BR2', b3: 'BR3' };
  const no = (bid: string, k: string) => {
    if (!db.counters[bid]) db.counters[bid] = {};
    const c = db.counters[bid];
    const n = (c[k] || 1000) + 1;
    c[k] = n;
    return `${k}-${BR[bid] || 'BR'}-${n}`;
  };

  const it = (id: string) => db.items.find((x) => x.id === id)!;
  const lnet = (l: { qty: number; price: number; discType: 'pct' | 'amt'; discVal: number }) => {
    const g = r2(l.qty * l.price);
    let dd = l.discType === 'pct' ? r2((g * l.discVal) / 100) : r2(l.discVal);
    dd = Math.max(0, Math.min(dd, g));
    return r2(g - dd);
  };

  const mkInv = (id: string, off: number, cust: string, br: string, lines: [string, number, number, number?][], ordDisc?: number) => {
    const ls = lines.map((x) => ({
      itemId: x[0],
      qty: r2(x[1]),
      price: r2(x[2]),
      discType: 'pct' as const,
      discVal: r2(x[3] || 0),
    }));
    const sub = r2(ls.reduce((a, l) => a + lnet(l), 0));
    const discAmt = r2(Math.max(0, Math.min(ordDisc ? (sub * ordDisc) / 100 : 0, sub)));
    const rec = {
      id,
      no: no(br, 'INV'),
      date: d(off),
      customerId: cust,
      branchId: br,
      note: '',
      orderDiscType: 'pct' as const,
      orderDiscVal: r2(ordDisc || 0),
      sub,
      discAmt,
      tax: 0,
      total: r2(sub - discAmt),
      lines: ls,
    };
    db.invoices.push(rec);
    return rec;
  };

  const mkDel = (inv: Invoice, off: number, part?: [string, number][]) => {
    const qtyOf = (l: { itemId: string | null; qty: number }) =>
      part ? r2((part.find((p) => p[0] === l.itemId) || [0, 0])[1]) : l.qty;
    const dls = inv.lines
      .filter((l) => l.itemId && qtyOf(l) > 0)
      .map((l) => {
        const x = it(l.itemId!);
        return {
          itemId: l.itemId!,
          qty: qtyOf(l),
          batchNo: x.batch ? 'OPEN-1' : '',
          expiry: x.batch ? d(240) : '',
          cost: r2(x.cost),
        };
      });
    const rec = {
      id: `dl${db.deliveries.length + 1}`,
      no: no(inv.branchId, 'DEL'),
      date: d(off),
      invoiceId: inv.id,
      customerId: inv.customerId,
      branchId: inv.branchId,
      lines: dls,
    };
    db.deliveries.push(rec);
    return rec;
  };

  const mkIntake = (id: string, off: number, prov: string, br: string, lines: [string, number, number][], note?: string) => {
    const ls = lines.map((x) => ({ itemId: x[0], qty: r2(x[1]), cost: r2(x[2]) }));
    const rec = {
      id,
      no: no(br, 'INT'),
      date: d(off),
      providerId: prov,
      branchId: br,
      note: note || '',
      total: r2(ls.reduce((a, l) => a + r2(l.qty * l.cost), 0)),
      lines: ls,
    };
    db.intakes.push(rec);
    return rec;
  };

  const mkArr = (
    intake: ReturnType<typeof mkIntake>,
    off: number,
    blines: [string, number, number, (string | null | undefined)?, (number | null | undefined)?][]
  ) => {
    const rec = {
      id: `a${db.arrivals.length + 1}`,
      no: no(intake.branchId, 'ARR'),
      date: d(off),
      intakeId: intake.id,
      branchId: intake.branchId,
      note: '',
      lines: blines.map((x) => ({
        itemId: x[0],
        qty: r2(x[1]),
        cost: r2(x[2]),
        batchNo: x[3] || '',
        expiry: x[4] != null ? d(x[4]) : '',
      })),
    };
    db.arrivals.push(rec);
    return rec;
  };

  const mkAdj = (id: string, off: number, br: string, itemId: string, qty: number, batchNo?: string, expOff?: number | null, reason = '') => {
    db.adjusts.push({
      id,
      date: d(off),
      branchId: br,
      itemId,
      batchNo: batchNo || '',
      expiry: expOff != null ? d(expOff) : '',
      qty: r2(qty),
      cost: r2(it(itemId).cost),
      reason,
      user: 'Administrator',
    });
  };

  const intakeTot = (p: { lines: { qty: number; cost: number }[] }) =>
    r2(p.lines.reduce((a, l) => a + r2(l.qty * l.cost), 0));

  const paidToDoc = (docId: string, tp: 'invoice' | 'intake') =>
    r2(
      db.payments.reduce(
        (a, p) =>
          a +
          (p.allocs || [])
            .filter((x) => x.type === tp && x.docId === docId)
            .reduce((y, x) => y + (+x.amount || 0), 0),
        0
      )
    );

  const mkPay = (
    off: number,
    cid: string,
    amount: number,
    disc: number,
    dir: 'in' | 'out',
    acct: string,
    method = 'cash',
    note = ''
  ) => {
    const isOut = dir === 'out';
    const docs = (isOut ? db.intakes.filter((p) => p.providerId === cid) : db.invoices.filter((v) => v.customerId === cid))
      .filter((x) => x.date <= d(off))
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const allocs: { type: 'invoice' | 'intake'; docId: string; amount: number }[] = [];
    const bal = (x: { id: string; total?: number; lines?: any[] }) => {
      const tp = isOut ? 'intake' : 'invoice';
      const paid = r2(
        paidToDoc(x.id, tp) +
          allocs.filter((a2) => a2.docId === x.id).reduce((y, a2) => y + a2.amount, 0)
      );
      return isOut ? r2(intakeTot(x as any) - paid) : r2((x.total || 0) - paid);
    };

    const walk = (qv: { v: number }) => {
      docs.forEach((x) => {
        if (qv.v <= 0.0049) return;
        const b = bal(x);
        const t = r2(Math.min(b, qv.v));
        if (t > 0.0049) {
          allocs.push({ type: isOut ? 'intake' : 'invoice', docId: x.id, amount: t });
          qv.v = r2(qv.v - t);
        }
      });
    };

    const q1 = { v: r2(amount) };
    walk(q1);
    const q2 = { v: r2(disc || 0) };
    walk(q2);

    const acctRec = db.accounts.find((a) => a.id === acct) || { branchId: 'b1' };
    const bid = acctRec.branchId || 'b1';

    db.payments.push({
      id: `py${db.payments.length + 1}`,
      no: no(bid, 'PAY'),
      date: d(off),
      customerId: cid,
      amount: r2(amount),
      disc: r2(disc || 0),
      method,
      note,
      dir,
      branchId: bid,
      accountId: acct,
      allocs,
    });
  };

  // ---- opening stock + adjustments ----
  mkAdj('aj1', -180, 'b1', 'i1', 300, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj2', -180, 'b1', 'i2', 400, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj3', -180, 'b1', 'i3', 300, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj4', -180, 'b1', 'i4', 1000, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj5', -180, 'b1', 'i5', 200, '', null, 'Opening stock');
  mkAdj('aj6', -180, 'b1', 'i6', 200, '', null, 'Opening stock');
  mkAdj('aj7', -180, 'b1', 'i7', 250, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj8', -180, 'b1', 'i8', 20, '', null, 'Opening stock');
  mkAdj('aj9', -180, 'b1', 'i9', 200, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj10', -180, 'b1', 'i10', 400, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj11', -180, 'b1', 'i11', 300, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj12', -180, 'b1', 'i12', 300, 'OPEN-1', 240, 'Opening stock');

  mkAdj('aj13', -180, 'b2', 'i1', 100, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj14', -180, 'b2', 'i2', 150, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj15', -180, 'b2', 'i3', 120, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj16', -180, 'b2', 'i6', 100, '', null, 'Opening stock');
  mkAdj('aj17', -180, 'b2', 'i7', 100, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj18', -180, 'b2', 'i10', 150, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj19', -180, 'b2', 'i12', 120, 'OPEN-1', 240, 'Opening stock');

  mkAdj('aj20', -180, 'b3', 'i1', 50, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj21', -180, 'b3', 'i4', 500, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj22', -180, 'b3', 'i7', 100, 'OPEN-1', 240, 'Opening stock');
  mkAdj('aj23', -25, 'b3', 'i4', 50, 'W-2401', 120, 'Count correction');
  mkAdj('aj24', -15, 'b1', 'i8', -2, '', null, 'Damaged in storage');

  // ---- intakes + arrivals ----
  let p: ReturnType<typeof mkIntake>;
  p = mkIntake('p1', -170, 'c16', 'b1', [['i1', 200, 8], ['i2', 250, 2.1], ['i3', 150, 1.2]], 'Monthly supply');
  mkArr(p, -168, [['i1', 200, 8, 'R-2401', 210], ['i2', 250, 2.1, 'O-2401', 150], ['i3', 150, 1.2, 'P-2401', 120]]);

  p = mkIntake('p2', -165, 'c18', 'b1', [['i10', 300, 0.9], ['i11', 200, 1.5]]);
  mkArr(p, -163, [['i10', 300, 0.9, 'SG-2401', 200], ['i11', 200, 1.5, 'FL-2401', 180]]);

  p = mkIntake('p3', -160, 'c17', 'b2', [['i3', 100, 1.2], ['i2', 100, 2.1]]);
  mkArr(p, -157, [['i3', 100, 1.2, 'P-2402', 100], ['i2', 100, 2.1, 'O-2402', 60]]);

  p = mkIntake('p4', -155, 'c20', 'b3', [['i4', 800, 0.15]]);
  mkArr(p, -152, [['i4', 800, 0.15, 'W-2401', 120]]);

  p = mkIntake('p5', -150, 'c19', 'b1', [['i7', 150, 1.4], ['i9', 150, 1.6]]);
  mkArr(p, -148, [['i7', 150, 1.4, 'T-2401', 90], ['i9', 150, 1.6, 'TE-2401', 75]]);

  p = mkIntake('p6', -145, 'c21', 'b1', [['i5', 120, 0.8], ['i6', 100, 1.1]]);
  mkArr(p, -143, [['i5', 120, 0.8, '', null], ['i6', 100, 1.1, '', null]]);

  p = mkIntake('p7', -140, 'c23', 'b1', [['i8', 20, 3]]);
  mkArr(p, -138, [['i8', 20, 3, '', null]]);

  p = mkIntake('p8', -135, 'c24', 'b2', [['i12', 150, 0.7]]);
  mkArr(p, -132, [['i12', 150, 0.7, 'BI-2401', 45]]);

  p = mkIntake('p9', -120, 'c16', 'b1', [['i1', 150, 8], ['i2', 150, 2.1]]);
  mkArr(p, -118, [['i1', 150, 8, 'R-2402', 150], ['i2', 150, 2.1, 'O-2403', 40]]);

  p = mkIntake('p10', -110, 'c18', 'b2', [['i10', 200, 0.9], ['i1', 80, 8]]);
  mkArr(p, -108, [['i10', 200, 0.9, 'SG-2402', 90], ['i1', 80, 8, 'R-2403', 120]]);

  p = mkIntake('p11', -100, 'c20', 'b1', [['i4', 600, 0.15]]);
  mkArr(p, -98, [['i4', 600, 0.15, 'W-2402', 60]]);

  p = mkIntake('p12', -95, 'c19', 'b3', [['i7', 120, 1.4], ['i9', 80, 1.6]]);
  mkArr(p, -92, [['i7', 120, 1.4, 'T-2402', 30], ['i9', 80, 1.6, 'TE-2402', 20]]);

  p = mkIntake('p13', -85, 'c22', 'b1', [['i6', 80, 1.1], ['i2', 100, 2.1]]);
  mkArr(p, -83, [['i6', 80, 1.1, '', null], ['i2', 100, 2.1, 'O-2404', -10]]);

  p = mkIntake('p14', -75, 'c17', 'b2', [['i3', 80, 1.2], ['i7', 60, 1.4]]);
  mkArr(p, -72, [['i3', 80, 1.2, 'P-2403', -8], ['i7', 60, 1.4, 'T-2403', 15]]);

  p = mkIntake('p15', -70, 'c21', 'b1', [['i5', 50, 0.8]]);
  mkArr(p, -68, [['i5', 50, 0.8, '', null]]);

  p = mkIntake('p16', -45, 'c22', 'b1', [['i6', 30, 1.1]]);
  mkArr(p, -43, [['i6', 30, 1.1, '', null]]);

  p = mkIntake('p17', -30, 'c16', 'b1', [['i1', 100, 8], ['i11', 100, 1.5]]);
  mkArr(p, -28, [['i1', 100, 8, 'R-2404', 30], ['i11', 100, 1.5, 'FL-2402', 150]]);

  p = mkIntake('p18', -12, 'c18', 'b1', [['i10', 200, 0.9], ['i12', 150, 0.7]]);
  mkArr(p, -10, [['i10', 200, 0.9, 'SG-2403', 170], ['i12', 150, 0.7, 'BI-2402', 90]]);

  mkIntake('p19', -6, 'c19', 'b1', [['i9', 120, 1.6], ['i7', 100, 1.4]], 'On the way');
  mkIntake('p20', -4, 'c24', 'b2', [['i12', 100, 0.7]], 'On the way');
  mkIntake('p21', -2, 'c16', 'b1', [['i2', 120, 2.1]], 'On the way');

  // ---- invoices ----
  mkInv('v1', -150, 'c1', 'b1', [['i1', 20, 12], ['i2', 20, 3.2]]);
  mkInv('v2', -140, 'c5', 'b1', [['i3', 40, 2], ['i7', 30, 2.6]]);
  mkInv('v3', -135, 'c6', 'b1', [['i10', 50, 1.6], ['i11', 30, 2.4]]);
  mkInv('v4', -80, 'c10', 'b1', [['i1', 15, 12], ['i9', 20, 2.9]]);
  mkInv('v5', -75, 'c2', 'b1', [['i2', 40, 3.2, 5], ['i12', 30, 1.3]]);
  mkInv('v6', -70, 'c12', 'b1', [['i4', 100, 0.35], ['i5', 20, 1.5]]);
  mkInv('v7', -55, 'c13', 'b1', [['i8', 10, 4.75], ['i6', 8, 2.5]]);
  mkInv('v8', -50, 'c1', 'b1', [['i1', 10, 12], ['i3', 20, 2]]);
  mkInv('v9', -45, 'c5', 'b1', [['i11', 25, 2.4], ['i10', 20, 1.6]]);
  mkInv('v10', -42, 'c4', 'b2', [['i7', 15, 2.6], ['i3', 20, 2]]);
  mkInv('v11', -40, 'c15', 'b1', [['i5', 30, 1.5], ['i2', 25, 3.2]]);
  mkInv('v12', -38, 'c7', 'b2', [['i1', 12, 12], ['i10', 30, 1.6]]);
  mkInv('v13', -36, 'c9', 'b2', [['i10', 15, 1.6], ['i12', 20, 1.3]]);
  mkInv('v14', -34, 'c14', 'b2', [['i6', 10, 2.5], ['i12', 15, 1.3]]);
  mkInv('v15', -32, 'c11', 'b2', [['i2', 20, 3.2]]);
  mkInv('v16', -30, 'c1', 'b1', [['i7', 25, 2.6], ['i4', 50, 0.35]]);
  mkInv('v17', -26, 'c6', 'b1', [['i12', 40, 1.3], ['i9', 10, 2.9]]);
  mkInv('v18', -24, 'c10', 'b1', [['i11', 20, 2.4]]);
  mkInv('v19', -22, 'c13', 'b1', [['i2', 15, 3.2], ['i8', 5, 4.75]]);
  mkInv('v20', -20, 'c15', 'b1', [['i1', 10, 12]]);
  mkInv('v21', -18, 'c2', 'b1', [['i1', 8, 12], ['i5', 15, 1.5]], 2);
  mkInv('v22', -18, 'c3', 'b2', [['i10', 40, 1.6], ['i3', 15, 2]]);
  mkInv('v23', -16, 'c5', 'b1', [['i6', 12, 2.5, 10], ['i7', 18, 2.6]]);
  mkInv('v24', -14, 'c12', 'b1', [['i3', 30, 2], ['i4', 80, 0.35]]);
  mkInv('v25', -12, 'c8', 'b1', [['i1', 14, 12]]);
  mkInv('v26', -10, 'c1', 'b1', [['i11', 15, 2.4], ['i10', 25, 1.6, 5]]);
  mkInv('v27', -9, 'c4', 'b2', [['i12', 30, 1.3], ['i2', 18, 3.2]]);
  mkInv('v28', -8, 'c2', 'b1', [['i9', 12, 2.9], ['i7', 10, 2.6]]);
  mkInv('v29', -7, 'c9', 'b2', [['i1', 9, 12]]);
  mkInv('v30', -6, 'c6', 'b1', [['i5', 25, 1.5], ['i8', 6, 4.75]]);
  mkInv('v31', -5, 'c14', 'b2', [['i3', 15, 2], ['i6', 6, 2.5]]);
  mkInv('v32', -4, 'c11', 'b2', [['i10', 20, 1.6]]);
  mkInv('v33', -3, 'c15', 'b1', [['i2', 30, 3.2], ['i12', 25, 1.3]]);
  mkInv('v34', -3, 'c10', 'b1', [['i4', 60, 0.35], ['i5', 10, 1.5, 10]]);
  mkInv('v35', -2, 'c13', 'b1', [['i1', 6, 12]]);
  mkInv('v36', -2, 'c1', 'b1', [['i7', 12, 2.6]]);
  mkInv('v37', -2, 'c5', 'b1', [['i9', 8, 2.9]]);
  mkInv('v38', -1, 'c2', 'b1', [['i11', 10, 2.4]]);
  mkInv('v39', -14, 'c3', 'b2', [['i7', 8, 2.6], ['i3', 10, 2]]);
  mkInv('v40', -1, 'c8', 'b1', [['i6', 5, 2.5], ['i8', 4, 4.75]]);

  // ---- deliveries ----
  mkDel(db.invoices[0], -148);
  mkDel(db.invoices[1], -138);
  mkDel(db.invoices[3], -78);
  mkDel(db.invoices[4], -73);
  mkDel(db.invoices[5], -69);
  mkDel(db.invoices[6], -54);
  mkDel(db.invoices[7], -49);
  mkDel(db.invoices[9], -41);
  mkDel(db.invoices[10], -39);
  mkDel(db.invoices[11], -37);
  mkDel(db.invoices[12], -35);
  mkDel(db.invoices[13], -33);
  mkDel(db.invoices[14], -31);
  mkDel(db.invoices[15], -29);
  mkDel(db.invoices[16], -25);
  mkDel(db.invoices[17], -23);
  mkDel(db.invoices[19], -19, [['i1', 6]]);
  mkDel(db.invoices[20], -17);
  mkDel(db.invoices[21], -17);
  mkDel(db.invoices[22], -15);
  mkDel(db.invoices[23], -13);
  mkDel(db.invoices[24], -11);
  mkDel(db.invoices[25], -9);
  mkDel(db.invoices[26], -8);
  mkDel(db.invoices[27], -7);
  mkDel(db.invoices[28], -6);
  mkDel(db.invoices[29], -5);
  mkDel(db.invoices[30], -4);
  mkDel(db.invoices[31], -3);
  mkDel(db.invoices[33], -2);
  mkDel(db.invoices[34], -1);
  mkDel(db.invoices[36], -1);
  mkDel(db.invoices[38], -14, [['i7', 2], ['i3', 2]]);
  mkDel(db.invoices[38], -9, [['i7', 3], ['i3', 3]]);
  mkDel(db.invoices[38], 0, [['i7', 2], ['i3', 2]]);

  // ---- returns & credit notes ----
  db.returnSlips.push(
    { id: 'rs1', no: no('b1', 'RSL'), date: d(-30), customerId: 'c1', branchId: 'b1', note: 'Broken seal on bottles', returnInvoiceId: 'ri1', lines: [{ itemId: 'i2', qty: 5, batchNo: 'OPEN-1', expiry: d(240) }] },
    { id: 'rs2', no: no('b1', 'RSL'), date: d(-25), customerId: 'c4', branchId: 'b2', note: 'Wrong flavour sent', returnInvoiceId: null, lines: [{ itemId: 'i7', qty: 3, batchNo: 'OPEN-1', expiry: d(240) }] },
    { id: 'rs3', no: no('b1', 'RSL'), date: d(-18), customerId: 'c2', branchId: 'b1', note: 'Dented tins', returnInvoiceId: 'ri2', lines: [{ itemId: 'i1', qty: 2, batchNo: 'OPEN-1', expiry: d(240) }] },
    { id: 'rs4', no: no('b1', 'RSL'), date: d(-12), customerId: 'c10', branchId: 'b1', note: 'Customer changed order', returnInvoiceId: null, lines: [{ itemId: 'i9', qty: 1, batchNo: 'OPEN-1', expiry: d(240) }] }
  );

  db.returnInvoices.push(
    { id: 'ri1', no: no('b1', 'RIN'), date: d(-30), customerId: 'c1', branchId: 'b1', returnSlipId: 'rs1', total: 16, lines: [{ itemId: 'i2', qty: 5, price: 3.2 }] },
    { id: 'ri2', no: no('b1', 'RIN'), date: d(-17), customerId: 'c2', branchId: 'b1', returnSlipId: 'rs3', total: 24, lines: [{ itemId: 'i1', qty: 2, price: 12 }] }
  );

  // ---- payments ----
  mkPay(-150, 'c16', 1200, 0, 'out', 'acc-bank-main', 'bank', 'Bank transfer');
  mkPay(-140, 'c1', 200, 0, 'in', 'acc-b1-cash');
  mkPay(-125, 'c18', 570, 0, 'out', 'acc-b1-cash');
  mkPay(-120, 'c19', 450, 0, 'out', 'acc-bank-main', 'bank');
  mkPay(-120, 'c5', 158, 0, 'in', 'acc-b1-cash');
  mkPay(-115, 'c17', 330, 0, 'out', 'acc-b2-cash');
  mkPay(-100, 'c24', 105, 0, 'out', 'acc-b2-cash');
  mkPay(-100, 'c1', 104, 10, 'in', 'acc-b1-cash', 'cash', 'Settlement');
  mkPay(-90, 'c16', 800, 0, 'out', 'acc-bank-main', 'bank');
  mkPay(-80, 'c6', 100, 0, 'in', 'acc-b1-cash');
  mkPay(-70, 'c18', 820, 0, 'out', 'acc-b1-cash');
  mkPay(-70, 'c2', 100, 0, 'in', 'acc-b1-cash');
  mkPay(-60, 'c16', 305, 15, 'out', 'acc-b1-cash', 'cash', 'Settlement');
  mkPay(-60, 'c20', 150, 0, 'out', 'acc-b1-cash');
  mkPay(-60, 'c22', 298, 0, 'out', 'acc-b1-cash');
  mkPay(-55, 'c16', 1500, 0, 'out', 'acc-bank-main', 'bank');
  mkPay(-50, 'c19', 296, 0, 'out', 'acc-bank-main', 'bank');
  mkPay(-50, 'c21', 206, 0, 'out', 'acc-b1-cash');
  mkPay(-45, 'c10', 150, 0, 'in', 'acc-b1-cash');
  mkPay(-40, 'c17', 100, 0, 'out', 'acc-b2-cash');
  mkPay(-40, 'c1', 160, 0, 'in', 'acc-b1-cash');
  mkPay(-35, 'c4', 79, 0, 'in', 'acc-b2-cash');
  mkPay(-35, 'c7', 192, 0, 'in', 'acc-b2-cash');
  mkPay(-30, 'c12', 65, 0, 'in', 'acc-b1-cash');
  mkPay(-25, 'c9', 50, 0, 'in', 'acc-b2-cash');
  mkPay(-20, 'c13', 67.5, 0, 'in', 'acc-b1-cash');
  mkPay(-15, 'c14', 44.5, 0, 'in', 'acc-b2-cash');
  mkPay(-10, 'c18', 150, 0, 'out', 'acc-b1-cash');
  mkPay(-10, 'c1', 76, 0, 'in', 'acc-b1-cash');
  mkPay(-8, 'c5', 92, 4, 'in', 'acc-b1-cash', 'cash', 'Settlement');
  mkPay(-5, 'c8', 168, 0, 'in', 'acc-b1-cash');
  mkPay(-5, 'c11', 64, 0, 'in', 'acc-b2-cash');
  mkPay(-3, 'c15', 100, 0, 'in', 'acc-b1-cash');
  mkPay(-1, 'c3', 134.8, 0, 'in', 'acc-b2-cash');

  // ---- checks ----
  db.checks.push(
    { id: 'ck1', no: no('b1', 'CHK'), customerId: 'c1', checkNo: '884512', bank: 'Rafidain Bank', amount: 5000, status: 'received', receivedDate: d(-60), dueDate: d(30), payouts: [{ id: uid(), date: d(-55), amount: 1500, note: '', accountId: 'acc-b1-cash' }], clearedAccountId: '', clearedDate: '' },
    { id: 'ck2', no: no('b1', 'CHK'), customerId: 'c5', checkNo: '991234', bank: 'Rasheed Bank', amount: 1500, status: 'deposited', receivedDate: d(-45), dueDate: d(-10), payouts: [{ id: uid(), date: d(-40), amount: 600, note: '', accountId: 'acc-b1-cash' }], clearedAccountId: 'acc-bank-main', clearedDate: d(-12) },
    { id: 'ck3', no: no('b1', 'CHK'), customerId: 'c4', checkNo: '774001', bank: 'Trade Bank of Iraq', amount: 2000, status: 'cleared', receivedDate: d(-70), dueDate: d(-20), payouts: [{ id: uid(), date: d(-65), amount: 2000, note: 'Full payout', accountId: 'acc-b1-cash' }], clearedAccountId: 'acc-bank-main', clearedDate: d(-18) },
    { id: 'ck4', no: no('b1', 'CHK'), customerId: 'c2', checkNo: '661209', bank: 'Rafidain Bank', amount: 800, status: 'bounced', receivedDate: d(-30), dueDate: d(-5), payouts: [{ id: uid(), date: d(-25), amount: 300, note: '', accountId: 'acc-b1-cash' }], clearedAccountId: '', clearedDate: '' },
    { id: 'ck5', no: no('b2', 'CHK'), customerId: 'c12', checkNo: '553318', bank: 'North Bank', amount: 1200, status: 'received', receivedDate: d(-15), dueDate: d(-2), payouts: [], clearedAccountId: '', clearedDate: '' }
  );

  // ---- stock transfers, disposals, barters ----
  db.transfers.push(
    { id: 't1', no: no('b1', 'TRF'), date: d(-40), receivedDate: d(-38), fromBranchId: 'b1', toBranchId: 'b2', status: 'completed', lines: [{ itemId: 'i1', batchNo: 'OPEN-1', expiry: d(240), qty: 30, cost: 8 }] },
    { id: 't2', no: no('b2', 'TRF'), date: d(-5), receivedDate: '', fromBranchId: 'b2', toBranchId: 'b1', status: 'transit', lines: [{ itemId: 'i6', batchNo: '', expiry: '', qty: 10, cost: 1.1 }] }
  );

  db.disposals.push(
    { id: 'dp1', no: no('b1', 'DSP'), date: d(-7), branchId: 'b1', status: 'pending', lines: [{ stockId: null, itemId: 'i2', batchNo: 'O-2404', qty: 10, cost: 2.1, reason: 'Expired' }] },
    { id: 'dp2', no: no('b2', 'DSP'), date: d(-30), branchId: 'b2', status: 'approved', loss: 24, lines: [{ stockId: null, itemId: 'i3', batchNo: 'P-2403', qty: 20, cost: 1.2, reason: 'Expired' }] }
  );

  db.barters.push(
    { id: 'bt1', no: no('b1', 'BRT'), date: d(-20), partnerId: 'c21', branchId: 'b1', giveValue: 12, recvValue: 11, loss: 1, giveLines: [{ itemId: 'i5', qty: 15, cost: 0.8, batchNo: '', expiry: '' }], recvLines: [{ itemId: 'i6', qty: 10, cost: 1.1, batchNo: '' }] },
    { id: 'bt2', no: no('b2', 'BRT'), date: d(-15), partnerId: 'c17', branchId: 'b2', giveValue: 14, recvValue: 13.5, loss: 0.5, giveLines: [{ itemId: 'i12', qty: 20, cost: 0.7, batchNo: '', expiry: '' }], recvLines: [{ itemId: 'i10', qty: 15, cost: 0.9, batchNo: '' }] }
  );

  // ---- money moves & expenses ----
  db.moneyMoves.push(
    { id: 'mm1', no: no('b1', 'MTR'), date: d(-50), acceptedDate: d(-49), fromAccountId: 'acc-b1-cash', toAccountId: 'acc-b3-cash', amount: 300, note: 'Port depot float', status: 'done' },
    { id: 'mm2', no: no('b1', 'MTR'), date: d(-35), acceptedDate: d(-35), fromAccountId: 'acc-b1-cash', toAccountId: 'acc-bank-main', amount: 400, note: 'Weekly deposit', status: 'done' },
    { id: 'mm3', no: no('b2', 'MTR'), date: d(-20), acceptedDate: d(-20), fromAccountId: 'acc-b2-cash', toAccountId: 'acc-bank-north', amount: 200, note: 'North deposit', status: 'done' },
    { id: 'mm4', no: no('b1', 'MTR'), date: d(-9), acceptedDate: '', fromAccountId: 'acc-b1-cash', toAccountId: 'acc-b2-cash', amount: 250, note: 'Cash for north branch', status: 'transit' },
    { id: 'mm5', no: no('b1', 'MTR'), date: d(-5), acceptedDate: d(-5), fromAccountId: 'acc-bank-main', toAccountId: 'acc-b1-cash', amount: 500, note: 'Withdrawal', status: 'done' }
  );

  db.expenses.push(
    { id: 'ex1', no: no('b1', 'EXP'), date: d(-28), category: 'Rent', accountId: 'acc-b1-cash', amount: 250, note: 'Warehouse rent' },
    { id: 'ex2', no: no('b1', 'EXP'), date: d(-14), category: 'Salaries', accountId: 'acc-b1-cash', amount: 400, note: '' },
    { id: 'ex3', no: no('b2', 'EXP'), date: d(-14), category: 'Transport', accountId: 'acc-b2-cash', amount: 80, note: '' },
    { id: 'ex4', no: no('b1', 'EXP'), date: d(-7), category: 'Utilities', accountId: 'acc-b1-cash', amount: 60, note: 'Electricity' }
  );

  ['b1', 'b2', 'b3'].forEach((bid) => {
    if (!db.counters[bid]) db.counters[bid] = {};
    ['INV', 'DEL', 'RSL', 'RIN', 'INT', 'ARR', 'TRF', 'DSP', 'CHK', 'BRT', 'PAY', 'MTR', 'EXP'].forEach((k) => {
      if (!(k in db.counters[bid])) db.counters[bid][k] = 1000;
    });
  });

  db.stocks = simulateStock(db);
  return db;
}
