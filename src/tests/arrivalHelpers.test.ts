import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  buildIntakeArrivalLines,
  splitIntakeArrivalLine,
  totalAllocatedForItem,
  validateIntakeArrivalSave,
  validateStockReductionOnEdit,
} from '../utils/arrivalHelpers.ts';
import type { Arrival, Intake, Item, StockBatch } from '../types/index.ts';

const items: Item[] = [
  { id: 'i1', name: 'Amoxicillin 500mg', sku: 'AMX-500', company: 'Co', group: 'Abx', price: 10, cost: 6, reorder: 5, barcode: '', note: '', batch: true },
  { id: 'i2', name: 'Paracetamol', sku: 'PCM-500', company: 'Co', group: 'Pain', price: 5, cost: 2, reorder: 10, barcode: '', note: '', batch: true },
];

const t = (s: string) => s;

describe('Purchase-linked Arrival Note multi-lot helpers', () => {
  test('buildIntakeArrivalLines aggregates duplicate item lines on intake and respects prior arrivals', () => {
    const intake: Intake = {
      id: 'int1',
      no: 'PUR-001',
      date: '2026-11-10',
      providerId: 'p1',
      branchId: 'b1',
      lines: [
        { itemId: 'i1', qty: 10, cost: 6 },
        { itemId: 'i2', qty: 4, cost: 2 },
      ],
      total: 68,
    };

    const existingArrivals: Arrival[] = [
      {
        id: 'arr1',
        no: 'ARR-001',
        date: '2026-11-11',
        intakeId: 'int1',
        branchId: 'b1',
        lines: [{ itemId: 'i1', qty: 3, cost: 6, batchNo: 'LOT-A', expiry: '2027-01-01' }],
      },
    ];

    const draft = buildIntakeArrivalLines(intake, existingArrivals, null);
    assert.strictEqual(draft.length, 2);
    assert.deepStrictEqual(
      { itemId: draft[0].itemId, rem: draft[0].rem, qty: draft[0].qty },
      { itemId: 'i1', rem: 7, qty: 7 }
    );
    assert.deepStrictEqual(
      { itemId: draft[1].itemId, rem: draft[1].rem, qty: draft[1].qty },
      { itemId: 'i2', rem: 4, qty: 4 }
    );
  });

  test('splitIntakeArrivalLine inserts a second lot row below and prefills remaining unallocated qty', () => {
    const initial = [
      { itemId: 'i1', rem: 10, qty: 4, cost: 6, batchNo: 'LOT-1', expiry: '2027-05-01' },
      { itemId: 'i2', rem: 5, qty: 5, cost: 2, batchNo: '', expiry: '' },
    ];

    const afterSplit = splitIntakeArrivalLine(initial, 0);
    assert.strictEqual(afterSplit.length, 3);
    assert.strictEqual(afterSplit[1].itemId, 'i1');
    assert.strictEqual(afterSplit[1].qty, 6);
    assert.strictEqual(afterSplit[1].batchNo, '');
    assert.strictEqual(afterSplit[1].expiry, '');
    assert.strictEqual(totalAllocatedForItem(afterSplit, 'i1'), 10);

    // Splitting again when already 100% allocated sets qty to 0
    const thirdSplit = splitIntakeArrivalLine(afterSplit, 1);
    assert.strictEqual(thirdSplit.length, 4);
    assert.strictEqual(thirdSplit[2].qty, 0);
  });

  test('buildIntakeArrivalLines preserves ALL split lot rows when editing an existing arrival', () => {
    const intake: Intake = {
      id: 'int1',
      no: 'PUR-001',
      date: '2026-11-10',
      providerId: 'p1',
      branchId: 'b1',
      lines: [
        { itemId: 'i1', qty: 10, cost: 6 },
        { itemId: 'i2', qty: 5, cost: 2 },
      ],
      total: 70,
    };

    const editingArrival: Arrival = {
      id: 'arr1',
      no: 'ARR-001',
      date: '2026-11-12',
      intakeId: 'int1',
      branchId: 'b1',
      lines: [
        { itemId: 'i1', qty: 4, cost: 6, batchNo: 'LOT-A', expiry: '2027-03-01' },
        { itemId: 'i1', qty: 6, cost: 6, batchNo: 'LOT-B', expiry: '2028-06-01' },
      ],
    };

    const loaded = buildIntakeArrivalLines(intake, [editingArrival], editingArrival);
    // 2 split rows for i1 + 1 unarrived row (at qty 0) for i2
    assert.strictEqual(loaded.length, 3);
    assert.strictEqual(loaded[0].batchNo, 'LOT-A');
    assert.strictEqual(loaded[0].qty, 4);
    assert.strictEqual(loaded[1].batchNo, 'LOT-B');
    assert.strictEqual(loaded[1].qty, 6);
    assert.strictEqual(loaded[2].itemId, 'i2');
    assert.strictEqual(loaded[2].qty, 0);
    assert.strictEqual(loaded[2].rem, 5);
  });

  test('validateIntakeArrivalSave sums split rows per item and rejects over-arrival', () => {
    const intake: Intake = {
      id: 'int1',
      no: 'PUR-001',
      date: '2026-11-10',
      providerId: 'p1',
      branchId: 'b1',
      lines: [{ itemId: 'i1', qty: 10, cost: 6 }],
      total: 60,
    };

    // Valid split: 4 + 6 = 10
    const okRes = validateIntakeArrivalSave({
      lines: [
        { itemId: 'i1', rem: 10, qty: 4, cost: 6, batchNo: 'LOT-A', expiry: '2027-01-01' },
        { itemId: 'i1', rem: 10, qty: 6, cost: 6, batchNo: 'LOT-B', expiry: '2028-01-01' },
      ],
      intake,
      arrivals: [],
      editingArrival: null,
      stocks: [],
      items,
      t,
    });
    assert.strictEqual(okRes.ok, true);
    if (okRes.ok) {
      assert.strictEqual(okRes.validLines.length, 2);
    }

    // Invalid split: 6 + 6 = 12 > 10 (each row alone is <= 10, sum exceeds!)
    const failRes = validateIntakeArrivalSave({
      lines: [
        { itemId: 'i1', rem: 10, qty: 6, cost: 6, batchNo: 'LOT-A', expiry: '2027-01-01' },
        { itemId: 'i1', rem: 10, qty: 6, cost: 6, batchNo: 'LOT-B', expiry: '2028-01-01' },
      ],
      intake,
      arrivals: [],
      editingArrival: null,
      stocks: [],
      items,
      t,
    });
    assert.strictEqual(failRes.ok, false);
    if (!failRes.ok) {
      assert.match(failRes.message, /12 > 10/);
    }
  });

  test('validateStockReductionOnEdit distinguishes lots by batchNo AND expiry', () => {
    const editingArrival: Arrival = {
      id: 'arr1',
      no: 'ARR-001',
      date: '2026-11-12',
      intakeId: 'int1',
      branchId: 'b1',
      lines: [
        { itemId: 'i1', qty: 5, cost: 6, batchNo: 'SAME', expiry: '2027-01-01' },
        { itemId: 'i1', qty: 5, cost: 6, batchNo: 'SAME', expiry: '2028-01-01' },
      ],
    };

    const stocks: StockBatch[] = [
      { id: 's1', itemId: 'i1', branchId: 'b1', batchNo: 'SAME', expiry: '2027-01-01', qty: 2, cost: 6 },
      { id: 's2', itemId: 'i1', branchId: 'b1', batchNo: 'SAME', expiry: '2028-01-01', qty: 5, cost: 6 },
    ];

    // Reducing expiry 2027-01-01 by 3 when only 2 remain in stock -> rejected
    const blocked = validateStockReductionOnEdit(
      editingArrival,
      [
        { itemId: 'i1', qty: 2, cost: 6, batchNo: 'SAME', expiry: '2027-01-01' },
        { itemId: 'i1', qty: 5, cost: 6, batchNo: 'SAME', expiry: '2028-01-01' },
      ],
      stocks,
      items
    );
    assert.strictEqual(blocked.ok, false);

    // Reducing expiry 2028-01-01 by 3 when 5 remain in stock -> allowed
    const allowed = validateStockReductionOnEdit(
      editingArrival,
      [
        { itemId: 'i1', qty: 5, cost: 6, batchNo: 'SAME', expiry: '2027-01-01' },
        { itemId: 'i1', qty: 2, cost: 6, batchNo: 'SAME', expiry: '2028-01-01' },
      ],
      stocks,
      items
    );
    assert.strictEqual(allowed.ok, true);
  });
});
