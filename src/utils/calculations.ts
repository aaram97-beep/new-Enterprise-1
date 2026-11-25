import type {
  DatabaseSchema,
  Invoice,
  InvoiceLine,
  Customer,
  Intake,
  ReturnSlip,
  ReturnInvoice,
  CheckDoc,
  MoneyAccount,
  BarterGiveLine,
  BarterRecvLine,
} from '../types';
import { r2, diffDays, todayStr } from './formatters';

export { diffDays, todayStr };

export const lineNet = (l: InvoiceLine): number => {
  const gross = r2((+l.qty || 0) * (+l.price || 0));
  let d = l.discType === 'pct' ? r2((gross * (+l.discVal || 0)) / 100) : r2(+l.discVal || 0);
  d = Math.max(0, Math.min(d, gross));
  return r2(gross - d);
};

export const calcInvoice = (
  dr: Partial<Invoice>,
  taxRate = 0
): { sub: number; discAmt: number; tax: number; total: number } => {
  const lines = dr.lines || [];
  const sub = r2(lines.reduce((a, l) => a + lineNet(l), 0));
  const ordVal = Number(dr.orderDiscVal ?? 0);
  let discAmt =
    dr.orderDiscType === 'pct' ? r2((sub * ordVal) / 100) : r2(ordVal);
  discAmt = r2(Math.max(0, Math.min(discAmt, sub)));
  const taxable = r2(sub - discAmt);
  const tax = r2((taxable * (+taxRate || 0)) / 100);
  return { sub, discAmt, tax, total: r2(taxable + tax) };
};

export const calcBarterSummary = (
  giveLines: Pick<BarterGiveLine, 'qty' | 'price' | 'cost'>[],
  recvLines: Pick<BarterRecvLine, 'qty' | 'price' | 'cost'>[]
): { giveValue: number; recvValue: number; loss: number } => {
  const unitOf = (l: { price?: number; cost?: number }) => +(l.price ?? l.cost ?? 0) || 0;
  const giveValue = r2(
    (giveLines || []).reduce((a, l) => a + r2((+l.qty || 0) * unitOf(l)), 0)
  );
  const recvValue = r2(
    (recvLines || []).reduce((a, l) => a + r2((+l.qty || 0) * unitOf(l)), 0)
  );
  return {
    giveValue,
    recvValue,
    loss: Math.max(0, r2(giveValue - recvValue)),
  };
};

export const invoiceTotal = (s: Partial<Invoice>, taxRate = 0): number => {
  if (s && s.total != null && s.total > 0) return r2(s.total);
  return calcInvoice(s, taxRate).total;
};

export const paidOfInvoice = (db: DatabaseSchema, s: Invoice): number => {
  return r2(
    (db.payments || []).reduce(
      (a, p) =>
        a +
        (p.allocs || [])
          .filter((x) => x.type === 'invoice' && x.docId === s.id)
          .reduce((y, x) => y + (+x.amount || 0), 0),
      0
    )
  );
};

export const intakeTotal = (p: Intake): number => {
  return r2((p.lines || []).reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0));
};

export const paidToIntake = (db: DatabaseSchema, p: Intake): number => {
  return r2(
    (db.payments || []).reduce(
      (a, x) =>
        a +
        (x.allocs || [])
          .filter((t) => t.type === 'intake' && t.docId === p.id)
          .reduce((y, t) => y + (+t.amount || 0), 0),
      0
    )
  );
};

export const intakeBalance = (db: DatabaseSchema, p: Intake): number => {
  return r2(intakeTotal(p) - paidToIntake(db, p));
};

export const invBalance = (db: DatabaseSchema, s: Invoice): number => {
  if (!s) return 0;
  return r2(invoiceTotal(s, db.settings?.taxRate || 0) - paidOfInvoice(db, s));
};

export const paidToOpening = (db: DatabaseSchema, customerId: string): number => {
  return r2(
    (db.payments || [])
      .filter((p) => p.customerId === customerId)
      .reduce(
        (a, p) =>
          a +
          (p.allocs || [])
            .filter((x) => x.type === 'opening')
            .reduce((y, x) => y + (+x.amount || 0), 0),
        0
      )
  );
};

