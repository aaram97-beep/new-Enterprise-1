import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { seedData } from '../data/seedData.ts';
import { mergeDatabases, mergeCounters } from '../utils/dbMerge.ts';
import { resolveStoragePaths, writeDatabaseWithMerge, readDatabaseFile } from '../utils/fileStorage.ts';
import {
  buildClearSessionCookieHeader,
  buildSessionCookieHeader,
  extractPublicMeta,
  isActiveServerUser,
  isValidCsrfRequest,
  parseCookies,
  SERVER_SESSION_COOKIE,
  signSessionToken,
  verifySessionToken,
  verifyUserCredentials,
} from '../utils/serverAuth.ts';

async function withTempDir(fn: (tmpDir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-concurrency-test-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('mergeDatabases preserves concurrent invoices from two staff and recomputes stock accurately', () => {
  const base = seedData();
  base.settings.directSaleMode = true;
  const item = base.items[0];
  const custA = base.customers[0];
  const custB = base.customers[1];
  const branch = base.branches[0];
  const today = new Date().toISOString().slice(0, 10);

  const totalBefore = base.stocks
    .filter((s) => s.itemId === item.id && s.branchId === branch.id)
    .reduce((acc, s) => acc + s.qty, 0);
  assert.ok(totalBefore >= 5, 'Seed should have sufficient stock for test item');

  const staffADb = structuredClone(base);
  staffADb.counters[branch.id].INV += 1;
  staffADb.counters[branch.id].DEL += 1;
  staffADb.invoices.push({
    id: 'inv-staff-a',
    no: `INV-${branch.code}-${staffADb.counters[branch.id].INV}`,
    date: today,
    branchId: branch.id,
    customerId: custA.id,
    lines: [{ itemId: item.id, qty: 2, price: item.price, discType: 'pct', discVal: 0 }],
    orderDiscType: 'pct',
    orderDiscVal: 0,
    sub: item.price * 2,
    discAmt: 0,
    tax: 0,
    total: item.price * 2,
    note: 'Staff A sale',
  });
  staffADb.deliveries.push({
    id: 'del-staff-a',
    no: `DEL-${branch.code}-${staffADb.counters[branch.id].DEL}`,
    date: today,
    invoiceId: 'inv-staff-a',
    customerId: custA.id,
    branchId: branch.id,
    lines: [{ itemId: item.id, qty: 2 }],
  });

  const staffBDb = structuredClone(base);
  staffBDb.counters[branch.id].INV += 1;
  staffBDb.counters[branch.id].DEL += 1;
  staffBDb.invoices.push({
    id: 'inv-staff-b',
    no: `INV-${branch.code}-${staffBDb.counters[branch.id].INV}`,
    date: today,
    branchId: branch.id,
    customerId: custB.id,
    lines: [{ itemId: item.id, qty: 3, price: item.price, discType: 'pct', discVal: 0 }],
    orderDiscType: 'pct',
    orderDiscVal: 0,
    sub: item.price * 3,
    discAmt: 0,
    tax: 0,
    total: item.price * 3,
    note: 'Staff B sale',
  });
  staffBDb.deliveries.push({
    id: 'del-staff-b',
    no: `DEL-${branch.code}-${staffBDb.counters[branch.id].DEL}`,
    date: today,
    invoiceId: 'inv-staff-b',
    customerId: custB.id,
    branchId: branch.id,
    lines: [{ itemId: item.id, qty: 3 }],
  });

  const merged = mergeDatabases({
    baseDb: base,
    localDb: staffADb,
    remoteDb: staffBDb,
  });

  assert.ok(merged.db.invoices.some((inv) => inv.id === 'inv-staff-a'));
  assert.ok(merged.db.invoices.some((inv) => inv.id === 'inv-staff-b'));
  assert.ok(merged.db.deliveries.some((del) => del.id === 'del-staff-a'));
  assert.ok(merged.db.deliveries.some((del) => del.id === 'del-staff-b'));
  assert.equal(merged.mergedRemoteRecords, 2);

  const totalAfter = merged.db.stocks
    .filter((s) => s.itemId === item.id && s.branchId === branch.id)
    .reduce((acc, s) => acc + s.qty, 0);
  assert.equal(totalAfter, totalBefore - 5);
});

test('mergeDatabases merges distinct fields changed concurrently on the same entity and honors deletions cleanly', () => {
  const base = seedData();
  const c0 = base.customers[0];
  const deletedId = base.expenses[0].id;

  const staffADb = structuredClone(base);
  staffADb.customers[0].phone = '+964 770 111 2222';
  staffADb.expenses = staffADb.expenses.filter((e) => e.id !== deletedId);

  const staffBDb = structuredClone(base);
  staffBDb.customers[0].address = 'Al-Mansour District, Baghdad';

  const merged = mergeDatabases({
    baseDb: base,
    localDb: staffADb,
    remoteDb: staffBDb,
  });

  const mergedCust = merged.db.customers.find((c) => c.id === c0.id);
  assert.equal(mergedCust?.phone, '+964 770 111 2222');
  assert.equal(mergedCust?.address, 'Al-Mansour District, Baghdad');
  assert.equal(merged.db.expenses.some((e) => e.id === deletedId), false);
});

test('mergeCounters preserves monotonic maximum document numbers across branches', () => {
  const result = mergeCounters(
    { b1: { INV: 1005, DEL: 1002 } },
    { b1: { INV: 1007, DEL: 1002 }, b2: { INV: 1001 } },
    { b1: { INV: 1006, DEL: 1004 } }
  );
  assert.equal(result.b1.INV, 1007);
  assert.equal(result.b1.DEL, 1004);
  assert.equal(result.b2.INV, 1001);
});

test('writeDatabaseWithMerge detects stale baseVersion and merges concurrent saves atomically on disk', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('ims-data', tmpDir);
    const v1Db = seedData();
    v1Db.settings.companyName = 'Team Sync Pharmacy';
    const today = new Date().toISOString().slice(0, 10);

    const r1 = await writeDatabaseWithMerge(
      paths,
      v1Db as unknown as Record<string, unknown>,
      { mode: 'replace' },
      tmpDir
    );
    assert.equal(r1.version, 1);

    // Staff B saves a new customer based on version 1
    const staffBDb = structuredClone(v1Db);
    staffBDb.customers.push({
      id: 'cust-b-1',
      name: 'Client Beta',
      phone: '0771',
      address: 'Erbil',
      openingBalance: 0,
      isProvider: false,
      note: '',
    });
    const r2 = await writeDatabaseWithMerge(
      paths,
      staffBDb as unknown as Record<string, unknown>,
      { baseVersion: 1, mode: 'merge' },
      tmpDir
    );
    assert.equal(r2.version, 2);
    assert.equal(r2.merged, false);

    // Staff A also read version 1 and saves a new expense with stale baseVersion: 1
    const staffADb = structuredClone(v1Db);
    staffADb.expenses.push({
      id: 'exp-a-1',
      no: 'EXP-BGW-1099',
      date: today,
      accountId: staffADb.accounts[0].id,
      category: 'Utilities',
      amount: 125,
      note: 'Generator fuel',
    });

    const r3 = await writeDatabaseWithMerge(
      paths,
      staffADb as unknown as Record<string, unknown>,
      { baseVersion: 1, mode: 'merge' },
      tmpDir
    );

    assert.equal(r3.version, 3);
    assert.equal(r3.merged, true);
    assert.equal(r3.mergedRemoteRecords, 1);

    const onDisk = await readDatabaseFile(paths);
    assert.equal(onDisk.version, 3);
    const diskDb = onDisk.db as unknown as ReturnType<typeof seedData>;
    assert.ok(diskDb.customers.some((c) => c.id === 'cust-b-1'));
    assert.ok(diskDb.expenses.some((e) => e.id === 'exp-a-1'));
  });
});

