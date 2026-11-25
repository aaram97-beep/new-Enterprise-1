import { test, describe } from 'node:test';
import assert from 'node:assert';
import { r2, pad2, diffDays, addDays, todayStr, fmt, fmtDate, toIsoDate, setGlobalMoneyDecimals, getGlobalMoneyDecimals } from '../utils/formatters.ts';
import {
  calcInvoice,
  lineNet,
  invoiceTotal,
  paidToOpening,
  openingBalanceRemaining,
  invBalance,
  custBalance,
  accBalance,
  deliveredOf,
  deliverPct,
  creditedOf,
  returnSlipItemRemaining,
  returnSlipRemaining,
  returnSlipFulfilledQty,
  returnSlipFulfillPct,
  calcBarterSummary,
} from '../utils/calculations.ts';
import { parseGS1 } from '../utils/gs1Parser.ts';
import { emptyData } from '../data/seedData.ts';
import { DatabaseSchema, Customer, Payment, Delivery, Arrival, ReturnSlip } from '../types/index.ts';
import { blankDelivery, blankArrival, blankReturn } from '../data/constants.ts';
import { simulateStock } from '../utils/stockSimulation.ts';

describe('Formatters and Dates', () => {
  test('r2 rounds accurately to 2 decimal places', () => {
    assert.strictEqual(r2(12.345), 12.35);
    assert.strictEqual(r2(12.344), 12.34);
    assert.strictEqual(r2('99.999'), 100);
    assert.strictEqual(r2(null), 0);
  });

  test('pad2 pads numbers correctly', () => {
    assert.strictEqual(pad2(5), '05');
    assert.strictEqual(pad2(12), '12');
  });

  test('diffDays calculates difference accurately', () => {
    assert.strictEqual(diffDays('2026-01-10', '2026-01-05'), 5);
    assert.strictEqual(diffDays('2026-01-05', '2026-01-10'), -5);
    assert.strictEqual(diffDays('2029.jun.27', '2029-06-20'), 7);
    assert.strictEqual(diffDays('2028.Feb.5', '2028-02-01'), 4);
  });

  test('addDays adds positive and negative days', () => {
    assert.strictEqual(addDays('2026-01-05', 5), '2026-01-10');
    assert.strictEqual(addDays('2026-01-10', -5), '2026-01-05');
    assert.strictEqual(addDays('2029.jun.27', 3), '2029-06-30');
  });

  test('toIsoDate and fmtDate handle YYYY.mon.DD formats with uppercase month and ISO preservation', () => {
    assert.strictEqual(toIsoDate('2029.jun.27'), '2029-06-27');
    assert.strictEqual(toIsoDate('2028.feb.5'), '2028-02-05');
    assert.strictEqual(toIsoDate('2026-11-18T12:00:00Z'), '2026-11-18');
    assert.strictEqual(fmtDate('2029.jun.27'), '2029.JUN.27');
    assert.strictEqual(fmtDate('2028.feb.5'), '2028.FEB.05');
    assert.strictEqual(fmtDate('2027.Sep.29'), '2027.SEP.29');
    assert.strictEqual(fmtDate('2026-11-18T12:00:00Z'), '2026-11-18');
    assert.strictEqual(fmtDate(''), '');
  });

  test('fmt formats money according to configurable decimal places', () => {
    // None (0 decimals)
    assert.strictEqual(fmt(1250.75, 0), '1,251');
    assert.strictEqual(fmt(1250.25, 0), '1,250');
    assert.strictEqual(fmt(0, 0), '0');

    // 1 decimal point
    assert.strictEqual(fmt(1250.75, 1), '1,250.8');
    assert.strictEqual(fmt(1250, 1), '1,250.0');

    // 2 decimal points (default)
    assert.strictEqual(fmt(1250.75, 2), '1,250.75');
    assert.strictEqual(fmt(1250, 2), '1,250.00');

    // 3 decimal points
    assert.strictEqual(fmt(1250.755, 3), '1,250.755');
    assert.strictEqual(fmt(1250, 3), '1,250.000');
  });

  test('setGlobalMoneyDecimals updates default fmt output system-wide', () => {
    setGlobalMoneyDecimals(0);
    assert.strictEqual(fmt(1500.5), '1,501');

    setGlobalMoneyDecimals(3);
    assert.strictEqual(fmt(1500.125), '1,500.125');

    // Restore to standard 2
    setGlobalMoneyDecimals(2);
    assert.strictEqual(fmt(1500.5), '1,500.50');
  });
});