export const openingBalanceRemaining = (
  db: DatabaseSchema,
  c: Customer | null | undefined
): number => {
  if (!c) return 0;
  const initial = r2(+c.openingBalance || 0);
  if (Math.abs(initial) <= 0.005) return 0;
  const paid = paidToOpening(db, c.id);
  return r2(Math.max(0, initial - paid));
};

export const retInvTotal = (r: ReturnInvoice): number => {
  return r2((r.lines || []).reduce((a, l) => a + r2((+l.qty || 0) * (+l.price || 0)), 0));
};

export const deliveredOf = (
  db: DatabaseSchema,
  docId: string,
  itemId: string,
  excludeDocId?: string | null
): number => {
  return r2(
    (db.deliveries || [])
      .filter((d) => (d.invoiceId === docId || d.returnSlipId === docId) && d.id !== excludeDocId)
      .reduce(
        (a, d) =>
          a +
          d.lines
            .filter((l) => l.itemId === itemId)
            .reduce((x, l) => x + (+l.qty || 0), 0),
        0
      )
  );
};

export const creditedOf = (
  db: DatabaseSchema,
  returnSlipId: string,
  itemId: string,
  excludeCreditNoteId?: string | null
): number => {
  return r2(
    (db.returnInvoices || [])
      .filter((r) => r.returnSlipId === returnSlipId && r.id !== excludeCreditNoteId)
      .reduce(
        (a, r) =>
          a +
          (r.lines || [])
            .filter((l) => l.itemId === itemId)
            .reduce((x, l) => x + (+l.qty || 0), 0),
        0
      )
  );
};

export const returnSlipItemRemaining = (
  db: DatabaseSchema,
  returnSlipId: string,
  itemId: string,
  origQty: number,
  excludeDeliveryId?: string | null,
  excludeCreditNoteId?: string | null
): number => {
  const delivered = deliveredOf(db, returnSlipId, itemId, excludeDeliveryId);
  const credited = creditedOf(db, returnSlipId, itemId, excludeCreditNoteId);
  return Math.max(0, r2(origQty - delivered - credited));
};

export const returnSlipRemaining = (
  db: DatabaseSchema,
  slip: ReturnSlip,
  itemId?: string | null,
  excludeDeliveryId?: string | null,
  excludeCreditNoteId?: string | null
): number => {
  if (itemId) {
    const line = (slip.lines || []).find((l) => l.itemId === itemId);
    const origQty = line ? +line.qty || 0 : 0;
    return returnSlipItemRemaining(db, slip.id, itemId, origQty, excludeDeliveryId, excludeCreditNoteId);
  }
  return r2(
    (slip.lines || []).reduce((sum, l) => {
      if (!l.itemId) return sum;
      return sum + returnSlipItemRemaining(db, slip.id, l.itemId, +l.qty || 0, excludeDeliveryId, excludeCreditNoteId);
    }, 0)
  );
};

export const deliverPct = (db: DatabaseSchema, s: Invoice | ReturnSlip): number => {
  const tot = r2((s.lines || []).reduce((a, l) => a + (+l.qty || 0), 0));
  if (tot <= 0) return 100;
  const del = r2(
    (s.lines || []).reduce((a, l) => {
      if (!l.itemId) return a;
      return a + Math.min(+l.qty || 0, deliveredOf(db, s.id, l.itemId, null));
    }, 0)
  );
  return Math.round((1000 * del) / tot) / 10;
};

export const returnSlipFulfilledQty = (
  db: DatabaseSchema,
  slip: ReturnSlip,
  itemId?: string | null
): number => {
  if (itemId) {
    const line = (slip.lines || []).find((l) => l.itemId === itemId);
    const origQty = line ? +line.qty || 0 : 0;
    const del = deliveredOf(db, slip.id, itemId, null);
    const cr = creditedOf(db, slip.id, itemId, null);
    return Math.min(origQty, r2(del + cr));
  }
  return r2(
    (slip.lines || []).reduce((sum, l) => {
      if (!l.itemId) return sum;
      const origQty = +l.qty || 0;
      const del = deliveredOf(db, slip.id, l.itemId, null);
      const cr = creditedOf(db, slip.id, l.itemId, null);
      return sum + Math.min(origQty, r2(del + cr));
    }, 0)
  );
};

