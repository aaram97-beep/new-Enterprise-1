import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVirtualStocksForInvoiceEdit,
  getDirectSaleBatchesForItem,
  getRestoredQtyByStockId,
  processDirectSaleInvoiceStock,
  resolveInitialStockIdForInvoiceLine,
} from '../utils/directSale';
import type { Delivery, Invoice, Item, StockBatch } from '../types';

const sampleItems: Item[] = [
  {
    id: 'i-tracked',
    sku: 'SKU-1',
    name: 'Amoxicillin 500mg',
    company: 'MediCo',
    group: 'Pharma',
    cost: 10,
    price: 20,
    reorder: 5,
    barcode: '',
    note: '',
    batch: true,
    trackingMode: 'global',
  },
  {
    id: 'i-lot-only',
    sku: 'SKU-2',
    name: 'Surgical Gloves',
    company: 'SafeCo',
    group: 'Supplies',
    cost: 5,
    price: 12,
    reorder: 10,
    barcode: '',
    note: '',
    batch: true,
    trackingMode: 'lot',
  },
  {
    id: 'i-untracked',
    sku: 'SKU-3',
    name: 'Standard Bandage',
    company: 'SafeCo',
    group: 'Supplies',
    cost: 2,
    price: 6,
    reorder: 10,
    barcode: '',
    note: '',
    batch: false,
    trackingMode: 'none',
  },
];

const makeStocks = (): StockBatch[] => [
  {
    id: 's1',
    itemId: 'i-tracked',
    branchId: 'b1',
    batchNo: 'LOT-EARLY',
    expiry: '2026-06-01',
    qty: 8,
    cost: 10,
  },
  {
    id: 's2',
    itemId: 'i-tracked',
    branchId: 'b1',
    batchNo: 'LOT-LATE',
    expiry: '2027-09-01',
    qty: 12,
    cost: 11,
  },
  {
    id: 's3',
    itemId: 'i-lot-only',
    branchId: 'b1',
    batchNo: 'GLV-01',
    expiry: '',
    qty: 15,
    cost: 5,
  },
  {
    id: 's4',
    itemId: 'i-untracked',
    branchId: 'b1',
    batchNo: 'B-OLD',
    expiry: '2026-04-01',
    qty: 5,
    cost: 2,
  },
  {
    id: 's5',
    itemId: 'i-untracked',
    branchId: 'b1',
    batchNo: 'B-NEW',
    expiry: '2027-01-01',
    qty: 10,
    cost: 2.5,
  },
];