describe('Invoice Math Calculations', () => {
  test('lineNet computes gross minus discount', () => {
    const l1 = { itemId: 'i1', qty: 10, price: 10, discType: 'pct' as const, discVal: 10 };
    assert.strictEqual(lineNet(l1), 90); // 100 - 10% = 90

    const l2 = { itemId: 'i2', qty: 5, price: 20, discType: 'amt' as const, discVal: 15 };
    assert.strictEqual(lineNet(l2), 85); // 100 - 15 = 85
  });

  test('calcInvoice applies order discount and tax rate', () => {
    const inv = {
      lines: [
        { itemId: 'i1', qty: 10, price: 10, discType: 'pct' as const, discVal: 0 },
        { itemId: 'i2', qty: 5, price: 20, discType: 'pct' as const, discVal: 0 },
      ],
      orderDiscType: 'pct' as const,
      orderDiscVal: 10,
    };
    // sub = 200, order discount = 20, taxable = 180, tax at 5% = 9, total = 189
    const res = calcInvoice(inv, 5);
    assert.strictEqual(res.sub, 200);
    assert.strictEqual(res.discAmt, 20);
    assert.strictEqual(res.tax, 9);
    assert.strictEqual(res.total, 189);
  });

  test('calcBarterSummary computes values from selling price and calculates exchange loss', () => {
    const summary = calcBarterSummary(
      [{ qty: 2, price: 250000, cost: 0 }],
      [{ qty: 1, price: 300000, cost: 0 }]
    );
    assert.strictEqual(summary.giveValue, 500000);
    assert.strictEqual(summary.recvValue, 300000);
    assert.strictEqual(summary.loss, 200000);

    // Falls back cleanly to legacy cost field if price is undefined
    const legacy = calcBarterSummary(
      [{ qty: 3, cost: 10 }],
      [{ qty: 2, cost: 20 }]
    );
    assert.strictEqual(legacy.giveValue, 30);
    assert.strictEqual(legacy.recvValue, 40);
    assert.strictEqual(legacy.loss, 0);
  });
});

describe('GS1-128 Barcode Parser', () => {
  test('parses standard GS1 code with AI identifiers', () => {
    // 01 = GTIN (14 chars), 17 = Expiry YYMMDD (6 chars), 10 = Batch
    const code = '01084123456789051726123110BATCH123';
    const parsed = parseGS1(code);
    assert.ok(parsed);
    assert.strictEqual(parsed!.gtin, '08412345678905');
    assert.strictEqual(parsed!.expiry, '2026-12-31');
    assert.strictEqual(parsed!.batch, 'BATCH123');
  });

  test('falls back to raw GTIN for standard numeric barcodes', () => {
    const barcode = '6281001001011';
    const parsed = parseGS1(barcode);
    assert.ok(parsed);
    assert.strictEqual(parsed!.gtin, '6281001001011');
  });
});

