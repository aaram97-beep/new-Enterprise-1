import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeliveryBatchGroups,
  getBatchesForDeliveryItem,
  buildDeliverySourceItemOptions,
  pickDeliveryItemForLine,
  splitDeliveryBatchLine,
  hasAnyAvailableDeliveryBatch,
  appendBlankDeliveryLine,
} from '../utils/deliveryHelpers';
import { parseDiscountInput } from '../utils/formatters';
import type { Item, StockBatch } from '../types';

const makeItem = (id: string, name: string): Item => ({
  id,
  sku: id.toUpperCase(),
  name,
  company: 'ACME',
  group: 'Med',
  cost: 10,
  price: 15,
  reorder: 0,
  barcode: '',
  note: '',
  batch: true,
});

const items: Item[] = [
  makeItem('item-1', 'Amoxicillin 500mg'),
  makeItem('item-2', 'Paracetamol 500mg'),
  makeItem('item-3', 'Unrelated Syrup'),
];

const stocks: StockBatch[] = [
  { id: 's1', itemId: 'item-1', branchId: 'br1', batchNo: 'A1', expiry: '2027-06-01', qty: 20, cost: 10 },
  { id: 's2', itemId: 'item-1', branchId: 'br1', batchNo: 'A2', expiry: '2027-01-01', qty: 15, cost: 10 },
  { id: 's3', itemId: 'item-2', branchId: 'br1', batchNo: 'P1', expiry: '2028-02-01', qty: 10, cost: 5 },
  { id: 's4', itemId: 'item-2', branchId: 'br1', batchNo: 'P0', expiry: '2026-12-01', qty: 0, cost: 5 },
  { id: 's5', itemId: 'item-3', branchId: 'br1', batchNo: 'U1', expiry: '2027-05-01', qty: 30, cost: 8 },
  { id: 's6', itemId: 'item-2', branchId: 'br2', batchNo: 'P-BR2', expiry: '2027-05-01', qty: 9, cost: 5 },
];

test('getBatchesForDeliveryItem filters strictly to selected item and branch in FEFO / return order', () => {
  const fefo = getBatchesForDeliveryItem({
    branchId: 'br1',
    itemId: 'item-1',
    stocks,
  });
  assert.deepEqual(fefo.map((b) => b.id), ['s2', 's1']);

  const retOrder = getBatchesForDeliveryItem({
    branchId: 'br1',
    itemId: 'item-2',
    stocks,
    selectedStockId: 's4',
    prioritizeFurtherExpiry: true,
  });
  assert.deepEqual(retOrder.map((b) => b.id), ['s3', 's4']);
});

test('buildDeliverySourceItemOptions scopes items to source doc and puts unfulfilled items first', () => {
  const options = buildDeliverySourceItemOptions({
    sourceItemIds: ['item-1', 'item-2', 'item-1'],
    branchId: 'br1',
    stocks,
    items,
    remainingByItem: { 'item-1': 0, 'item-2': 6 },
    labels: { rem: 'Remaining', stock: 'Stock' },
  });

  assert.equal(options.length, 2);
  assert.equal(options[0].id, 'item-2');
  assert.match(options[0].sub, /Remaining: 6/);
  assert.match(options[0].sub, /Stock: 10/);
  assert.equal(options[1].id, 'item-1');
});

test('pickDeliveryItemForLine selects preferred unused batch and remaining qty capped to batch stock', () => {
  const lines = [
    { itemId: 'item-1', stockId: 's2', qty: 15 },
    { itemId: '', stockId: '', qty: 0 },
  ];
  const next = pickDeliveryItemForLine({
    lines,
    index: 1,
    itemId: 'item-1',
    branchId: 'br1',
    stocks,
    balanceBeforeByItem: { 'item-1': 25 },
  });

  assert.equal(next[1].itemId, 'item-1');
  assert.equal(next[1].stockId, 's1'); // Skips already-used s2
  assert.equal(next[1].qty, 10); // 25 - 15 = 10 remaining
});

test('splitDeliveryBatchLine clamps over-allocated batch to available stock and splits remainder to next lot', () => {
  const lines = [{ itemId: 'item-1', stockId: 's2', qty: 22 }]; // s2 only has 15 avail
  const split = splitDeliveryBatchLine({
    lines,
    index: 0,
    branchId: 'br1',
    stocks,
    balanceBeforeByItem: { 'item-1': 22 },
  });

  assert.equal(split.length, 2);
  assert.deepEqual(split[0], { itemId: 'item-1', stockId: 's2', qty: 15 });
  assert.deepEqual(split[1], { itemId: 'item-1', stockId: 's1', qty: 7 });
});