export const returnSlipFulfillPct = (
  db: DatabaseSchema,
  slip: ReturnSlip
): number => {
  const tot = r2((slip.lines || []).reduce((a, l) => a + (+l.qty || 0), 0));
  if (tot <= 0) return 100;
  const fulfilled = returnSlipFulfilledQty(db, slip);
  return Math.round((1000 * fulfilled) / tot) / 10;
};

export const custBalance = (db: DatabaseSchema, c: Customer | null | undefined): number => {
  if (!c) return 0;
  const id = c.id;
  const inv = r2(
    (db.invoices || [])
      .filter((x) => x.customerId === id)
      .reduce((a, x) => a + invoiceTotal(x, db.settings?.taxRate || 0), 0)
  );
  const payIn = r2(
    (db.payments || [])
      .filter((x) => x.customerId === id && x.dir !== 'out')
      .reduce((a, x) => a + r2((+x.amount || 0) + (+x.disc || 0)), 0)
  );
  const payOut = r2(
    (db.payments || [])
      .filter((x) => x.customerId === id && x.dir === 'out')
      .reduce((a, x) => a + r2((+x.amount || 0) + (+x.disc || 0)), 0)
  );
  const rin = r2(
    (db.returnInvoices || [])
      .filter((x) => x.customerId === id)
      .reduce((a, x) => a + retInvTotal(x), 0)
  );
  const intk = r2(
    (db.intakes || [])
      .filter((x) => x.providerId === id)
      .reduce((a, x) => a + intakeTotal(x), 0)
  );
  return r2(r2(+c.openingBalance || 0) + inv - payIn - rin - intk + payOut);
};

export const custDiscountTotal = (db: DatabaseSchema, id: string): number => {
  return r2(
    (db.payments || [])
      .filter((x) => x.customerId === id && x.dir !== 'out')
      .reduce((a, x) => a + (+x.disc || 0), 0)
  );
};

export const checkCollected = (c: CheckDoc): number => {
  return r2((c.payouts || []).reduce((a, p) => a + (+p.amount || 0), 0));
};

export const checkRemaining = (c: CheckDoc): number => {
  return r2(r2(c.amount) - checkCollected(c));
};

export const effCheckStatus = (c: CheckDoc): CheckDoc['status'] => {
  if (c.status === 'cleared' || c.status === 'bounced') return c.status;
  if (c.status === 'received' && c.dueDate && diffDays(c.dueDate, todayStr()) < 0 && checkRemaining(c) > 0.005) {
    return 'overdue';
  }
  return c.status;
};

export const chequesBalance = (db: DatabaseSchema): number => {
  return r2(
    (db.checks || []).reduce((s, c) => {
      const st = effCheckStatus(c);
      return s + (st === 'received' ? checkRemaining(c) : 0);
    }, 0)
  );
};

export const accBalance = (db: DatabaseSchema, a: MoneyAccount | null | undefined): number => {
  if (!a) return 0;
  if (a.type === 'cheques') return chequesBalance(db);
  let bal = r2(+a.opening || 0);
  (db.payments || []).forEach((p) => {
    if (p.accountId === a.id) {
      bal = r2(bal + (p.dir === 'out' ? -(+p.amount || 0) : +p.amount || 0));
    }
  });
  (db.checks || []).forEach((c) => {
    (c.payouts || []).forEach((p) => {
      if (p.accountId === a.id) bal = r2(bal + (+p.amount || 0));
    });
    const st = effCheckStatus(c);
    if ((st === 'deposited' || st === 'cleared') && c.clearedAccountId === a.id) {
      bal = r2(bal + checkRemaining(c));
    }
  });
  (db.expenses || []).forEach((e) => {
    if (e.accountId === a.id) bal = r2(bal - (+e.amount || 0));
  });
  (db.moneyMoves || []).forEach((m) => {
    if (m.status !== 'done') return;
    if (m.fromAccountId === a.id) bal = r2(bal - (+m.amount || 0));
    if (m.toAccountId === a.id) bal = r2(bal + (+m.amount || 0));
  });
  return r2(bal);
};