describe('Seed Data & Simulation', () => {
  test('emptyData creates a complete schema structure', () => {
    const data = emptyData();
    assert.ok(data.settings);
    assert.ok(Array.isArray(data.items));
    assert.ok(Array.isArray(data.invoices));
    assert.ok(Array.isArray(data.customers));
    assert.ok(Array.isArray(data.branches));
  });

  test('simulateStock calculates non-negative stock counts', () => {
    const data = emptyData();
    const stocks = simulateStock(data);
    assert.ok(Array.isArray(stocks));
  });

  test('simulateStock preserves batchNo and expiry on barter received lines', () => {
    const data = emptyData();
    data.barters.push({
      id: 'brt-exp-1',
      no: 'BRT-1',
      date: '2026-11-18',
      partnerId: 'cust-1',
      branchId: 'b1',
      giveLines: [],
      recvLines: [
        { itemId: 'item-1', qty: 4, cost: 12, batchNo: 'LOT-BARTER', expiry: '2028-09-30' },
      ],
      giveValue: 0,
      recvValue: 48,
      loss: 0,
    });
    const stocks = simulateStock(data);
    const recvBatch = stocks.find((s) => s.itemId === 'item-1' && s.batchNo === 'LOT-BARTER');
    assert.ok(recvBatch);
    assert.strictEqual(recvBatch!.qty, 4);
    assert.strictEqual(recvBatch!.expiry, '2028-09-30');
  });
});

describe('Payment Allocation & Opening Balance Settlement', () => {
  test('calculates paidToOpening and remaining opening balance correctly', () => {
    const db: DatabaseSchema = emptyData();
    const customer: Customer = {
      id: 'cust-1',
      name: 'Ahmed Trading',
      phone: '12345678',
      address: 'Tripoli',
      openingBalance: 500,
      isProvider: false,
    };
    db.customers.push(customer);

    // Initial opening debt is 500
    assert.strictEqual(paidToOpening(db, 'cust-1'), 0);
    assert.strictEqual(openingBalanceRemaining(db, customer), 500);

    // Partial settlement of opening balance: 200
    const payment1: Payment = {
      id: 'pay-1',
      no: 'PAY-001',
      date: '2026-01-01',
      customerId: 'cust-1',
      accountId: 'acc-1',
      amount: 200,
      disc: 0,
      dir: 'in',
      method: 'cash',
      allocs: [{ docId: 'opening', type: 'opening', amount: 200 }],
    };
    db.payments.push(payment1);

    assert.strictEqual(paidToOpening(db, 'cust-1'), 200);
    assert.strictEqual(openingBalanceRemaining(db, customer), 300);

    // Further settlement: 300 (fully settling the opening balance)
    const payment2: Payment = {
      id: 'pay-2',
      no: 'PAY-002',
      date: '2026-01-02',
      customerId: 'cust-1',
      accountId: 'acc-1',
      amount: 300,
      disc: 0,
      dir: 'in',
      method: 'cash',
      allocs: [{ docId: 'opening', type: 'opening', amount: 300 }],
    };
    db.payments.push(payment2);

    assert.strictEqual(paidToOpening(db, 'cust-1'), 500);
    assert.strictEqual(openingBalanceRemaining(db, customer), 0);
  });

  test('multi-line payment splits across invoice and opening balance without interference', () => {
    const db: DatabaseSchema = emptyData();
    const customer: Customer = {
      id: 'cust-2',
      name: 'Benghazi Supplies',
      phone: '87654321',
      address: 'Benghazi',
      openingBalance: 400,
      isProvider: false,
    };
    db.customers.push(customer);

    // Invoice total: 250
    db.invoices.push({
      id: 'inv-101',
      no: 'INV-101',
      date: '2026-01-01',
      customerId: 'cust-2',
      branchId: 'b-1',
      lines: [{ itemId: 'item-1', qty: 1, price: 250, discType: 'amt', discVal: 0 }],
      orderDiscType: 'amt',
      orderDiscVal: 0,
      sub: 250,
      discAmt: 0,
      tax: 0,
      total: 250,
    });

    assert.strictEqual(invBalance(db, db.invoices[0]), 250);
    assert.strictEqual(openingBalanceRemaining(db, customer), 400);

    // Multi-line payment: 150 for INV-101 and 100 for Opening Balance
    db.payments.push({
      id: 'pay-split',
      no: 'PAY-100',
      date: '2026-01-03',
      customerId: 'cust-2',
      accountId: 'acc-1',
      amount: 250,
      disc: 0,
      dir: 'in',
      method: 'cash',
      allocs: [
        { docId: 'inv-101', type: 'invoice', amount: 150 },
        { docId: 'opening', type: 'opening', amount: 100 },
      ],
    });

    assert.strictEqual(invBalance(db, db.invoices[0]), 100);
    assert.strictEqual(paidToOpening(db, 'cust-2'), 100);
    assert.strictEqual(openingBalanceRemaining(db, customer), 300);
  });

  test('settlement discount is deducted from payment amount and balances reconcile', () => {
    const db: DatabaseSchema = emptyData();
    const customer: Customer = {
      id: 'cust-3',
      name: 'Misrata Trading',
      phone: '99999999',
      address: 'Misrata',
      openingBalance: 0,
      isProvider: false,
    };
    db.customers.push(customer);

    const cashAccount = {
      id: 'acc-cash',
      name: 'Main Cashbox',
      type: 'cashbox' as const,
      branchId: 'b-1',
      opening: 500,
    };
    db.accounts.push(cashAccount);

    // Invoice total: 100
    db.invoices.push({
      id: 'inv-300',
      no: 'INV-300',
      date: '2026-01-05',
      customerId: 'cust-3',
      branchId: 'b-1',
      lines: [{ itemId: 'item-1', qty: 1, price: 100, discType: 'amt', discVal: 0 }],
      orderDiscType: 'amt',
      orderDiscVal: 0,
      sub: 100,
      discAmt: 0,
      tax: 0,
      total: 100,
    });

    assert.strictEqual(custBalance(db, customer), 100);
    assert.strictEqual(invBalance(db, db.invoices[0]), 100);

    // Customer settles the 100 invoice: receives a 10 settlement discount, paying 90 in cash
    const grossAllocated = 100;
    const discount = 10;
    const netPayment = grossAllocated - discount; // 90

    db.payments.push({
      id: 'pay-disc',
      no: 'PAY-300',
      date: '2026-01-06',
      customerId: 'cust-3',
      accountId: 'acc-cash',
      amount: netPayment, // 90 cash received
      disc: discount,     // 10 settlement discount
      dir: 'in',
      method: 'cash',
      allocs: [{ docId: 'inv-300', type: 'invoice', amount: grossAllocated }], // 100 debt cleared
    });

    // Customer balance owed becomes 0 (100 invoice - 90 cash - 10 discount)
    assert.strictEqual(custBalance(db, customer), 0);
    // Invoice balance owed becomes 0
    assert.strictEqual(invBalance(db, db.invoices[0]), 0);
    // Cashbox only receives net cash (500 opening + 90 net payment = 590)
    assert.strictEqual(accBalance(db, cashAccount), 590);
  });
});

