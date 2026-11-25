import type { DatabaseSchema, StockBatch } from '../types/index.ts';
import { r2, uid } from './formatters.ts';

export function simulateStock(db: DatabaseSchema): StockBatch[] {
  const st: StockBatch[] = [];
  const findRow = (itemId: string, branchId: string, batchNo?: string, expiry?: string) =>
    st.find(
      (s) =>
        s.itemId === itemId &&
        s.branchId === branchId &&
        (s.batchNo || '') === (batchNo || '') &&
        (s.expiry || '') === (expiry || '')
    );
  const add = (
    itemId: string,
    branchId: string,
    batchNo: string | undefined,
    expiry: string | undefined,
    qty: number,
    cost: number
  ) => {
    qty = r2(qty);
    if (qty <= 0 || !itemId) return;
    const f = findRow(itemId, branchId, batchNo, expiry);
    if (f) {
      f.qty = r2(f.qty + qty);
      f.cost = r2(cost);
    } else {
      st.push({
        id: uid(),
        itemId,
        branchId,
        batchNo: batchNo || '',
        expiry: expiry || '',
        qty,
        cost: r2(cost),
      });
    }
  };
  const takeBatch = (itemId: string, branchId: string, batchNo: string | undefined, qty: number): number => {
    const f = st.find(
      (s) =>
        s.itemId === itemId &&
        s.branchId === branchId &&
        (s.batchNo || '') === (batchNo || '') &&
        s.qty > 0
    );
    if (!f) return r2(qty);
    const t = Math.min(f.qty, r2(qty));
    f.qty = r2(f.qty - t);
    return r2(r2(qty) - t);
  };
  const takeFEFO = (itemId: string, branchId: string, qty: number): number => {
    let left = r2(qty);
    const pool = st
      .filter((s) => s.itemId === itemId && s.branchId === branchId && s.qty > 0)
      .sort((a, b) => (a.expiry || '9999-12-31').localeCompare(b.expiry || '9999-12-31'));
    for (const s of pool) {
      if (left <= 0) break;
      const t = Math.min(s.qty, left);
      s.qty = r2(s.qty - t);
      left = r2(left - t);
    }
    return left;
  };

  interface SimEvent {
    date: string;
    fn: () => void;
  }
  const events: SimEvent[] = [];

  (db.arrivals || []).forEach((a) =>
    events.push({
      date: a.date,
      fn: () =>
        a.lines.forEach((l) => add(l.itemId, a.branchId, l.batchNo, l.expiry, l.qty, l.cost)),
    })
  );

  (db.deliveries || []).forEach((x) =>
    events.push({
      date: x.date,
      fn: () =>
        x.lines.forEach((l) => {
          let rem = takeBatch(l.itemId, x.branchId, l.batchNo, l.qty);
          if (rem > 0) rem = takeFEFO(l.itemId, x.branchId, rem);
        }),
    })
  );

  (db.returnSlips || []).forEach((x) =>
    events.push({
      date: x.date,
      fn: () =>
        x.lines.forEach((l) => {
          if (!l.itemId) return;
          const cost = (db.items.find((i) => i.id === l.itemId) || {}).cost || 0;
          add(l.itemId, x.branchId, l.batchNo, l.expiry, l.qty, cost);
        }),
    })
  );

  (db.transfers || []).forEach((t) => {
    events.push({
      date: t.date,
      fn: () =>
        t.lines.forEach((l) => {
          let rem = takeBatch(l.itemId, t.fromBranchId, l.batchNo, l.qty);
          if (rem > 0) rem = takeFEFO(l.itemId, t.fromBranchId, rem);
        }),
    });
    if (t.status === 'completed') {
      events.push({
        date: t.receivedDate || t.date,
        fn: () =>
          t.lines.forEach((l) => add(l.itemId, t.toBranchId, l.batchNo, l.expiry, l.qty, l.cost)),
      });
    }
  });

  (db.disposals || [])
    .filter((x) => x.status === 'approved')
    .forEach((x) =>
      events.push({
        date: x.date,
        fn: () =>
          x.lines.forEach((l) => {
            if (!l.itemId) return;
            let rem = takeBatch(l.itemId, x.branchId, l.batchNo, l.qty);
            if (rem > 0) rem = takeFEFO(l.itemId, x.branchId, rem);
          }),
      })
    );

  (db.barters || []).forEach((b) =>
    events.push({
      date: b.date,
      fn: () => {
        b.giveLines.forEach((l) => {
          if (l.itemId) takeFEFO(l.itemId, b.branchId, l.qty);
        });
        b.recvLines.forEach((l) => {
          if (l.itemId) add(l.itemId, b.branchId, l.batchNo, l.expiry || '', l.qty, l.cost);
        });
      },
    })
  );

  (db.adjusts || []).forEach((a) =>
    events.push({
      date: a.date,
      fn: () => {
        if (a.qty > 0) add(a.itemId, a.branchId, a.batchNo, a.expiry, a.qty, a.cost);
        else takeFEFO(a.itemId, a.branchId, -a.qty);
      },
    })
  );

  events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  events.forEach((e) => e.fn());
  return st.filter((s) => s.qty > 0.005);
}