export const cashTotal = (db: DatabaseSchema, accounts: MoneyAccount[]): number => {
  return r2(
    accounts
      .filter((a) => a.type !== 'cheques')
      .reduce((s, a) => s + accBalance(db, a), 0)
  );
};

// Journal & Accounting Calculations
export interface JournalEntry {
  key: string;
  date: string;
  ref: string;
  memo: string;
  lines: { acct: string; dr: number; cr: number }[];
}

export function computeJournal(db: DatabaseSchema, from?: string, end?: string): JournalEntry[] {
  const inR = (d?: string) => (!from || (d || '') >= from) && (!end || (d || '') <= end);
  const rows: JournalEntry[] = [];
  const push = (date: string, ref: string, memo: string, lines: { acct: string; dr: number; cr: number }[]) =>
    rows.push({ key: `${ref}-${date}`, date, ref, memo, lines });

  const getCustName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '';
  const payAcctName = (p: { accountId?: string | null }) => {
    const a = db.accounts.find((acc) => acc.id === p.accountId);
    return a && a.type === 'cheques' ? 'Cheques in Hand' : 'Cash';
  };

  (db.invoices || []).forEach((inv) => {
    if (inR(inv.date)) {
      const tot = invoiceTotal(inv, db.settings.taxRate);
      push(inv.date, inv.no, `Invoice   ${getCustName(inv.customerId)}`, [
        { acct: 'Accounts Receivable', dr: tot, cr: 0 },
        { acct: 'Sales Revenue', dr: 0, cr: tot },
      ]);
    }
  });

  (db.returnInvoices || []).forEach((r) => {
    if (inR(r.date)) {
      const tot = retInvTotal(r);
      push(r.date, r.no, `Credit note   ${getCustName(r.customerId)}`, [
        { acct: 'Sales Returns', dr: tot, cr: 0 },
        { acct: 'Accounts Receivable', dr: 0, cr: tot },
      ]);
    }
  });

  (db.payments || []).forEach((p) => {
    if (!inR(p.date)) return;
    const amt = r2(+p.amount || 0);
    const disc = r2(+p.disc || 0);
    const net = r2(amt + disc);
    if (p.dir === 'out') {
      const lines = [
        { acct: 'Accounts Payable', dr: net, cr: 0 },
        { acct: payAcctName(p), dr: 0, cr: amt },
      ];
      if (disc > 0) lines.push({ acct: 'Settlement Discounts Received', dr: 0, cr: disc });
      push(p.date, p.no, `Payment to provider   ${getCustName(p.customerId)}`, lines);
    } else {
      const lines = [{ acct: payAcctName(p), dr: amt, cr: 0 }];
      if (disc > 0) lines.push({ acct: 'Settlement Discounts Given', dr: disc, cr: 0 });
      lines.push({ acct: 'Accounts Receivable', dr: 0, cr: net });
      push(p.date, p.no, `Payment received   ${getCustName(p.customerId)}`, lines);
    }
  });

  (db.intakes || []).forEach((p) => {
    if (inR(p.date)) {
      const tot = intakeTotal(p);
      push(p.date, p.no, `Buying receipt   ${getCustName(p.providerId)}`, [
        { acct: 'Inventory', dr: tot, cr: 0 },
        { acct: 'Accounts Payable', dr: 0, cr: tot },
      ]);
    }
  });

  (db.disposals || [])
    .filter((d) => d.status === 'approved')
    .forEach((d) => {
      if (!inR(d.date)) return;
      const v = r2(
        (d.lines || []).reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0)
      );
      push(d.date, d.no, 'Disposal / write-off', [
        { acct: 'Write-offs & Exchange Loss', dr: v, cr: 0 },
        { acct: 'Inventory', dr: 0, cr: v },
      ]);
    });

  (db.barters || []).forEach((b) => {
    if (inR(b.date) && (b.loss || 0) > 0.005) {
      push(b.date, b.no, 'Barter exchange loss', [
        { acct: 'Write-offs & Exchange Loss', dr: r2(b.loss), cr: 0 },
        { acct: 'Inventory', dr: 0, cr: r2(b.loss) },
      ]);
    }
  });

  (db.expenses || []).forEach((e) => {
    if (inR(e.date)) {
      const amt = r2(+e.amount || 0);
      push(e.date, e.no, `Expense   ${e.category}`, [
        { acct: 'Operating Expenses', dr: amt, cr: 0 },
        { acct: payAcctName(e), dr: 0, cr: amt },
      ]);
    }
  });

  return rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
}