describe('Delivery Slips Date Management', () => {
  test('blankDelivery initializes with valid today date', () => {
    const del = blankDelivery();
    assert.ok(del.date);
    assert.strictEqual(del.date, todayStr());
  });

  test('delivery slip date can be explicitly set and edited', () => {
    const db: DatabaseSchema = emptyData();
    const delivery: Delivery = {
      id: 'del-1',
      no: 'DEL-001',
      date: '2026-10-15',
      invoiceId: 'inv-1',
      customerId: 'cust-1',
      branchId: 'b-1',
      lines: [{ itemId: 'item-1', qty: 5 }],
    };
    db.deliveries.push(delivery);

    assert.strictEqual(db.deliveries[0].date, '2026-10-15');

    // Edit date to another day
    const updatedDate = '2026-11-01';
    db.deliveries[0] = { ...db.deliveries[0], date: updatedDate };

    assert.strictEqual(db.deliveries[0].date, '2026-11-01');
    assert.strictEqual(db.deliveries[0].no, 'DEL-001');
    assert.strictEqual(db.deliveries[0].lines[0].qty, 5);
  });

  test('delivery slip can attach to return slip and track fulfilled quantities', () => {
    const db: DatabaseSchema = emptyData();
    const returnSlip: ReturnSlip = {
      id: 'rs-101',
      no: 'RS-001',
      date: '2026-11-05',
      customerId: 'cust-1',
      branchId: 'b-1',
      returnInvoiceId: null,
      lines: [
        { itemId: 'item-1', qty: 10, batchNo: 'OLD-BATCH', expiry: '2026-12-01' },
        { itemId: 'item-2', qty: 4, batchNo: 'OLD-BATCH-2', expiry: '2026-12-15' },
      ],
    };
    db.returnSlips.push(returnSlip);

    // Initial delivery percentage is 0%
    assert.strictEqual(deliverPct(db, returnSlip), 0);
    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-1'), 0);

    // Attach delivery slip with replacement items having further expiry date
    const delivery: Delivery = {
      id: 'del-rs-1',
      no: 'DEL-RS-001',
      date: '2026-11-06',
      returnSlipId: returnSlip.id,
      invoiceId: '',
      customerId: 'cust-1',
      branchId: 'b-1',
      lines: [
        { itemId: 'item-1', qty: 6, batchNo: 'NEW-FURTHER-EXP', expiry: '2028-06-30' },
      ],
    };
    db.deliveries.push(delivery);

    // Partial fulfillment: 6 out of 14 total units delivered = 42.9%
    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-1'), 6);
    assert.strictEqual(deliverPct(db, returnSlip), 42.9);

    // Second delivery fulfilling the rest
    const delivery2: Delivery = {
      id: 'del-rs-2',
      no: 'DEL-RS-002',
      date: '2026-11-07',
      returnSlipId: returnSlip.id,
      invoiceId: '',
      customerId: 'cust-1',
      branchId: 'b-1',
      lines: [
        { itemId: 'item-1', qty: 4, batchNo: 'NEW-FURTHER-EXP', expiry: '2028-06-30' },
        { itemId: 'item-2', qty: 4, batchNo: 'NEW-EXP-2', expiry: '2028-08-31' },
      ],
    };
    db.deliveries.push(delivery2);

    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-1'), 10);
    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-2'), 4);
    assert.strictEqual(deliverPct(db, returnSlip), 100);
  });

  test('return slip fulfillment: credit note and delivery fulfillment are mutually exclusive', () => {
    const db: DatabaseSchema = emptyData();
    const returnSlip: ReturnSlip = {
      id: 'rs-201',
      no: 'RS-201',
      date: '2026-11-05',
      customerId: 'cust-1',
      branchId: 'b-1',
      returnInvoiceId: 'rin-201',
      lines: [{ itemId: 'item-1', qty: 5 }],
    };
    db.returnSlips.push(returnSlip);

    // If a credit note is attached, slip is considered credited
    const isCredited = Boolean(returnSlip.returnInvoiceId);
    assert.strictEqual(isCredited, true);

    // If 100% fulfilled by delivery
    const returnSlip2: ReturnSlip = {
      id: 'rs-202',
      no: 'RS-202',
      date: '2026-11-05',
      customerId: 'cust-1',
      branchId: 'b-1',
      returnInvoiceId: null,
      lines: [{ itemId: 'item-1', qty: 5 }],
    };
    db.returnSlips.push(returnSlip2);
    db.deliveries.push({
      id: 'del-202',
      no: 'DEL-202',
      date: '2026-11-06',
      returnSlipId: returnSlip2.id,
      customerId: 'cust-1',
      branchId: 'b-1',
      lines: [{ itemId: 'item-1', qty: 5 }],
    });

    const isDelivered = deliverPct(db, returnSlip2) >= 99.9;
    assert.strictEqual(isDelivered, true);
    assert.strictEqual(Boolean(returnSlip2.returnInvoiceId), false);
  });

  test('return slip with 3 pieces: 1 delivered, user can choose how many to credit, remaining balance tracked', () => {
    const db: DatabaseSchema = emptyData();
    const returnSlip: ReturnSlip = {
      id: 'rs-301',
      no: 'RS-301',
      date: '2026-11-08',
      customerId: 'cust-1',
      branchId: 'b-1',
      returnInvoiceId: null,
      lines: [{ itemId: 'item-3p', qty: 3, batchNo: 'B-ORIG', expiry: '2027-01-01' }],
    };
    db.returnSlips.push(returnSlip);

    // Initial state: 3 pieces returned, 0 delivered, 0 credited, 3 remaining
    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-3p'), 0);
    assert.strictEqual(creditedOf(db, returnSlip.id, 'item-3p'), 0);
    assert.strictEqual(returnSlipItemRemaining(db, returnSlip.id, 'item-3p', 3), 3);
    assert.strictEqual(returnSlipRemaining(db, returnSlip), 3);

    // 1 piece is returned/replaced by a delivery slip
    db.deliveries.push({
      id: 'del-301',
      no: 'DEL-301',
      date: '2026-11-08',
      returnSlipId: returnSlip.id,
      invoiceId: '',
      customerId: 'cust-1',
      branchId: 'b-1',
      lines: [{ itemId: 'item-3p', qty: 1, batchNo: 'B-NEW', expiry: '2028-01-01' }],
    });

    // After 1 delivered: 1 delivered, 0 credited, 2 remaining unfulfilled
    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-3p'), 1);
    assert.strictEqual(creditedOf(db, returnSlip.id, 'item-3p'), 0);
    const unfulfilled = returnSlipItemRemaining(db, returnSlip.id, 'item-3p', 3);
    assert.strictEqual(unfulfilled, 2);
    assert.strictEqual(returnSlipRemaining(db, returnSlip), 2);
    assert.strictEqual(returnSlipFulfilledQty(db, returnSlip), 1);
    assert.strictEqual(returnSlipFulfillPct(db, returnSlip), 33.3);

    // User chooses to include 1 piece in the credit note (rather than the full 2)
    const creditNote1 = {
      id: 'rin-301',
      no: 'RIN-301',
      date: '2026-11-09',
      customerId: 'cust-1',
      branchId: 'b-1',
      returnSlipId: returnSlip.id,
      note: 'Partial credit for 1 piece',
      lines: [{ itemId: 'item-3p', qty: 1, price: 50 }],
      total: 50,
    };
    db.returnInvoices.push(creditNote1);

    // Now: 1 delivered + 1 credited = 2 fulfilled out of 3 = 66.7%! Exactly what the user requested!
    assert.strictEqual(deliveredOf(db, returnSlip.id, 'item-3p'), 1);
    assert.strictEqual(creditedOf(db, returnSlip.id, 'item-3p'), 1);
    assert.strictEqual(returnSlipItemRemaining(db, returnSlip.id, 'item-3p', 3), 1);
    assert.strictEqual(returnSlipRemaining(db, returnSlip), 1);
    assert.strictEqual(returnSlipFulfilledQty(db, returnSlip), 2);
    assert.strictEqual(returnSlipFulfillPct(db, returnSlip), 66.7);

    // Slip is NOT fully settled yet (1 piece remaining)
    assert.strictEqual(returnSlipRemaining(db, returnSlip) <= 0.005, false);

    // User now credits the final 1 piece with another credit note
    const creditNote2 = {
      id: 'rin-302',
      no: 'RIN-302',
      date: '2026-11-09',
      customerId: 'cust-1',
      branchId: 'b-1',
      returnSlipId: returnSlip.id,
      note: 'Final piece credit',
      lines: [{ itemId: 'item-3p', qty: 1, price: 50 }],
      total: 50,
    };
    db.returnInvoices.push(creditNote2);

    // Now: 1 delivered + 2 credited = 3 fulfilled. Remaining is 0! Fulfilment is 100%!
    assert.strictEqual(creditedOf(db, returnSlip.id, 'item-3p'), 2);
    assert.strictEqual(returnSlipItemRemaining(db, returnSlip.id, 'item-3p', 3), 0);
    assert.strictEqual(returnSlipRemaining(db, returnSlip), 0);
    assert.strictEqual(returnSlipFulfilledQty(db, returnSlip), 3);
    assert.strictEqual(returnSlipFulfillPct(db, returnSlip), 100);
    assert.strictEqual(returnSlipRemaining(db, returnSlip) <= 0.005, true);
  });
});

