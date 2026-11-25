import test, { describe } from 'node:test';
import assert from 'node:assert';
import { getStandalonePrintHtml, prHead, prFoot, prCustomerBox, generateDocumentHtml, buildStatementHtml } from '../utils/printService.ts';
import { emptyData } from '../data/seedData.ts';

describe('Print Service and Document Generation', () => {
  test('getStandalonePrintHtml generates a full HTML5 document with A4 styles and auto-print script', () => {
    const bodyContent = '<div class="test-doc">Sample Invoice</div>';
    const html = getStandalonePrintHtml(bodyContent, 'Invoice #INV-001');

    assert.ok(html.includes('<!doctype html>'), 'Must have doctype');
    assert.ok(html.includes('<title>Invoice #INV-001</title>'), 'Must include document title');
    assert.ok(html.includes('pr-a4'), 'Must include A4 class');
    assert.ok(html.includes('Sample Invoice'), 'Must embed body content');
    assert.ok(html.includes('window.print()'), 'Must include print trigger');
    assert.ok(html.includes('size: A4'), 'Must specify A4 print media style');
  });

  test('getStandalonePrintHtml supports RTL for Arabic language', () => {
    const html = getStandalonePrintHtml('<div>محتوى الفاتورة</div>', 'فاتورة', 'ar');
    assert.ok(html.includes('dir="rtl"'), 'Must specify dir=rtl for Arabic');
    assert.ok(html.includes('lang="ar"'), 'Must specify lang=ar for Arabic');
  });

  test('prHead renders company name, document title, and document metadata', () => {
    const db = emptyData();
    db.settings.companyName = 'Apex Global LLC';
    db.settings.phone = '+123456789';

    const header = prHead(db, 'Tax Invoice', { no: 'INV-2026-001', date: '2026-10-24' });

    assert.ok(header.includes('Apex Global LLC'), 'Contains company name');
    assert.ok(header.includes('Tax Invoice'), 'Contains document title');
    assert.ok(header.includes('INV-2026-001'), 'Contains doc number');
    assert.ok(header.includes('2026-10-24'), 'Contains doc date');
    assert.ok(header.includes('+123456789'), 'Contains phone number');
  });

  test('prFoot formats footer with dynamic settings currency', () => {
    const db = emptyData();
    db.settings.currency = 'AED';

    const footer = prFoot(db, 'Thank you for your business.');
    assert.ok(footer.includes('Thank you for your business.'), 'Includes footer text');
    assert.ok(footer.includes('Amounts in AED'), 'Includes dynamic currency');
  });

  test('prCustomerBox displays customer name and contact details', () => {
    const db = emptyData();
    db.customers.push({
      id: 'c-test-1',
      name: 'Falcon Logistics',
      phone: '+971-50-1234567',
      address: 'Industrial Area 4, Sharjah',
      openingBalance: 0,
      isProvider: false,
    });

    const box = prCustomerBox(db, 'c-test-1', 'Billed To');
    assert.ok(box.includes('Falcon Logistics'), 'Customer name present');
    assert.ok(box.includes('Billed To'), 'Label present');
    assert.ok(box.includes('+971-50-1234567'), 'Customer phone present');
    assert.ok(box.includes('Industrial Area 4, Sharjah'), 'Customer address present');
  });

  test('delivery slip renders multi-column Remaining to fulfil invoice table with progressive delivery deductions', () => {
    const db = emptyData();
    db.settings.lang = 'en';

    // Add item
    db.items.push({
      id: 'i-flour',
      name: 'Wheat Flour 2kg',
      barcode: '12345',
      sku: 'FL-2KG',
      company: 'TestCo',
      group: 'Food',
      price: 15,
      cost: 10,
      reorder: 5,
      batch: true,
      note: '',
    });

    // Add invoice with 10 units
    db.invoices.push({
      id: 'inv-100',
      no: 'INV-BR1-1028',
      date: '2026-10-26',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [
        {
          itemId: 'i-flour',
          qty: 10,
          price: 15,
          discType: 'pct',
          discVal: 0,
        },
      ],
      sub: 150,
      orderDiscType: 'amt',
      orderDiscVal: 0,
      discAmt: 0,
      tax: 0,
      total: 150,
      note: '',
    });

    // First delivery slip: DEL-BR1-1001 delivers 5 units
    const del1 = {
      id: 'del-1',
      no: 'DEL-BR1-1001',
      date: '2026-10-26',
      invoiceId: 'inv-100',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [
        {
          itemId: 'i-flour',
          qty: 5,
          batchNo: 'FL-2402',
          expiry: '2027-03-25',
          cost: 10,
        },
      ],
    };
    db.deliveries.push(del1);

    const doc1 = generateDocumentHtml('delivery', del1, db);

    // Verify Title & Table Headers: Column 1 = Items (horizontal exception), subsequent headers are rotated 90 degrees by default
    assert.ok(doc1.html.includes('Remaining to fulfil invoice INV-BR1-1028'), 'Must include fulfillment table title');
    assert.ok(doc1.html.includes('Items</th>'), 'Column 1 must be Items (horizontal)');
    assert.ok(doc1.html.includes('rot-90'), 'Subsequent headers rotated 90 degrees by default');
    assert.ok(doc1.html.includes('Invoiced amount'), 'Column 2 has Invoiced amount header');
    assert.ok(doc1.html.includes('#1001'), 'Column 3 must have slip number stripped of branch code');
    const table1Html = doc1.html.slice(doc1.html.indexOf('<table class="report-table progressive-del-table"'));
    assert.ok(!table1Html.includes('DEL-BR1-1001'), 'Branch information must not appear in the progressive table');
    assert.ok(doc1.html.includes('This Slip'), 'Current slip highlighted with badge');
    assert.ok(doc1.html.includes('Remaining amount'), 'Includes Remaining amount column header');

    // Invoiced quantity is 10, remaining after delivering 5 is 5 (deducted in real time)
    assert.ok(doc1.html.includes('<td class="num font-semibold" style="padding:2.5px 4px;">10</td>'), 'Shows invoiced qty 10 with 2.5px padding');
    assert.ok(doc1.html.includes('Wheat Flour 2kg'), 'Shows item name');

    // Now a second delivery is made on that invoice: DEL-BR1-1002 delivers 3 units
    const del2 = {
      id: 'del-2',
      no: 'DEL-BR1-1002',
      date: '2026-10-27',
      invoiceId: 'inv-100',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [
        {
          itemId: 'i-flour',
          qty: 3,
          batchNo: 'FL-2402',
          expiry: '2027-03-25',
          cost: 10,
        },
      ],
    };
    db.deliveries.push(del2);

    const doc2 = generateDocumentHtml('delivery', del2, db);

    // Now BOTH columns should be present without branch: #1001 and #1002
    assert.ok(doc2.html.includes('#1001'), 'Includes column for first delivery');
    assert.ok(doc2.html.includes('#1002'), 'Includes new column for second delivery');

    // Delivered on Del 1 was 5, delivered on Del 2 was 3, total remaining is 2 (10 - 5 - 3 = 2)
    assert.ok(doc2.html.includes('5</td>'), 'Shows 5 delivered on Del 1');
    assert.ok(doc2.html.includes('3</td>'), 'Shows 3 delivered on Del 2');
    assert.ok(doc2.html.includes('2</td>'), 'Shows 2 in Total Remaining (10 - 5 - 3 = 2)');
    assert.ok(doc2.html.includes('Remaining amount'), 'Includes Remaining amount column header');

    // Now a third delivery fulfils the remaining 2 units
    const del3 = {
      id: 'del-3',
      no: 'DEL-BR1-1003',
      date: '2026-10-28',
      invoiceId: 'inv-100',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [
        {
          itemId: 'i-flour',
          qty: 2,
          batchNo: 'FL-2402',
          expiry: '2027-03-25',
          cost: 10,
        },
      ],
    };
    db.deliveries.push(del3);

    const doc3 = generateDocumentHtml('delivery', del3, db);
    assert.ok(doc3.html.includes('#1003'), 'Includes third column for third delivery without branch');
    assert.ok(doc3.html.includes('rot-90'), 'Headers rotated 90 degrees by default');
    assert.ok(doc3.html.includes('>0</td>'), 'Shows only 0 once completed');
    assert.ok(!doc3.html.includes('0 (fulfilled)'), 'Does not show 0 (fulfilled)');
  });

  test('delivery slip table supports Arabic labels and fulfillment status', () => {
    const db = emptyData();
    db.settings.lang = 'ar';

    db.items.push({
      id: 'i-rice',
      name: 'أرز بسمتي 5 كغم',
      barcode: '998877',
      sku: 'RICE-5',
      company: 'TestCo',
      group: 'Food',
      price: 25,
      cost: 18,
      reorder: 10,
      batch: true,
      note: '',
    });

    db.invoices.push({
      id: 'inv-200',
      no: 'INV-BR1-2000',
      date: '2026-10-26',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [{ itemId: 'i-rice', qty: 4, price: 25, discType: 'pct', discVal: 0 }],
      sub: 100,
      orderDiscType: 'amt',
      orderDiscVal: 0,
      discAmt: 0,
      tax: 0,
      total: 100,
      note: '',
    });

    const del = {
      id: 'del-ar-1',
      no: 'DEL-BR1-3001',
      date: '2026-10-26',
      invoiceId: 'inv-200',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [{ itemId: 'i-rice', qty: 4, batchNo: 'B-01', expiry: '2027-01-01', cost: 18 }],
    };
    db.deliveries.push(del);

    const doc = generateDocumentHtml('delivery', del, db);
    assert.ok(doc.html.includes('المتبقي لتنفيذ الفاتورة INV-BR1-2000'), 'Arabic fulfillment table title');
    assert.ok(doc.html.includes('الأصناف'), 'Arabic Items header');
    assert.ok(doc.html.includes('الكمية المفوترة'), 'Arabic Invoiced Qty header');
    assert.ok(doc.html.includes('>0</td>'), 'Arabic fulfilled status shows only 0');
    assert.ok(!doc.html.includes('0 (مكتمل)'), 'Does not show 0 (مكتمل)');
  });

  test('delivery slip omits Batch and Expiry columns when trackBatchExpiry is disabled', () => {
    const db = emptyData();
    db.settings.trackBatchExpiry = false;

    db.items.push({
      id: 'i-oil',
      name: 'Cooking Oil 1L',
      barcode: '112233',
      sku: 'OIL-1',
      company: 'TestCo',
      group: 'Food',
      price: 15,
      cost: 10,
      reorder: 5,
      batch: true,
      note: '',
    });

    const del = {
      id: 'del-no-batch',
      no: 'DEL-BR1-5001',
      date: '2026-10-28',
      invoiceId: 'inv-none',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [{ itemId: 'i-oil', qty: 6, batchNo: 'LOT-999', expiry: '2028-12-31', cost: 10 }],
    };
    db.deliveries.push(del);

    const docDisabled = generateDocumentHtml('delivery', del, db);
    assert.ok(docDisabled.html.includes('<th>Item</th><th class="num">Qty</th>'), 'Header must only contain Item and Qty');
    assert.ok(!docDisabled.html.includes('<th>Batch</th>'), 'Header must not contain Batch');
    assert.ok(!docDisabled.html.includes('<th>Expiry</th>'), 'Header must not contain Expiry');
    assert.ok(!docDisabled.html.includes('LOT-999'), 'Table rows must not display batch code');

    // When enabled again, Batch & Expiry reappear without data loss
    db.settings.trackBatchExpiry = true;
    const docEnabled = generateDocumentHtml('delivery', del, db);
    assert.ok(docEnabled.html.includes('<th>Item</th><th>Batch</th><th>Expiry</th><th class="num">Qty</th>'), 'Header must contain Batch and Expiry');
    assert.ok(docEnabled.html.includes('LOT-999'), 'Table row displays batch code intact');
  });

  test('renders note in invoice, delivery slip, credit note, and transfer voucher print outputs', () => {
    const db = emptyData();
    const inv = {
      id: 'inv-note-1',
      no: 'INV-100',
      date: '2026-11-01',
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [],
      sub: 100,
      orderDiscType: 'amt' as const,
      orderDiscVal: 0,
      discAmt: 0,
      tax: 0,
      total: 100,
      note: 'Deliver before 5 PM to rear warehouse entrance',
    };
    const invPrint = generateDocumentHtml('invoice', inv, db);
    assert.ok(invPrint.html.includes('Deliver before 5 PM to rear warehouse entrance'), 'Invoice print renders note');

    const del = {
      id: 'del-note-1',
      no: 'DEL-100',
      date: '2026-11-01',
      invoiceId: 'inv-note-1',
      customerId: 'c-test-1',
      branchId: 'b-main',
      note: 'Driver John Doe - Truck #82',
      lines: [],
    };
    const delPrint = generateDocumentHtml('delivery', del, db);
    assert.ok(delPrint.html.includes('Driver John Doe - Truck #82'), 'Delivery print renders note');

    const crn = {
      id: 'crn-note-1',
      no: 'RIN-100',
      date: '2026-11-01',
      customerId: 'c-test-1',
      branchId: 'b-main',
      returnSlipId: 'rs-1',
      note: 'Authorized defective box replacement credit',
      lines: [],
      total: 50,
    };
    const crnPrint = generateDocumentHtml('returninvoice', crn, db);
    assert.ok(crnPrint.html.includes('Authorized defective box replacement credit'), 'Credit note print renders note');

    const trf = {
      id: 'trf-note-1',
      no: 'TRF-100',
      date: '2026-11-01',
      fromBranchId: 'b-main',
      toBranchId: 'b-north',
      status: 'transit' as const,
      note: 'Urgent weekend restocking transfer',
      lines: [],
    };
    const trfPrint = generateDocumentHtml('transfer', trf, db);
    assert.ok(trfPrint.html.includes('Urgent weekend restocking transfer'), 'Transfer print renders note');
  });

  test('delivery slip printout for return slip includes credit notes and deducts them from remaining amount', () => {
    const db = emptyData();
    db.items.push({
      id: 'i-item-3',
      name: 'Special Item 3pcs',
      barcode: '12345',
      sku: 'SP-3',
      company: 'TestCo',
      group: 'General',
      price: 20,
      cost: 10,
      reorder: 2,
      batch: true,
      note: '',
    });

    const retSlip = {
      id: 'rs-print-1',
      no: 'RSL-1001',
      date: '2026-11-01',
      customerId: 'c-test-1',
      branchId: 'b-main',
      returnInvoiceId: 'rin-print-1',
      lines: [{ itemId: 'i-item-3', qty: 3 }],
    };
    db.returnSlips.push(retSlip);

    // 1 piece credited via credit note
    const crNote = {
      id: 'rin-print-1',
      no: 'RIN-1001',
      date: '2026-11-02',
      customerId: 'c-test-1',
      branchId: 'b-main',
      returnSlipId: retSlip.id,
      note: '1 piece credited',
      lines: [{ itemId: 'i-item-3', qty: 1, price: 20 }],
      total: 20,
    };
    db.returnInvoices.push(crNote);

    // Delivery slip replacing 1 piece (1 piece still remaining)
    const del = {
      id: 'del-print-1',
      no: 'DEL-1001',
      date: '2026-11-03',
      returnSlipId: retSlip.id,
      customerId: 'c-test-1',
      branchId: 'b-main',
      lines: [{ itemId: 'i-item-3', qty: 1, cost: 10 }],
    };
    db.deliveries.push(del);

    const doc = generateDocumentHtml('delivery', del, db);
    assert.ok(doc.html.includes('Remaining to fulfil return slip'), 'Includes return slip fulfillment table');
    assert.ok(doc.html.includes('#1001'), 'Includes delivery slip column');
    assert.ok(doc.html.includes('CR#1001'), 'Includes credit note column');
    assert.ok(doc.html.includes('(Credit)'), 'Identifies credit note column');
    assert.ok(doc.html.includes('CR#1001 (Credit)<br>'), 'Splits credit note label and date across lines so it fits compactly');
    assert.ok(doc.html.includes('#1001 This Slip<br>'), 'Splits current slip label and date across lines');
    // Returned: 3, Del: 1, Cr: 1 -> Remaining: 1
    assert.ok(doc.html.includes('>1</td>'), 'Remaining amount correctly shows 1');
  });

  test('printable CSS allows vertical headers to wrap while preventing mid-word shattering in standard tables', () => {
    const standalone = getStandalonePrintHtml('<div>test</div>', 'Test');
    assert.ok(!standalone.includes('max-height: 130px'), 'Must not clamp .rot-90 height to 130px');
    assert.ok(!standalone.includes('table-layout: fixed'), 'Must not use rigid table-layout: fixed on progressive-del-table');
    assert.ok(standalone.includes('overflow-wrap: anywhere'), 'Must keep overflow-wrap: anywhere on vertical headers');
    assert.ok(standalone.includes('min-height: 95px'), 'Must use min-height instead of rigid height on col-vertical');
    assert.ok(!/th\s*\{[^}]*overflow-wrap:\s*anywhere/.test(standalone), 'Must not apply overflow-wrap: anywhere globally on th');
    assert.ok(!/td\s*\{[^}]*overflow-wrap:\s*anywhere/.test(standalone), 'Must not apply overflow-wrap: anywhere globally on td');
    assert.ok(standalone.includes('.pr-table-wrap'), 'Must include horizontal scroll table wrapper for narrow viewports');
  });

  test('Account Statement keeps Date, Type, Ref unbroken and wraps table cleanly', () => {
    const db = emptyData();
    db.customers.push({
      id: 'cust-smart',
      name: 'Smart Hospital',
      phone: '',
      address: '',
      openingBalance: 0,
      isProvider: false,
    });
    const stmt = buildStatementHtml(db, 'cust-smart', [
      { date: '', type: 'opening', no: '—', details: 'Opening balance', debit: 0, credit: 0, bal: 0 },
      { date: '2026-11-15', type: 'invoice', no: 'INV-BR1-1001', details: '2 line(s) 100% delivered', debit: 33250000, credit: 0, bal: 33250000 },
    ]);
    assert.ok(stmt, 'Statement HTML must be generated');
    assert.ok(stmt!.html.includes('class="pr-table-wrap"'), 'Must wrap Account Statement table for mobile screens');
    assert.ok(stmt!.html.includes('<th class="nowrap">Type</th>'), 'Must keep Type header on one line');
    assert.ok(stmt!.html.includes('<td class="nowrap">2026-11-15</td>'), 'Must keep Date cells unbroken');
    assert.ok(stmt!.html.includes('<td class="nowrap">invoice</td>'), 'Must keep Type cells unbroken');
    assert.ok(stmt!.html.includes('<td class="nowrap">INV-BR1-1001</td>'), 'Must keep Ref cells unbroken');
  });

  test('delivery, arrival, transfer, and return slip printouts respect independent lotExpiryMode settings', () => {
    const db = emptyData();
    db.items.push({
      id: 'i-med',
      name: 'Amoxicillin 500mg',
      barcode: '',
      sku: 'AMX-500',
      company: '',
      group: '',
      price: 12,
      cost: 8,
      reorder: 5,
      batch: true,
      note: '',
    });

    const del = {
      id: 'del-ind-1',
      no: 'DEL-901',
      date: '2026-11-18',
      invoiceId: '',
      customerId: 'c1',
      branchId: 'b1',
      lines: [{ itemId: 'i-med', qty: 4, batchNo: 'BATCH-77', expiry: '2028-05-10', cost: 8 }],
    };
    const arr = {
      id: 'arr-ind-1',
      no: 'ARR-901',
      date: '2026-11-18',
      intakeId: '',
      branchId: 'b1',
      lines: [{ itemId: 'i-med', qty: 4, batchNo: 'BATCH-77', expiry: '2028-05-10', cost: 8 }],
    };
    const trf = {
      id: 'trf-ind-1',
      no: 'TRF-901',
      date: '2026-11-18',
      fromBranchId: 'b1',
      toBranchId: 'b2',
      status: 'transit' as const,
      lines: [{ itemId: 'i-med', qty: 4, batchNo: 'BATCH-77', expiry: '2028-05-10', cost: 8 }],
    };
    const ret = {
      id: 'ret-ind-1',
      no: 'RSL-901',
      date: '2026-11-18',
      customerId: 'c1',
      branchId: 'b1',
      lines: [{ itemId: 'i-med', qty: 4, batchNo: 'BATCH-77', cost: 8 }],
    };

    // Mode: Lot only -> shows Batch / Lot no, omits Expiry
    db.settings.lotExpiryMode = 'lot';
    db.settings.trackBatchExpiry = true;

    const delLot = generateDocumentHtml('delivery', del, db).html;
    assert.ok(delLot.includes('<th>Batch</th>') && !delLot.includes('<th>Expiry</th>'), 'Delivery lot-only keeps Batch, hides Expiry');
    assert.ok(delLot.includes('BATCH-77') && !delLot.includes('2028-05-10'), 'Delivery lot-only renders batch value without expiry');

    const arrLot = generateDocumentHtml('arrival', arr, db).html;
    assert.ok(arrLot.includes('<th>Lot no</th>') && !arrLot.includes('<th>Expiry</th>'), 'Arrival lot-only keeps Lot no, hides Expiry');

    const trfLot = generateDocumentHtml('transfer', trf, db).html;
    assert.ok(trfLot.includes('<th>Batch</th>') && !trfLot.includes('<th>Expiry</th>'), 'Transfer lot-only keeps Batch, hides Expiry');

    const retLot = generateDocumentHtml('returnslip', ret, db).html;
    assert.ok(retLot.includes('<th>Batch</th>') && retLot.includes('BATCH-77'), 'Return slip lot-only shows Batch');

    // Mode: Expiry only -> omits Batch / Lot no, shows Expiry
    db.settings.lotExpiryMode = 'expiry';
    const delExp = generateDocumentHtml('delivery', del, db).html;
    assert.ok(!delExp.includes('<th>Batch</th>') && delExp.includes('<th>Expiry</th>'), 'Delivery expiry-only hides Batch, keeps Expiry');
    assert.ok(!delExp.includes('BATCH-77') && delExp.includes('2028-05-10'), 'Delivery expiry-only hides batch code, shows expiry');

    const arrExp = generateDocumentHtml('arrival', arr, db).html;
    assert.ok(!arrExp.includes('<th>Lot no</th>') && arrExp.includes('<th>Expiry</th>'), 'Arrival expiry-only hides Lot no, keeps Expiry');

    const retExp = generateDocumentHtml('returnslip', ret, db).html;
    assert.ok(!retExp.includes('<th>Batch</th>') && !retExp.includes('BATCH-77'), 'Return slip expiry-only hides Batch');
  });
});


