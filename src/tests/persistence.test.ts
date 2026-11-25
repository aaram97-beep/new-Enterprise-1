import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData, seedData } from '../data/seedData';
import {
  computeDatabaseFingerprint,
  computeEntityDiff,
  hasSubstantiveBusinessData,
  pickBootDatabase,
  sanitizeForFirestore,
  sanitizeValidId,
} from '../utils/localCache';

test('hasSubstantiveBusinessData returns false for untouched demo seed and empty template', () => {
  assert.equal(hasSubstantiveBusinessData(seedData()), false);
  assert.equal(hasSubstantiveBusinessData(emptyData()), false);
});

test('hasSubstantiveBusinessData returns true when user customizes company, items, invoices, or settings', () => {
  const customCompany = seedData();
  customCompany.settings.companyName = 'Baghdad Medical Supplies';
  assert.equal(hasSubstantiveBusinessData(customCompany), true);

  const customMode = seedData();
  customMode.settings.lotExpiryMode = 'lot';
  assert.equal(hasSubstantiveBusinessData(customMode), true);

  const addedItem = seedData();
  addedItem.items.push({
    id: 'i-custom-1',
    sku: 'SKU-99',
    name: 'Surgical Mask Box',
    company: 'MedCo',
    group: 'Medical',
    cost: 4,
    price: 7,
    reorder: 20,
    barcode: '',
    note: '',
    batch: true,
  });
  assert.equal(hasSubstantiveBusinessData(addedItem), true);
});

test('pickBootDatabase recovers live IndexedDB data when server /api/db resets after app update', () => {
  const liveDb = seedData();
  liveDb.settings.companyName = 'Al-Rafidain Wholesale';
  liveDb.items.push({
    id: 'i-real-1',
    sku: 'REAL-1',
    name: 'Real Live Product',
    company: 'RealCo',
    group: 'General',
    cost: 10,
    price: 15,
    reorder: 5,
    barcode: '',
    note: '',
    batch: false,
  });

  // Case 1: Fresh container with missing /api/db
  const missingServerResult = pickBootDatabase({
    serverExists: false,
    serverDb: null,
    indexedDbEnvelope: {
      db: liveDb,
      savedAt: Date.now(),
      revision: 12,
      syncedCloudRevision: 10,
    },
    legacyLocalDb: null,
  });

  assert.equal(missingServerResult.source, 'indexeddb-recovery');
  assert.equal(missingServerResult.needsServerWrite, true);
  assert.equal(missingServerResult.db?.settings.companyName, 'Al-Rafidain Wholesale');
  assert.equal(missingServerResult.revision, 12);
  assert.equal(missingServerResult.syncedCloudRevision, 10);

  // Case 2: Container starts with untouched demo seed while browser has live data
  const demoServerResult = pickBootDatabase({
    serverExists: true,
    serverDb: seedData(),
    indexedDbEnvelope: {
      db: liveDb,
      savedAt: Date.now(),
      revision: 8,
    },
    legacyLocalDb: null,
  });

  assert.equal(demoServerResult.source, 'indexeddb-recovery');
  assert.equal(demoServerResult.needsServerWrite, true);
  assert.equal(demoServerResult.db?.settings.companyName, 'Al-Rafidain Wholesale');
});

test('pickBootDatabase recovers from legacy localStorage fallback if IndexedDB and server are missing', () => {
  const liveDb = emptyData();
  liveDb.settings.companyName = 'Legacy Backup Corp';
  liveDb.audit.push({
    id: 'a-user-1',
    ts: Date.now(),
    user: 'admin',
    action: 'Settings updated',
    details: 'Changed company name',
  });

  const decision = pickBootDatabase({
    serverExists: false,
    serverDb: null,
    indexedDbEnvelope: null,
    legacyLocalDb: liveDb,
  });

  assert.equal(decision.source, 'localstorage-recovery');
  assert.equal(decision.needsServerWrite, true);
  assert.equal(decision.db?.settings.companyName, 'Legacy Backup Corp');
});