test('serverAuth signs/verifies HttpOnly tokens, rejects tampering/inactive users, and strips sensitive fields from public meta', () => {
  const secret = 'test-secret-0123456789abcdef';
  const session = { id: 'u1', name: 'Administrator', role: 'admin' as const, username: 'admin' };
  const token = signSessionToken(session, secret, 60_000, 1_000_000);

  const verified = verifySessionToken(token, secret, 1_010_000);
  assert.deepEqual(verified, {
    uid: 'u1',
    username: 'admin',
    role: 'admin',
    exp: 1_060_000,
  });

  // Tampered or expired token must fail
  assert.equal(verifySessionToken(`${token}tamper`, secret, 1_010_000), null);
  assert.equal(verifySessionToken(token, secret, 1_070_000), null);

  // Cookie roundtrip + flags
  const httpsCookie = buildSessionCookieHeader(token, { isHttps: true, remember: true });
  assert.ok(httpsCookie.includes('HttpOnly'));
  assert.ok(httpsCookie.includes('SameSite=None'));
  assert.ok(httpsCookie.includes('Secure'));
  const parsed = parseCookies(`${httpsCookie.split(';')[0]}; other=val`);
  assert.equal(parsed[SERVER_SESSION_COOKIE], token);
  assert.ok(buildClearSessionCookieHeader(false).includes('Max-Age=0'));

  // CSRF check
  assert.equal(isValidCsrfRequest({ requestedWith: 'IMSClient' }), true);
  assert.equal(isValidCsrfRequest({ origin: 'https://evil.example', host: 'app.example' }), false);
  assert.equal(isValidCsrfRequest({ origin: 'https://app.example', host: 'app.example' }), true);

  // Credentials + deactivation
  const db = seedData();
  assert.equal(verifyUserCredentials(db.users, 'admin', 'wrong'), null);
  assert.equal(verifyUserCredentials(db.users, 'ADMIN', 'admin')?.id, 'u1');

  db.users[0].active = false;
  assert.equal(verifyUserCredentials(db.users, 'admin', 'admin'), null);
  assert.equal(
    isActiveServerUser(db as unknown as Record<string, unknown>, verified!),
    false
  );

  // Public meta excludes users/passwords/financial records
  db.settings.companyName = 'Baghdad Med';
  const meta = extractPublicMeta(db as unknown as Record<string, unknown>);
  assert.deepEqual(Object.keys(meta).sort(), ['companyName', 'lang', 'logo']);
  assert.equal(meta.companyName, 'Baghdad Med');
});