export function computeTrialBalance(
  db: DatabaseSchema,
  from?: string,
  end?: string
): { rows: { acct: string; dr: number; cr: number }[]; totals: { dr: number; cr: number } } {
  const journal = computeJournal(db, from, end);
  const agg: Record<string, { acct: string; dr: number; cr: number }> = {};
  let drT = 0,
    crT = 0;
  journal.forEach((e) =>
    e.lines.forEach((l) => {
      if (!agg[l.acct]) agg[l.acct] = { acct: l.acct, dr: 0, cr: 0 };
      agg[l.acct].dr = r2(agg[l.acct].dr + (+l.dr || 0));
      agg[l.acct].cr = r2(agg[l.acct].cr + (+l.cr || 0));
      drT = r2(drT + (+l.dr || 0));
      crT = r2(crT + (+l.cr || 0));
    })
  );
  const rows = Object.keys(agg).map((k) => agg[k]);
  const diff = r2(drT - crT);
  if (Math.abs(diff) > 0.005) {
    if (diff > 0) rows.push({ acct: 'Opening Balance Difference', dr: 0, cr: diff });
    else rows.push({ acct: 'Opening Balance Difference', dr: r2(-diff), cr: 0 });
  }
  rows.sort((a, b) => a.acct.localeCompare(b.acct));
  const totals = {
    dr: r2(rows.reduce((a, r) => a + r.dr, 0)),
    cr: r2(rows.reduce((a, r) => a + r.cr, 0)),
  };
  return { rows, totals };
}

export function computePnL(
  db: DatabaseSchema,
  from?: string,
  end?: string,
  basis: 'invoice' | 'delivery' = 'invoice'
) {
  const inR = (d?: string) => (!from || (d || '') >= from) && (!end || (d || '') <= end);
  let revenue = 0;
  let cogs = 0;

  if (basis === 'delivery') {
    (db.deliveries || [])
      .filter((d) => inR(d.date))
      .forEach((d) => {
        const inv = db.invoices.find((x) => x.id === d.invoiceId) || { lines: [] };
        d.lines.forEach((l) => {
          const il = inv.lines.find((x) => x.itemId === l.itemId);
          const unit = il && (+il.qty || 0) > 0 ? r2(lineNet(il) / il.qty) : 0;
          revenue = r2(revenue + r2((+l.qty || 0) * unit));
          cogs = r2(cogs + r2((+l.qty || 0) * (Number(l.cost) || 0)));
        });
      });
  } else {
    (db.invoices || [])
      .filter((s) => inR(s.date))
      .forEach((s) => {
        revenue = r2(revenue + invoiceTotal(s, db.settings.taxRate));
        s.lines.forEach((l) => {
          const it = db.items.find((i) => i.id === l.itemId) || { cost: 0 };
          cogs = r2(cogs + r2((+l.qty || 0) * (+it.cost || 0)));
        });
      });
  }

  let returns = 0;
  let discGiven = 0;
  let writeoffs = 0;
  const opex = r2(
    (db.expenses || []).filter((e) => inR(e.date)).reduce((a, e) => a + (+e.amount || 0), 0)
  );

  (db.returnInvoices || [])
    .filter((r) => inR(r.date))
    .forEach((r) => {
      returns = r2(returns + retInvTotal(r));
    });

  (db.payments || [])
    .filter((p) => inR(p.date) && p.dir !== 'out')
    .forEach((p) => {
      discGiven = r2(discGiven + (+p.disc || 0));
    });

  (db.disposals || [])
    .filter((d) => d.status === 'approved' && inR(d.date))
    .forEach((d) => {
      writeoffs = r2(
        writeoffs +
          (d.lines || []).reduce((a, l) => a + r2((+l.qty || 0) * (+l.cost || 0)), 0)
      );
    });

  (db.barters || [])
    .filter((b) => inR(b.date))
    .forEach((b) => {
      writeoffs = r2(writeoffs + (+b.loss || 0));
    });

  const net = r2(revenue - returns);
  const gross = r2(net - cogs);
  const netIncome = r2(gross - discGiven - writeoffs - opex);
  return { revenue, returns, net, cogs, gross, discGiven, writeoffs, opex, netIncome };
}