describe('Direct Sale Mode Pure Logic', () => {
  test('Auto-deducts stock FEFO when global Lot & Expiry is disabled (mode = none) without needing stockId on invoice lines', () => {
    const stocks = makeStocks();
    const inv: Invoice = {
      id: 'inv-1',
      no: 'INV-B1-1001',
      date: '2026-03-01',
      customerId: 'c1',
      branchId: 'b1',
      lines: [
        { itemId: 'i-tracked', qty: 10, price: 20, discType: 'pct', discVal: 0 },
      ],
      orderDiscType: 'pct',
      orderDiscVal: 0,
      sub: 200,
      discAmt: 0,
      tax: 0,
      total: 200,
    };

    const res = processDirectSaleInvoiceStock({
      settings: { lotExpiryMode: 'none', trackBatchExpiry: false },
      items: sampleItems,
      stocks,
      deliveries: [],
      inv,
      deliveryNo: 'DEL-B1-1001',
    });

    assert.equal(res.ok, true);
    if (!res.ok) return;

    // 8 from LOT-EARLY (depleted) + 2 from LOT-LATE (10 remaining)
    const trackedStocks = res.stocks.filter((s) => s.itemId === 'i-tracked');
    assert.equal(trackedStocks.length, 1);
    assert.equal(trackedStocks[0].batchNo, 'LOT-LATE');
    assert.equal(trackedStocks[0].qty, 10);

    // Synced internal delivery keeps exact cost/batch trail for COGS & deletion restore
    assert.equal(res.deliveries.length, 1);
    assert.equal(res.deliveries[0].invoiceId, 'inv-1');
    assert.deepEqual(
      res.deliveries[0].lines.map((l) => ({ qty: l.qty, batchNo: l.batchNo, cost: l.cost })),
      [
        { qty: 8, batchNo: 'LOT-EARLY', cost: 10 },
        { qty: 2, batchNo: 'LOT-LATE', cost: 11 },
      ]
    );
  });

  test('Requires explicit batch selection when Lot or Expiry is tracked, and supports mixed items in one invoice', () => {
    const stocks = makeStocks();
    const settings = { lotExpiryMode: 'both' as const, trackBatchExpiry: true };

    // Missing batch selection on tracked item must fail cleanly without mutating state
    const badInv: Invoice = {
      id: 'inv-bad',
      no: 'INV-B1-1002',
      date: '2026-03-01',
      customerId: 'c1',
      branchId: 'b1',
      lines: [{ itemId: 'i-tracked', qty: 3, price: 20, discType: 'pct', discVal: 0 }],
      orderDiscType: 'pct',
      orderDiscVal: 0,
      sub: 60,
      discAmt: 0,
      tax: 0,
      total: 60,
    };
    const badRes = processDirectSaleInvoiceStock({
      settings,
      items: sampleItems,
      stocks,
      deliveries: [],
      inv: badInv,
      deliveryNo: 'DEL-B1-1002',
    });
    assert.equal(badRes.ok, false);

    // Picking explicit batch s2 (LOT-LATE) for tracked item + auto-deduct for i-untracked (mode: 'none')
    const mixedInv: Invoice = {
      ...badInv,
      id: 'inv-mix',
      lines: [
        { itemId: 'i-tracked', qty: 4, price: 20, discType: 'pct', discVal: 0, stockId: 's2' },
        { itemId: 'i-untracked', qty: 7, price: 6, discType: 'pct', discVal: 0 },
      ],
    };
    const okRes = processDirectSaleInvoiceStock({
      settings,
      items: sampleItems,
      stocks,
      deliveries: [],
      inv: mixedInv,
      deliveryNo: 'DEL-B1-1003',
    });
    assert.equal(okRes.ok, true);
    if (!okRes.ok) return;

    assert.equal(okRes.stocks.find((s) => s.id === 's1')?.qty, 8);
    assert.equal(okRes.stocks.find((s) => s.id === 's2')?.qty, 8);
    // Untracked took 5 from B-OLD (depleted) and 2 from B-NEW (8 left)
    assert.equal(okRes.stocks.find((s) => s.id === 's4'), undefined);
    assert.equal(okRes.stocks.find((s) => s.id === 's5')?.qty, 8);

    // Tracked invoice line stores batch metadata for future editing
    assert.equal(okRes.normalizedInvoice.lines[0].batchNo, 'LOT-LATE');
    assert.equal(okRes.normalizedInvoice.lines[0].stockId, 's2');
    assert.equal(okRes.normalizedInvoice.lines[1].batchNo, undefined);
  });

  test('Editing a direct-sale invoice restores previously depleted batches and applies updated deduction atomically', () => {
    const initialStocks = makeStocks();
    const settings = { lotExpiryMode: 'both' as const, trackBatchExpiry: true };

    // Step 1: Invoice depletes all 8 of s1 (LOT-EARLY)
    const inv1: Invoice = {
      id: 'inv-edit',
      no: 'INV-B1-1004',
      date: '2026-03-01',
      customerId: 'c1',
      branchId: 'b1',
      lines: [{ itemId: 'i-tracked', qty: 8, price: 20, discType: 'pct', discVal: 0, stockId: 's1' }],
      orderDiscType: 'pct',
      orderDiscVal: 0,
      sub: 160,
      discAmt: 0,
      tax: 0,
      total: 160,
    };

    const step1 = processDirectSaleInvoiceStock({
      settings,
      items: sampleItems,
      stocks: initialStocks,
      deliveries: [],
      inv: inv1,
      deliveryNo: 'DEL-B1-1004',
    });
    assert.equal(step1.ok, true);
    if (!step1.ok) return;
    // s1 is completely gone from live stocks now
    assert.equal(step1.stocks.find((s) => s.batchNo === 'LOT-EARLY'), undefined);

    // Step 2: Open Edit UI -> virtualStocks restores LOT-EARLY with qty 8!
    const virtual = buildVirtualStocksForInvoiceEdit(step1.stocks, step1.deliveries, 'inv-edit');
    const batches = getDirectSaleBatchesForItem(virtual, 'b1', 'i-tracked');
    assert.equal(batches.length, 2);
    assert.equal(batches[0].batchNo, 'LOT-EARLY');
    assert.equal(batches[0].qty, 8);

    const restoredByStock = getRestoredQtyByStockId(virtual, step1.deliveries, 'inv-edit');
    assert.equal(restoredByStock[batches[0].id], 8);

    const resolvedId = resolveInitialStockIdForInvoiceLine({
      line: step1.normalizedInvoice.lines[0],
      branchId: 'b1',
      virtualStocks: virtual,
      settings,
      item: sampleItems[0],
    });
    assert.equal(resolvedId, batches[0].id);

    // Step 3: Change quantity from 8 down to 3 and save
    const editedInv: Invoice = {
      ...step1.normalizedInvoice,
      lines: [{ ...step1.normalizedInvoice.lines[0], stockId: resolvedId, qty: 3 }],
      sub: 60,
      total: 60,
    };
    const step2 = processDirectSaleInvoiceStock({
      settings,
      items: sampleItems,
      stocks: step1.stocks,
      deliveries: step1.deliveries,
      inv: editedInv,
      deliveryNo: 'DEL-B1-9999',
    });
    assert.equal(step2.ok, true);
    if (!step2.ok) return;

    const restoredEarly = step2.stocks.find((s) => s.batchNo === 'LOT-EARLY');
    assert.equal(restoredEarly?.qty, 5);
    assert.equal(step2.deliveries.length, 1);
    assert.equal(step2.deliveries[0].no, 'DEL-B1-1004');
    assert.equal(step2.deliveries[0].lines[0].qty, 3);
  });

  test('Rejects sale cleanly if requested qty exceeds available stock (both untracked & tracked)', () => {
    const stocks = makeStocks();
    const invTooMuch: Invoice = {
      id: 'inv-over',
      no: 'INV-B1-1005',
      date: '2026-03-01',
      customerId: 'c1',
      branchId: 'b1',
      lines: [{ itemId: 'i-tracked', qty: 99, price: 20, discType: 'pct', discVal: 0 }],
      orderDiscType: 'pct',
      orderDiscVal: 0,
      sub: 1980,
      discAmt: 0,
      tax: 0,
      total: 1980,
    };

    const resAuto = processDirectSaleInvoiceStock({
      settings: { lotExpiryMode: 'none' },
      items: sampleItems,
      stocks,
      deliveries: [],
      inv: invTooMuch,
      deliveryNo: 'DEL-B1-1005',
    });
    assert.equal(resAuto.ok, false);

    const resBatch = processDirectSaleInvoiceStock({
      settings: { lotExpiryMode: 'both' },
      items: sampleItems,
      stocks,
      deliveries: [],
      inv: {
        ...invTooMuch,
        lines: [{ ...invTooMuch.lines[0], qty: 9, stockId: 's1' }],
      },
      deliveryNo: 'DEL-B1-1005',
    });
    assert.equal(resBatch.ok, false);
  });
});