test('splitDeliveryBatchLine allocates unfulfilled remainder when splitting a partial row', () => {
  const lines = [{ itemId: 'item-1', stockId: 's2', qty: 5 }];
  const split = splitDeliveryBatchLine({
    lines,
    index: 0,
    branchId: 'br1',
    stocks,
    balanceBeforeByItem: { 'item-1': 12 },
  });

  assert.equal(split.length, 2);
  assert.deepEqual(split[0], { itemId: 'item-1', stockId: 's2', qty: 5 });
  assert.deepEqual(split[1], { itemId: 'item-1', stockId: 's1', qty: 7 });
});

test('getDeliveryBatchGroups returns batches for all source items (not locked to last item) in FEFO order', () => {
  const groups = getDeliveryBatchGroups({
    branchId: 'br1',
    sourceItemIds: ['item-1', 'item-2'],
    stocks,
    items,
  });

  assert.equal(groups.length, 2);
  assert.equal(groups[0].item.id, 'item-1');
  assert.deepEqual(
    groups[0].batches.map((b) => b.id),
    ['s2', 's1']
  );
  assert.equal(groups[1].item.id, 'item-2');
  assert.deepEqual(
    groups[1].batches.map((b) => b.id),
    ['s3']
  );
});

test('getDeliveryBatchGroups prioritizes further expiry when delivering for Return Slip and preserves depleted selected batch on edit', () => {
  const groups = getDeliveryBatchGroups({
    branchId: 'br1',
    sourceItemIds: ['item-1', 'item-2'],
    stocks,
    items,
    selectedStockId: 's4',
    prioritizeFurtherExpiry: true,
  });

  assert.deepEqual(
    groups[0].batches.map((b) => b.id),
    ['s1', 's2']
  );
  assert.deepEqual(
    groups[1].batches.map((b) => b.id),
    ['s3', 's4']
  );
});

test('appendBlankDeliveryLine leaves itemId and stockId unselected instead of cloning last item batch', () => {
  const updated = appendBlankDeliveryLine([{ itemId: 'item-2', stockId: 's3', qty: 4 }], 0);
  assert.equal(updated.length, 2);
  assert.deepEqual(updated[1], { itemId: '', stockId: '', qty: 0 });
});

test('hasAnyAvailableDeliveryBatch checks branch stock for source items cleanly', () => {
  assert.equal(
    hasAnyAvailableDeliveryBatch({ branchId: 'br1', sourceItemIds: ['item-1', 'item-2'], stocks }),
    true
  );
  assert.equal(
    hasAnyAvailableDeliveryBatch({ branchId: 'br1', sourceItemIds: ['item-99'], stocks }),
    false
  );
});

test('parseDiscountInput allows up to 7 digits and caps an 8th integer digit cleanly', () => {
  assert.deepEqual(parseDiscountInput('', 7), { display: '', numeric: 0 });
  assert.deepEqual(parseDiscountInput('1234567', 7), { display: '1234567', numeric: 1234567 });
  assert.deepEqual(parseDiscountInput('12345678', 7), { display: '1234567', numeric: 1234567 });
  assert.deepEqual(parseDiscountInput('9999999.5', 7), { display: '9999999.5', numeric: 9999999.5 });
  assert.deepEqual(parseDiscountInput('12.5', 7), { display: '12.5', numeric: 12.5 });
  assert.deepEqual(parseDiscountInput('-50', 7), { display: '0', numeric: 0 });
});

test('getBatchesForDeliveryItem sorts YYYY.mon.DD expiry dates chronologically rather than alphabetically', () => {
  const namedMonthStocks: StockBatch[] = [
    { id: 's-feb', itemId: 'item-1', branchId: 'br1', batchNo: 'FEB-LOT', expiry: '2029.feb.10', qty: 5, cost: 10 },
    { id: 's-jan', itemId: 'item-1', branchId: 'br1', batchNo: 'JAN-LOT', expiry: '2029.jan.20', qty: 5, cost: 10 },
  ];
  const fefo = getBatchesForDeliveryItem({
    branchId: 'br1',
    itemId: 'item-1',
    stocks: namedMonthStocks,
  });
  assert.deepEqual(
    fefo.map((b) => b.id),
    ['s-jan', 's-feb']
  );
});