export function computeBalanceSheet(db: DatabaseSchema, end?: string) {
  const le = (d?: string) => !end || (d || '') <= end;
  const opening = r2(db.customers.reduce((a, c) => a + (+c.openingBalance || 0), 0));
  const inv = r2(
    (db.invoices || []).filter((s) => le(s.date)).reduce((a, s) => a + invoiceTotal(s, db.settings.taxRate), 0)
  );
  const rin = r2(
    (db.returnInvoices || []).filter((r) => le(r.date)).reduce((a, r) => a + retInvTotal(r), 0)
  );
  const payInA = (db.payments || []).filter((p) => p.dir !== 'out' && le(p.date));
  const payOutA = (db.payments || []).filter((p) => p.dir === 'out' && le(p.date));
  const payIn = r2(payInA.reduce((a, p) => a + (+p.amount || 0), 0));
  const payOut = r2(payOutA.reduce((a, p) => a + (+p.amount || 0), 0));
  const discIn = r2(payInA.reduce((a, p) => a + (+p.disc || 0), 0));
  const discOut = r2(payOutA.reduce((a, p) => a + (+p.disc || 0), 0));
  const intk = r2(
    (db.intakes || []).filter((p) => le(p.date)).reduce((a, p) => a + intakeTotal(p), 0)
  );

  const ar = r2(opening + inv - rin - payIn - discIn);
  const ap = r2(intk - payOut - discOut);
  const cash = r2(
    (db.accounts || [])
      .filter((a) => a.type !== 'cheques')
      .reduce((s, a) => s + accBalance(db, a), 0)
  );
  const cheques = chequesBalance(db);
  const inventory = r2((db.stocks || []).reduce((a, s) => a + r2(s.qty * s.cost), 0));
  const assets = r2(ar + cash + inventory + cheques);
  const equity = r2(assets - ap);

  return { asOf: end || todayStr(), ar, ap, cash, cheques, inventory, equity, assets };
}

export function computeCashFlow(db: DatabaseSchema, from?: string, end?: string) {
  const inR = (d?: string) => (!from || (d || '') >= from) && (!end || (d || '') <= end);
  const rows = (db.payments || [])
    .filter((p) => inR(p.date))
    .map((p) => {
      const amt = r2(+p.amount || 0);
      const out = p.dir === 'out';
      const cust = db.customers.find((c) => c.id === p.customerId);
      return {
        key: p.id,
        date: p.date,
        no: p.no,
        account: cust ? cust.name : '',
        out,
        inflow: out ? 0 : amt,
        outflow: out ? amt : 0,
      };
    });

  (db.expenses || []).forEach((e) => {
    if (inR(e.date)) {
      rows.push({
        key: e.id,
        date: e.date,
        no: e.no,
        account: e.category,
        out: true,
        inflow: 0,
        outflow: r2(+e.amount || 0),
      });
    }
  });

  rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const totals = {
    in: r2(rows.reduce((a, r) => a + r.inflow, 0)),
    out: r2(rows.reduce((a, r) => a + r.outflow, 0)),
    net: r2(rows.reduce((a, r) => a + r.inflow - r.outflow, 0)),
  };
  return { rows, totals };
}