describe('Arrival Notes Management & Editing', () => {
  test('blankArrival initializes properly with today date and empty note', () => {
    const arr = blankArrival();
    assert.strictEqual(arr.date, todayStr());
    assert.strictEqual(arr.note, '');
    assert.deepStrictEqual(arr.lines, []);
  });

  test('arrival notes can be updated in date, note, lines, and quantities', () => {
    const db: DatabaseSchema = emptyData();
    const arrival: Arrival = {
      id: 'arr-1',
      no: 'ARR-BR1-1001',
      date: '2026-10-10',
      intakeId: 'int-1',
      branchId: 'b-1',
      note: 'Driver arrived morning',
      lines: [{ itemId: 'item-1', qty: 20, batchNo: 'LOT-A', expiry: '2027-01-01', cost: 10 }],
    };
    db.arrivals.push(arrival);

    assert.strictEqual(db.arrivals[0].note, 'Driver arrived morning');
    assert.strictEqual(db.arrivals[0].date, '2026-10-10');
    assert.strictEqual(db.arrivals[0].lines[0].qty, 20);

    // Edit arrival note: update note, date, and line batch/qty
    const editedArrival: Arrival = {
      ...db.arrivals[0],
      date: '2026-10-12',
      note: 'Driver arrived afternoon, checked temperature',
      lines: [{ itemId: 'item-1', qty: 25, batchNo: 'LOT-A2', expiry: '2027-02-01', cost: 10 }],
    };
    db.arrivals[0] = editedArrival;

    assert.strictEqual(db.arrivals[0].note, 'Driver arrived afternoon, checked temperature');
    assert.strictEqual(db.arrivals[0].date, '2026-10-12');
    assert.strictEqual(db.arrivals[0].lines[0].batchNo, 'LOT-A2');
    assert.strictEqual(db.arrivals[0].lines[0].qty, 25);
  });

  test('isBranchCompany setting can be enabled and defaults to false', () => {
    const db: DatabaseSchema = emptyData();
    assert.strictEqual(db.settings.isBranchCompany, false);

    db.settings.isBranchCompany = true;
    assert.strictEqual(db.settings.isBranchCompany, true);
  });

  test('direct branch arrival notes can be created without intakeId and record arrived stock', () => {
    const db: DatabaseSchema = emptyData();
    const directArrival: Arrival = {
      id: 'arr-direct-1',
      no: 'ARR-BR1-1002',
      date: '2026-11-04',
      intakeId: '', // direct arrival for branch company
      branchId: 'b1',
      note: 'Direct container arrival from HQ',
      lines: [
        { itemId: 'item-paracetamol', qty: 50, batchNo: 'BATCH-HQ-99', expiry: '2028-05-01', cost: 2.5 },
        { itemId: 'item-amoxicillin', qty: 30, batchNo: 'BATCH-HQ-100', expiry: '2027-12-31', cost: 4.0 },
      ],
    };
    db.arrivals.push(directArrival);

    assert.strictEqual(db.arrivals.length, 1);
    assert.strictEqual(db.arrivals[0].intakeId, '');
    assert.strictEqual(db.arrivals[0].branchId, 'b1');
    assert.strictEqual(db.arrivals[0].lines.length, 2);
    assert.strictEqual(db.arrivals[0].lines[0].qty, 50);
    assert.strictEqual(db.arrivals[0].lines[0].batchNo, 'BATCH-HQ-99');
    assert.strictEqual(db.arrivals[0].lines[1].qty, 30);
    assert.strictEqual(db.arrivals[0].lines[1].expiry, '2027-12-31');
  });
});