test('computeEntityDiff isolates only changed, created, and deleted documents', () => {
  const prev = seedData();
  const next = structuredClone(prev);

  // Modify 1 customer, add 1 item, delete 1 expense, keep everything else untouched
  next.customers[0].name = 'Baghdad Mart Updated';
  next.items.push({
    id: 'i-new-1',
    sku: 'NEW-1',
    name: 'New Product',
    company: 'Co',
    group: 'Grp',
    cost: 2,
    price: 4,
    reorder: 10,
    barcode: '',
    note: '',
    batch: false,
  });
  const removedExpenseId = next.expenses[0].id;
  next.expenses.shift();

  const diff = computeEntityDiff(prev, next);
  assert.equal(diff.workspaceChanged, false);
  assert.deepEqual(
    diff.upserts.map((u) => u.key).sort(),
    [`customers__${next.customers[0].id}`, 'items__i-new-1']
  );
  assert.deepEqual(diff.deletes, [`expenses__${removedExpenseId}`]);
});

test('hasSubstantiveBusinessData preserves settings-only customizations and blank erased workspaces', () => {
  const directSale = seedData();
  directSale.settings.directSaleMode = true;
  assert.equal(hasSubstantiveBusinessData(directSale), true);

  const disabledFeat = seedData();
  disabledFeat.settings.features.expenses = false;
  assert.equal(hasSubstantiveBusinessData(disabledFeat), true);

  const erasedBlank = emptyData();
  erasedBlank.settings.workspaceInitialized = true;
  assert.equal(hasSubstantiveBusinessData(erasedBlank), true);
});

test('pickBootDatabase flags needsMerge when browser IndexedDB has unsynced edits alongside newer server DB', () => {
  const serverDb = seedData();
  serverDb.settings.companyName = 'Baghdad Wholesale Live';

  const unsyncedBrowserDb = structuredClone(serverDb);
  unsyncedBrowserDb.items.push({
    id: 'i-offline-1',
    sku: 'OFF-1',
    name: 'Offline Pending Item',
    company: 'Co',
    group: 'Med',
    cost: 5,
    price: 9,
    reorder: 2,
    barcode: '',
    note: '',
    batch: false,
  });

  const decision = pickBootDatabase({
    serverExists: true,
    serverDb,
    indexedDbEnvelope: {
      db: unsyncedBrowserDb,
      savedAt: Date.now(),
      revision: 15,
      syncedServerRevision: 12,
      syncedServerVersion: 3,
    },
    legacyLocalDb: null,
  });

  assert.equal(decision.source, 'server-merged');
  assert.equal(decision.needsMerge, true);
  assert.equal(decision.needsServerWrite, true);
  assert.ok(decision.remoteDb);
  assert.ok(decision.db?.items.some((it) => it.id === 'i-offline-1'));
});

test('sanitizeForFirestore removes undefined fields and caps sanitizeValidId to 100 chars for Firestore rule compliance', () => {
  const cleaned = sanitizeForFirestore({
    id: 'inv-1',
    note: undefined,
    total: Number.NaN,
    lines: [{ itemId: 'i1', batchNo: undefined, qty: 2 }],
  });

  assert.equal('note' in cleaned, false);
  assert.equal(cleaned.total, 0);
  assert.equal('batchNo' in cleaned.lines[0], false);
  assert.equal(cleaned.lines[0].qty, 2);

  assert.equal(sanitizeValidId('valid_id-123'), 'valid_id-123');
  assert.equal(sanitizeValidId('item with spaces.1'), 'item_with_spaces_1');
  const veryLongId = 'a'.repeat(160);
  const capped = sanitizeValidId(veryLongId);
  assert.ok(capped.length <= 100);
  assert.ok(`returnInvoices__${capped}`.length <= 128);
});

test('computeDatabaseFingerprint detects single-field value, taxRate, and order edits with same collection lengths', () => {
  const base = seedData();
  const baseFp = computeDatabaseFingerprint(base);

  const editedPrice = structuredClone(base);
  editedPrice.items[0].price = Number((editedPrice.items[0].price + 1.25).toFixed(2));
  assert.notEqual(computeDatabaseFingerprint(editedPrice), baseFp);

  const editedTax = structuredClone(base);
  editedTax.settings.taxRate = 5;
  assert.notEqual(computeDatabaseFingerprint(editedTax), baseFp);

  const editedInv = structuredClone(base);
  editedInv.invoices[0].note = `${editedInv.invoices[0].note} verified`;
  assert.notEqual(computeDatabaseFingerprint(editedInv), baseFp);

  const identicalClone = structuredClone(base);
  assert.equal(computeDatabaseFingerprint(identicalClone), baseFp);
});
