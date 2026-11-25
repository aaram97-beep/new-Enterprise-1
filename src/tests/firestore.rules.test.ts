import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  sanitizeUserForFirestore,
  computeFirestoreDiffOps,
  createEmptyKnownDocIds,
} from '../utils/firestoreSync.ts';
import { emptyData } from '../data/seedData.ts';

const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
const blueprintPath = path.resolve(process.cwd(), 'firebase-blueprint.json');
const firebaseTsPath = path.resolve(process.cwd(), 'src/firebase.ts');
const rulesText = fs.readFileSync(rulesPath, 'utf8');
const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf8'));
const firebaseTsText = fs.readFileSync(firebaseTsPath, 'utf8');

test('firestore.rules enforces rules_version 2 and default-deny catch-all', () => {
  assert.match(rulesText, /^rules_version\s*=\s*'2';/m);
  assert.match(rulesText, /match \/\{document=\*\*\}\s*\{\s*allow read, write:\s*if false;/);
});

test('all 23 collections in firebase-blueprint.json have explicit match blocks in firestore.rules', () => {
  const paths = Object.keys(blueprint.firestore || {});
  assert.equal(paths.length, 23);

  const expectedMatches = [
    /match \/settings\/\{settingId\}/,
    /match \/counters\/\{branchId\}/,
    /match \/users\/\{uid\}/,
    /match \/branches\/\{branchId\}/,
    /match \/accounts\/\{accountId\}/,
    /match \/customers\/\{customerId\}/,
    /match \/items\/\{itemId\}/,
    /match \/stocks\/\{stockId\}/,
    /match \/invoices\/\{invoiceId\}/,
    /match \/deliveries\/\{deliveryId\}/,
    /match \/returnSlips\/\{slipId\}/,
    /match \/returnInvoices\/\{creditNoteId\}/,
    /match \/intakes\/\{intakeId\}/,
    /match \/arrivals\/\{arrivalId\}/,
    /match \/payments\/\{paymentId\}/,
    /match \/checks\/\{checkId\}/,
    /match \/transfers\/\{transferId\}/,
    /match \/disposals\/\{disposalId\}/,
    /match \/barters\/\{barterId\}/,
    /match \/adjusts\/\{adjustId\}/,
    /match \/moneyMoves\/\{moveId\}/,
    /match \/expenses\/\{expenseId\}/,
    /match \/audit\/\{auditId\}/,
  ];
  for (const pattern of expectedMatches) {
    assert.match(rulesText, pattern);
  }
});

test('passwords are never permitted in User blueprint or Firestore rules', () => {
  const userProps = blueprint.entities?.User?.properties || {};
  assert.equal('pass' in userProps, false);
  assert.equal('password' in userProps, false);
  assert.equal('passwordHash' in userProps, false);

  assert.match(rulesText, /hasNoPasswordFields\(data\)/);
  assert.match(rulesText, /isValidUser\(incoming\(\), uid\)/);
  assert.match(
    rulesText,
    /data\.keys\(\)\.hasOnly\(\['id', 'name', 'username', 'role', 'branchIds', 'active', 'perms', 'deleted', 'deletedAt'/
  );

  const sanitized = sanitizeUserForFirestore(
    {
      id: 'uid_abc',
      name: 'Ali',
      username: 'Ali.Sales',
      pass: 'supersecret123',
      role: 'user',
      branchIds: ['b1'],
      active: true,
      perms: { sales: true },
    },
    'uid_abc'
  );
  assert.equal('pass' in sanitized, false);
  assert.equal(sanitized.username, 'ali.sales');
  assert.equal(sanitized.deleted, false);
  assert.equal(sanitized.deletedAt, null);

  const sanitizedDeleted = sanitizeUserForFirestore(
    {
      id: 'uid_del',
      name: 'Former Ali',
      username: 'ali.former',
      pass: '',
      role: 'user',
      branchIds: ['b1'],
      active: true, // must be forced false when deleted === true
      deleted: true,
      deletedAt: 1700000000000,
      perms: { sales: true },
    },
    'uid_del'
  );
  assert.equal(sanitizedDeleted.deleted, true);
  assert.equal(sanitizedDeleted.active, false);
  assert.equal(sanitizedDeleted.deletedAt, 1700000000000);
});

test('internal email auth mapping, soft-delete blocking, and RBAC + branch-scoping invariants are enforced', () => {
  // Username -> @company.internal mapping in src/firebase.ts & rules
  assert.match(firebaseTsText, /INTERNAL_EMAIL_DOMAIN\s*=\s*'company\.internal'/);
  assert.match(rulesText, /request\.auth\.token\.email\.matches\('\.\*@company\\\\\.internal\$'\)/);

  // Only active, non-deleted users & admins checked via /users/{uid}
  assert.match(rulesText, /function isActiveUser\(\)/);
  assert.match(rulesText, /userDoc\(\)\.deleted\s*!=\s*true/);
  assert.match(rulesText, /data\.deleted\s*==\s*false\s*\|\|\s*data\.active\s*==\s*false/);
  assert.match(rulesText, /existing\(\)\.active\s*==\s*true\s*&&\s*\(!\('deleted' in existing\(\)\)\s*\|\|\s*existing\(\)\.deleted\s*!=\s*true\)/);
  assert.match(rulesText, /function isAdmin\(\)/);
  assert.match(rulesText, /function inBranch\(branchId\)/);

  // Non-admin user self-update restricted strictly to theme, sidebarCollapsed, updatedAt
  assert.match(rulesText, /affectedKeys\(\)\.hasOnly\(\['theme', 'sidebarCollapsed', 'updatedAt'\]\)/);

  // Server timestamps, ID integrity, terminal state locking, and immutable updates
  assert.match(rulesText, /incoming\(\)\.createdAt\s*==\s*request\.time/);
  assert.match(rulesText, /incoming\(\)\.updatedAt\s*==\s*request\.time/);
  assert.match(rulesText, /existing\(\)\.status\s*==\s*'transit'/);
  assert.match(rulesText, /existing\(\)\.status\s*==\s*'pending'/);
  assert.match(rulesText, /allow update:\s*if false;/);
});

test('computeFirestoreDiffOps emits minimal incremental batch ops, soft-deletes users cleanly, and strips pass', () => {
  const prevDb = emptyData();
  const knownDocIds = createEmptyKnownDocIds();
  knownDocIds.settings.add('main');
  knownDocIds.branches.add('b1');
  knownDocIds.counters.add('b1');
  prevDb.accounts.forEach((a) => knownDocIds.accounts.add(a.id));
  prevDb.users.forEach((u) => knownDocIds.users.add(u.id));
  prevDb.audit.forEach((a) => knownDocIds.audit.add(a.id));

  const nextDb = structuredClone(prevDb);
  nextDb.branches.push({ id: 'b2', code: 'BR2', name: 'Basra', address: '', isMain: false });
  nextDb.users.push({
    id: 'uid_emp_1',
    name: 'Cashier',
    username: 'cashier1',
    pass: 'secret99',
    role: 'user',
    branchIds: ['b1'],
    active: true,
    perms: { sales: true },
  });

  const ops = computeFirestoreDiffOps({ prevDb, nextDb, knownDocIds });
  assert.equal(ops.length, 2);

  const userOp = ops.find((o) => o.collection === 'users' && o.docId === 'uid_emp_1');
  assert.ok(userOp);
  assert.equal(userOp.action, 'create');
  assert.equal('pass' in (userOp.data || {}), false);

  const branchOp = ops.find((o) => o.collection === 'branches' && o.docId === 'b2');
  assert.ok(branchOp);
  assert.equal(branchOp.action, 'create');

  // Verify soft-deleting an employee emits an update (not hard delete) setting active: false, deleted: true
  const afterCreateKnown = createEmptyKnownDocIds();
  afterCreateKnown.settings.add('main');
  afterCreateKnown.branches.add('b1');
  afterCreateKnown.branches.add('b2');
  afterCreateKnown.counters.add('b1');
  nextDb.accounts.forEach((a) => afterCreateKnown.accounts.add(a.id));
  nextDb.users.forEach((u) => afterCreateKnown.users.add(u.id));
  nextDb.audit.forEach((a) => afterCreateKnown.audit.add(a.id));

  const softDeletedDb = structuredClone(nextDb);
  softDeletedDb.users = softDeletedDb.users.map((u) =>
    u.id === 'uid_emp_1' ? { ...u, active: false, deleted: true, deletedAt: 1700000000123 } : u
  );
  const softDelOps = computeFirestoreDiffOps({
    prevDb: nextDb,
    nextDb: softDeletedDb,
    knownDocIds: afterCreateKnown,
  });
  assert.equal(softDelOps.length, 1);
  assert.equal(softDelOps[0].collection, 'users');
  assert.equal(softDelOps[0].docId, 'uid_emp_1');
  assert.equal(softDelOps[0].action, 'update');
  assert.equal(softDelOps[0].data?.active, false);
  assert.equal(softDelOps[0].data?.deleted, true);
  assert.equal(softDelOps[0].data?.deletedAt, 1700000000123);
});
