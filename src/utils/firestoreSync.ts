import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import type { User as FirebaseUser } from 'firebase/auth';
import type { DatabaseSchema, Settings, User } from '../types';
import { emptyData } from '../data/seedData';
import { uid as generateUid } from './formatters';
import { firestoreDb, handleFirestoreError, OperationType } from '../firebase';
import { sanitizeForFirestore, sanitizeValidId } from './localCache';

const BATCH_OP_LIMIT = 400;

export const COUNTER_DOC_TYPES = [
  'INV',
  'DEL',
  'RSL',
  'RIN',
  'INT',
  'ARR',
  'TRF',
  'DSP',
  'CHK',
  'BRT',
  'PAY',
  'MTR',
  'EXP',
] as const;

export const ARRAY_COLLECTIONS = [
  'branches',
  'users',
  'accounts',
  'customers',
  'items',
  'stocks',
  'invoices',
  'deliveries',
  'returnSlips',
  'returnInvoices',
  'intakes',
  'arrivals',
  'payments',
  'checks',
  'transfers',
  'disposals',
  'barters',
  'adjusts',
  'moneyMoves',
  'expenses',
  'audit',
] as const;

export type ArrayCollectionName = (typeof ARRAY_COLLECTIONS)[number];
export type KnownDocIdsMap = Record<'settings' | 'counters' | ArrayCollectionName, Set<string>>;

export interface UserPreferences {
  theme?: 'light' | 'dark';
  sidebarCollapsed?: boolean;
}

export interface LoadCompanyDataResult {
  status: 'ok' | 'inactive' | 'missing';
  db?: DatabaseSchema;
  currentUser?: User;
  knownDocIds?: KnownDocIdsMap;
  userPrefs?: UserPreferences;
  bootstrapped?: boolean;
}

export interface DiffWriteOp {
  collection: 'settings' | 'counters' | ArrayCollectionName;
  docId: string;
  action: 'create' | 'update' | 'delete';
  data?: Record<string, unknown>;
}

export function createEmptyKnownDocIds(): KnownDocIdsMap {
  return {
    settings: new Set<string>(),
    counters: new Set<string>(),
    branches: new Set<string>(),
    users: new Set<string>(),
    accounts: new Set<string>(),
    customers: new Set<string>(),
    items: new Set<string>(),
    stocks: new Set<string>(),
    invoices: new Set<string>(),
    deliveries: new Set<string>(),
    returnSlips: new Set<string>(),
    returnInvoices: new Set<string>(),
    intakes: new Set<string>(),
    arrivals: new Set<string>(),
    payments: new Set<string>(),
    checks: new Set<string>(),
    transfers: new Set<string>(),
    disposals: new Set<string>(),
    barters: new Set<string>(),
    adjusts: new Set<string>(),
    moneyMoves: new Set<string>(),
    expenses: new Set<string>(),
    audit: new Set<string>(),
  };
}

export function cloneKnownDocIds(source: KnownDocIdsMap): KnownDocIdsMap {
  const out = createEmptyKnownDocIds();
  (Object.keys(out) as Array<keyof KnownDocIdsMap>).forEach((k) => {
    out[k] = new Set(source[k]);
  });
  return out;
}

export function sanitizeSettingsForFirestore(raw: Settings | Record<string, unknown>): Record<string, unknown> {
  const base = sanitizeForFirestore(raw || {}) as Record<string, unknown>;
  const cleanFeatures: Record<string, boolean> = {};
  if (base.features && typeof base.features === 'object') {
    for (const [k, v] of Object.entries(base.features as Record<string, unknown>)) {
      cleanFeatures[k] = v !== false;
    }
  }
  const out: Record<string, unknown> = {
    companyName: String(base.companyName || 'My Company').slice(0, 160),
    address: String(base.address ?? '').slice(0, 300),
    phone: String(base.phone ?? '').slice(0, 80),
    currency: String(base.currency || '$').slice(0, 20),
    taxRate: Number.isFinite(Number(base.taxRate)) ? Number(base.taxRate) : 0,
    expiryWarnDays: Number.isFinite(Number(base.expiryWarnDays)) ? Number(base.expiryWarnDays) : 30,
    logo: String(base.logo ?? '').slice(0, 700000),
    lang: base.lang === 'ar' ? 'ar' : 'en',
    features: cleanFeatures,
  };
  if (typeof base.trackBatchExpiry === 'boolean') out.trackBatchExpiry = base.trackBatchExpiry;
  if (
    base.lotExpiryMode === 'both' ||
    base.lotExpiryMode === 'lot' ||
    base.lotExpiryMode === 'expiry' ||
    base.lotExpiryMode === 'none'
  ) {
    out.lotExpiryMode = base.lotExpiryMode;
  }
  if (typeof base.showInOtherBranchStatus === 'boolean') {
    out.showInOtherBranchStatus = base.showInOtherBranchStatus;
  }
  if (base.moneyDecimals !== undefined) {
    const md = Math.trunc(Number(base.moneyDecimals));
    out.moneyDecimals = Math.min(4, Math.max(0, Number.isFinite(md) ? md : 2));
  }
  if (base.theme === 'light' || base.theme === 'dark') out.theme = base.theme;
  if (typeof base.isBranchCompany === 'boolean') out.isBranchCompany = base.isBranchCompany;
  if (typeof base.directSaleMode === 'boolean') out.directSaleMode = base.directSaleMode;
  if (typeof base.workspaceInitialized === 'boolean') {
    out.workspaceInitialized = base.workspaceInitialized;
  }
  return out;
}

export function sanitizeCounterForFirestore(
  raw: Record<string, unknown> | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of COUNTER_DOC_TYPES) {
    const v = Number(raw?.[key]);
    out[key] = Number.isFinite(v) ? Math.trunc(v) : 1000;
  }
  return out;
}

export function sanitizeUserForFirestore(
  raw: User | Record<string, unknown>,
  uidOverride?: string
): Record<string, unknown> {
  const safeId = sanitizeValidId(uidOverride || raw.id, 'u');
  const rawPerms =
    raw.perms && typeof raw.perms === 'object' ? (raw.perms as Record<string, unknown>) : {};
  const cleanPerms: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(rawPerms)) {
    if (typeof v === 'boolean') cleanPerms[k] = v;
  }
  const isDeleted = raw.deleted === true;
  return {
    id: safeId,
    name: String(raw.name || 'Employee').trim().slice(0, 160) || 'Employee',
    username: String(raw.username || 'user').trim().toLowerCase().slice(0, 80) || 'user',
    role: raw.role === 'admin' ? 'admin' : 'user',
    branchIds: Array.isArray(raw.branchIds)
      ? raw.branchIds.map((b) => sanitizeValidId(b, 'b1')).slice(0, 50)
      : [],
    active: isDeleted ? false : raw.active !== false,
    deleted: isDeleted,
    deletedAt:
      isDeleted && typeof raw.deletedAt === 'number' && Number.isFinite(raw.deletedAt)
        ? Math.trunc(raw.deletedAt)
        : null,
    perms: cleanPerms,
  };
}

export function sanitizeRecordForFirestore(
  col: ArrayCollectionName,
  raw: Record<string, unknown>,
  defaultBranchId = 'b1'
): Record<string, unknown> {
  if (col === 'users') {
    return sanitizeUserForFirestore(raw);
  }

  const cleaned = sanitizeForFirestore({ ...raw }) as Record<string, unknown>;
  delete cleaned.createdAt;
  delete cleaned.updatedAt;
  delete cleaned.pass;
  delete cleaned.password;
  delete cleaned.passwordHash;

  const safeId = sanitizeValidId(cleaned.id, col.slice(0, 4));
  cleaned.id = safeId;

  switch (col) {
    case 'branches':
      return {
        id: safeId,
        code: String(cleaned.code ?? 'BR').slice(0, 32),
        name: String(cleaned.name ?? 'Branch').slice(0, 160),
        address: String(cleaned.address ?? '').slice(0, 300),
        isMain: Boolean(cleaned.isMain),
      };
    case 'accounts': {
      const out: Record<string, unknown> = {
        id: safeId,
        name: String(cleaned.name ?? 'Account').slice(0, 160),
        type:
          cleaned.type === 'bank' || cleaned.type === 'cheques' ? cleaned.type : 'cashbox',
        branchId: cleaned.branchId ? sanitizeValidId(cleaned.branchId, defaultBranchId) : null,
        opening: Number(cleaned.opening) || 0,
      };
      if (cleaned.note !== undefined) out.note = String(cleaned.note ?? '').slice(0, 500);
      return out;
    }
    case 'customers': {
      const out: Record<string, unknown> = {
        id: safeId,
        name: String(cleaned.name ?? 'Customer').slice(0, 200),
        phone: String(cleaned.phone ?? '').slice(0, 80),
        address: String(cleaned.address ?? '').slice(0, 300),
        openingBalance: Number(cleaned.openingBalance) || 0,
        isProvider: Boolean(cleaned.isProvider),
      };
      if (cleaned.note !== undefined) out.note = String(cleaned.note ?? '').slice(0, 500);
      return out;
    }
    case 'items': {
      const out: Record<string, unknown> = {
        id: safeId,
        sku: String(cleaned.sku ?? '').slice(0, 80),
        name: String(cleaned.name ?? 'Item').slice(0, 200),
        company: String(cleaned.company ?? '').slice(0, 160),
        group: String(cleaned.group ?? '').slice(0, 120),
        cost: Number(cleaned.cost) || 0,
        price: Number(cleaned.price) || 0,
        reorder: Number(cleaned.reorder) || 0,
        barcode: String(cleaned.barcode ?? '').slice(0, 120),
        note: String(cleaned.note ?? '').slice(0, 500),
        batch: Boolean(cleaned.batch),
      };
      if (
        cleaned.trackingMode === 'global' ||
        cleaned.trackingMode === 'both' ||
        cleaned.trackingMode === 'lot' ||
        cleaned.trackingMode === 'expiry' ||
        cleaned.trackingMode === 'none'
      ) {
        out.trackingMode = cleaned.trackingMode;
      }
      return out;
    }
    case 'stocks':
      return {
        id: safeId,
        itemId: sanitizeValidId(cleaned.itemId, 'item'),
        branchId: sanitizeValidId(cleaned.branchId || defaultBranchId, defaultBranchId),
        batchNo: String(cleaned.batchNo ?? '').slice(0, 120),
        expiry: String(cleaned.expiry ?? '').slice(0, 32),
        qty: Math.max(0, Number(cleaned.qty) || 0),
        cost: Number(cleaned.cost) || 0,
      };
    case 'returnSlips':
      return {
        ...cleaned,
        id: safeId,
        branchId: sanitizeValidId(cleaned.branchId || defaultBranchId, defaultBranchId),
        customerId: sanitizeValidId(cleaned.customerId, 'cust'),
        returnInvoiceId: cleaned.returnInvoiceId
          ? sanitizeValidId(cleaned.returnInvoiceId, 'rinv')
          : null,
        lines: Array.isArray(cleaned.lines) ? cleaned.lines.slice(0, 500) : [],
      };
    case 'payments':
      return {
        ...cleaned,
        id: safeId,
        customerId: sanitizeValidId(cleaned.customerId, 'cust'),
        branchId: sanitizeValidId(cleaned.branchId || defaultBranchId, defaultBranchId),
        accountId: cleaned.accountId ? sanitizeValidId(cleaned.accountId, 'acc') : null,
        amount: Number(cleaned.amount) || 0,
        disc: Number(cleaned.disc) || 0,
        dir: cleaned.dir === 'out' ? 'out' : 'in',
        allocs: Array.isArray(cleaned.allocs) ? cleaned.allocs.slice(0, 500) : [],
      };
    case 'deliveries': {
      const out: Record<string, unknown> = {
        ...cleaned,
        id: safeId,
        branchId: sanitizeValidId(cleaned.branchId || defaultBranchId, defaultBranchId),
        customerId: sanitizeValidId(cleaned.customerId, 'cust'),
        lines: Array.isArray(cleaned.lines) ? cleaned.lines.slice(0, 500) : [],
      };
      if (cleaned.invoiceId) out.invoiceId = sanitizeValidId(cleaned.invoiceId, 'inv');
      else if (cleaned.invoiceId === '') out.invoiceId = '';
      if (cleaned.returnSlipId) out.returnSlipId = sanitizeValidId(cleaned.returnSlipId, 'rsl');
      else if (cleaned.returnSlipId === '') out.returnSlipId = '';
      return out;
    }
    case 'checks':
      return {
        ...cleaned,
        id: safeId,
        customerId: sanitizeValidId(cleaned.customerId, 'cust'),
        amount: Number(cleaned.amount) || 0,
        payouts: Array.isArray(cleaned.payouts) ? cleaned.payouts.slice(0, 200) : [],
        receivedDate: String(cleaned.receivedDate ?? '').slice(0, 32),
        dueDate: String(cleaned.dueDate ?? '').slice(0, 32),
      };
    case 'audit':
      return {
        id: safeId,
        ts: Math.trunc(Number(cleaned.ts) || Date.now()),
        user: String(cleaned.user ?? 'system').slice(0, 160),
        action: String(cleaned.action ?? '').slice(0, 200),
        details: String(cleaned.details ?? '').slice(0, 1000),
      };
    default:
      return cleaned;
  }
}

function stripFirestoreMeta(raw: DocumentData): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...raw };
  delete copy.createdAt;
  delete copy.updatedAt;
  delete copy.pass;
  delete copy.password;
  delete copy.passwordHash;
  return copy;
}

function stableStringify(val: unknown): string {
  if (val === null || val === undefined || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((v) => stableStringify(v)).join(',')}]`;
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify((val as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export function computeFirestoreDiffOps(params: {
  prevDb: DatabaseSchema;
  nextDb: DatabaseSchema;
  knownDocIds: KnownDocIdsMap;
  defaultBranchId?: string;
}): DiffWriteOp[] {
  const { prevDb, nextDb, knownDocIds, defaultBranchId = 'b1' } = params;
  const ops: DiffWriteOp[] = [];

  // 1. Settings
  const prevSettings = sanitizeSettingsForFirestore(prevDb.settings);
  const nextSettings = sanitizeSettingsForFirestore(nextDb.settings);
  if (stableStringify(prevSettings) !== stableStringify(nextSettings) || !knownDocIds.settings.has('main')) {
    ops.push({
      collection: 'settings',
      docId: 'main',
      action: knownDocIds.settings.has('main') ? 'update' : 'create',
      data: nextSettings,
    });
  }

  // 2. Counters (per branchId)
  const prevCounters = prevDb.counters || {};
  const nextCounters = nextDb.counters || {};
  const allBranchCounterIds = new Set([
    ...Object.keys(prevCounters),
    ...Object.keys(nextCounters),
  ]);
  for (const rawBid of allBranchCounterIds) {
    const bid = sanitizeValidId(rawBid, 'b1');
    const prevObj = prevCounters[rawBid] ? sanitizeCounterForFirestore(prevCounters[rawBid]) : null;
    const nextObj = nextCounters[rawBid] ? sanitizeCounterForFirestore(nextCounters[rawBid]) : null;

    if (!nextObj && prevObj && knownDocIds.counters.has(bid)) {
      ops.push({ collection: 'counters', docId: bid, action: 'delete' });
    } else if (
      nextObj &&
      (!prevObj || !knownDocIds.counters.has(bid) || stableStringify(prevObj) !== stableStringify(nextObj))
    ) {
      ops.push({
        collection: 'counters',
        docId: bid,
        action: knownDocIds.counters.has(bid) ? 'update' : 'create',
        data: nextObj,
      });
    }
  }

  // 3. Entity collections
  for (const col of ARRAY_COLLECTIONS) {
    const prevArr = Array.isArray((prevDb as unknown as Record<string, unknown>)[col])
      ? ((prevDb as unknown as Record<string, unknown>)[col] as Record<string, unknown>[])
      : [];
    const nextArr = Array.isArray((nextDb as unknown as Record<string, unknown>)[col])
      ? ((nextDb as unknown as Record<string, unknown>)[col] as Record<string, unknown>[])
      : [];

    const prevMap = new Map<string, Record<string, unknown>>();
    for (const item of prevArr) {
      if (!item || typeof item !== 'object') continue;
      const clean = sanitizeRecordForFirestore(col, item, defaultBranchId);
      prevMap.set(String(clean.id), clean);
    }

    const nextMap = new Map<string, Record<string, unknown>>();
    for (const item of nextArr) {
      if (!item || typeof item !== 'object') continue;
      const clean = sanitizeRecordForFirestore(col, item, defaultBranchId);
      nextMap.set(String(clean.id), clean);
    }

    const knownSet = knownDocIds[col];

    const isAppendOnly = col === 'audit' || col === 'adjusts';

    for (const [docId, cleanNext] of nextMap.entries()) {
      const cleanPrev = prevMap.get(docId);
      const existsInCloud = knownSet.has(docId);
      if (!existsInCloud) {
        ops.push({
          collection: col,
          docId,
          action: 'create',
          data: cleanNext,
        });
      } else if (!isAppendOnly && (!cleanPrev || stableStringify(cleanPrev) !== stableStringify(cleanNext))) {
        ops.push({
          collection: col,
          docId,
          action: 'update',
          data: cleanNext,
        });
      }
    }

    if (!isAppendOnly) {
      for (const docId of prevMap.keys()) {
        if (!nextMap.has(docId) && knownSet.has(docId)) {
          ops.push({
            collection: col,
            docId,
            action: 'delete',
          });
        }
      }
    }
  }

  return ops;
}

export async function commitDiffOps(
  ops: DiffWriteOp[],
  knownDocIds: KnownDocIdsMap
): Promise<void> {
  if (ops.length === 0) return;

  for (let i = 0; i < ops.length; i += BATCH_OP_LIMIT) {
    const chunk = ops.slice(i, i + BATCH_OP_LIMIT);
    const batch = writeBatch(firestoreDb);

    for (const op of chunk) {
      const ref = doc(firestoreDb, op.collection, op.docId);
      if (op.action === 'create') {
        batch.set(ref, {
          ...op.data,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else if (op.action === 'update') {
        batch.update(ref, {
          ...op.data,
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.delete(ref);
      }
    }

    const samplePath = `${chunk[0].collection}/${chunk[0].docId}`;
    try {
      await batch.commit();
      for (const op of chunk) {
        if (op.action === 'delete') {
          knownDocIds[op.collection].delete(op.docId);
        } else {
          knownDocIds[op.collection].add(op.docId);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, samplePath);
    }
  }
}

export async function bootstrapEmptyDatabaseInFirestore(
  adminUid: string
): Promise<{ db: DatabaseSchema; currentUser: User; knownDocIds: KnownDocIdsMap }> {
  const initial = emptyData();
  const safeUid = sanitizeValidId(adminUid, 'u1');

  const adminUser: User = {
    id: safeUid,
    name: 'Administrator',
    username: 'admin',
    pass: '',
    role: 'admin',
    branchIds: ['b1'],
    active: true,
    perms: {},
  };

  initial.users = [adminUser];
  initial.settings.workspaceInitialized = true;

  const knownDocIds = createEmptyKnownDocIds();

  // Step 1: Create /users/{adminUid} FIRST so isAdmin() evaluates true for remaining documents
  try {
    await setDoc(doc(firestoreDb, 'users', safeUid), {
      ...sanitizeUserForFirestore(adminUser, safeUid),
      theme: 'dark',
      sidebarCollapsed: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    knownDocIds.users.add(safeUid);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${safeUid}`);
  }

  // Step 2: Create settings/main, branch b1, counter b1, default accounts, and initial audit log
  const batch = writeBatch(firestoreDb);
  batch.set(doc(firestoreDb, 'settings', 'main'), {
    ...sanitizeSettingsForFirestore(initial.settings),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  knownDocIds.settings.add('main');

  for (const branch of initial.branches) {
    const cleanBranch = sanitizeRecordForFirestore('branches', branch as unknown as Record<string, unknown>);
    batch.set(doc(firestoreDb, 'branches', branch.id), {
      ...cleanBranch,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    knownDocIds.branches.add(branch.id);
  }

  for (const [bid, counterObj] of Object.entries(initial.counters)) {
    batch.set(doc(firestoreDb, 'counters', bid), {
      ...sanitizeCounterForFirestore(counterObj),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    knownDocIds.counters.add(bid);
  }

  for (const acc of initial.accounts) {
    const cleanAcc = sanitizeRecordForFirestore('accounts', acc as unknown as Record<string, unknown>);
    batch.set(doc(firestoreDb, 'accounts', acc.id), {
      ...cleanAcc,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    knownDocIds.accounts.add(acc.id);
  }

  for (const entry of initial.audit) {
    const cleanEntry = sanitizeRecordForFirestore('audit', entry as unknown as Record<string, unknown>);
    batch.set(doc(firestoreDb, 'audit', entry.id), {
      ...cleanEntry,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    knownDocIds.audit.add(entry.id);
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/main');
  }

  return {
    db: initial,
    currentUser: adminUser,
    knownDocIds,
  };
}

function collectDocsFromSnapshot<T>(
  snap: QuerySnapshot<DocumentData>,
  knownSet: Set<string>
): T[] {
  const result: T[] = [];
  snap.forEach((docSnap) => {
    knownSet.add(docSnap.id);
    result.push({ ...stripFirestoreMeta(docSnap.data()), id: docSnap.id } as T);
  });
  return result;
}

async function fetchGlobalCollection<T>(
  colName: ArrayCollectionName,
  allowed: boolean,
  knownDocIds: KnownDocIdsMap
): Promise<T[]> {
  if (!allowed) return [];
  try {
    const snap =
      colName === 'audit'
        ? await getDocs(query(collection(firestoreDb, colName), orderBy('ts', 'desc'), limit(800)))
        : await getDocs(collection(firestoreDb, colName));
    const items = collectDocsFromSnapshot<T>(snap, knownDocIds[colName]);
    return colName === 'audit' ? items.reverse() : items;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colName);
  }
}

async function fetchBranchScopedCollection<T>(
  colName: ArrayCollectionName,
  allowed: boolean,
  isAdmin: boolean,
  branchIds: string[],
  knownDocIds: KnownDocIdsMap
): Promise<T[]> {
  if (!allowed) return [];
  try {
    if (isAdmin) {
      const snap = await getDocs(collection(firestoreDb, colName));
      return collectDocsFromSnapshot<T>(snap, knownDocIds[colName]);
    }
    if (branchIds.length === 0) return [];
    const snaps = await Promise.all(
      branchIds.map((bid) =>
        getDocs(query(collection(firestoreDb, colName), where('branchId', '==', bid)))
      )
    );
    const byId = new Map<string, T>();
    snaps.forEach((snap) => {
      snap.forEach((docSnap) => {
        knownDocIds[colName].add(docSnap.id);
        byId.set(docSnap.id, { ...stripFirestoreMeta(docSnap.data()), id: docSnap.id } as T);
      });
    });
    return Array.from(byId.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, colName);
  }
}

async function fetchTransfers(
  allowed: boolean,
  isAdmin: boolean,
  branchIds: string[],
  knownDocIds: KnownDocIdsMap
) {
  if (!allowed) return [];
  try {
    if (isAdmin) {
      const snap = await getDocs(collection(firestoreDb, 'transfers'));
      return collectDocsFromSnapshot(snap, knownDocIds.transfers);
    }
    if (branchIds.length === 0) return [];
    const snaps = await Promise.all([
      ...branchIds.map((bid) =>
        getDocs(query(collection(firestoreDb, 'transfers'), where('fromBranchId', '==', bid)))
      ),
      ...branchIds.map((bid) =>
        getDocs(query(collection(firestoreDb, 'transfers'), where('toBranchId', '==', bid)))
      ),
    ]);
    const byId = new Map<string, unknown>();
    snaps.forEach((snap) => {
      snap.forEach((docSnap) => {
        knownDocIds.transfers.add(docSnap.id);
        byId.set(docSnap.id, { ...stripFirestoreMeta(docSnap.data()), id: docSnap.id });
      });
    });
    return Array.from(byId.values());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'transfers');
  }
}

export async function loadCompanyDataForUser(
  fbUser: FirebaseUser
): Promise<LoadCompanyDataResult> {
  const userPath = `users/${fbUser.uid}`;
  let userSnap;
  try {
    userSnap = await getDoc(doc(firestoreDb, 'users', fbUser.uid));
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code || '')
        : '';
    const msg = error instanceof Error ? error.message : String(error || '');
    if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
      return { status: 'inactive' };
    }
    handleFirestoreError(error, OperationType.GET, userPath);
  }

  if (!userSnap.exists()) {
    const emailLower = (fbUser.email || '').trim().toLowerCase();
    if (emailLower === 'admin@company.internal') {
      try {
        const boot = await bootstrapEmptyDatabaseInFirestore(fbUser.uid);
        return {
          status: 'ok',
          db: boot.db,
          currentUser: boot.currentUser,
          knownDocIds: boot.knownDocIds,
          userPrefs: { theme: 'dark', sidebarCollapsed: false },
          bootstrapped: true,
        };
      } catch {
        return { status: 'missing' };
      }
    }
    return { status: 'missing' };
  }

  const rawUserData = userSnap.data();
  const isDeleted = rawUserData.deleted === true;
  const currentUser: User = {
    id: fbUser.uid,
    name: String(rawUserData.name || fbUser.email || 'Employee'),
    username: String(rawUserData.username || ''),
    pass: '',
    role: rawUserData.role === 'admin' ? 'admin' : 'user',
    branchIds: Array.isArray(rawUserData.branchIds) ? rawUserData.branchIds.map(String) : [],
    active: !isDeleted && rawUserData.active === true,
    deleted: isDeleted,
    deletedAt: typeof rawUserData.deletedAt === 'number' ? rawUserData.deletedAt : undefined,
    perms:
      rawUserData.perms && typeof rawUserData.perms === 'object'
        ? { ...rawUserData.perms }
        : {},
  };

  if (!currentUser.active || currentUser.deleted) {
    return { status: 'inactive', currentUser };
  }

  const userPrefs: UserPreferences = {
    theme: rawUserData.theme === 'light' ? 'light' : 'dark',
    sidebarCollapsed: rawUserData.sidebarCollapsed === true,
  };

  const isAdmin = currentUser.role === 'admin';
  const perms = currentUser.perms || {};
  const branchIds = currentUser.branchIds || [];
  const knownDocIds = createEmptyKnownDocIds();
  knownDocIds.users.add(fbUser.uid);

  const hasAnyPerm = (...keys: string[]) => isAdmin || keys.some((k) => Boolean(perms[k]));
  const canAudit =
    isAdmin || (Boolean(perms.reports) && (!('report_audit' in perms) || Boolean(perms.report_audit)));

  // Parallel efficient Firestore reads (single query pass, scoped to role + branchIds)
  let settingsSnap;
  try {
    settingsSnap = await getDoc(doc(firestoreDb, 'settings', 'main'));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'settings/main');
  }

  if (settingsSnap.exists()) {
    knownDocIds.settings.add('main');
  }

  const [
    branches,
    users,
    counters,
    accounts,
    customers,
    items,
    stocks,
    invoices,
    deliveries,
    returnSlips,
    returnInvoices,
    intakes,
    arrivals,
    payments,
    checks,
    transfers,
    disposals,
    barters,
    adjusts,
    moneyMoves,
    expenses,
    audit,
  ] = await Promise.all([
    fetchGlobalCollection('branches', true, knownDocIds),
    isAdmin
      ? fetchGlobalCollection<User>('users', true, knownDocIds)
      : Promise.resolve([currentUser]),
    (async (): Promise<Record<string, Record<string, number>>> => {
      const counterMap: Record<string, Record<string, number>> = {};
      try {
        if (isAdmin) {
          const snap = await getDocs(collection(firestoreDb, 'counters'));
          snap.forEach((docSnap) => {
            knownDocIds.counters.add(docSnap.id);
            counterMap[docSnap.id] = sanitizeCounterForFirestore(docSnap.data());
          });
        } else {
          const snaps = await Promise.all(
            branchIds.map((bid) => getDoc(doc(firestoreDb, 'counters', bid)))
          );
          snaps.forEach((docSnap) => {
            if (docSnap.exists()) {
              knownDocIds.counters.add(docSnap.id);
              counterMap[docSnap.id] = sanitizeCounterForFirestore(docSnap.data());
            }
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, 'counters');
      }
      return counterMap;
    })(),
    fetchGlobalCollection('accounts', hasAnyPerm('ledger', 'sales', 'purchasing', 'checks', 'reports'), knownDocIds),
    fetchGlobalCollection('customers', hasAnyPerm('customers', 'sales', 'purchasing', 'ledger', 'barter', 'checks', 'reports'), knownDocIds),
    fetchGlobalCollection('items', hasAnyPerm('inventory', 'sales', 'purchasing', 'transfers', 'disposals', 'barter', 'reports'), knownDocIds),
    fetchBranchScopedCollection('stocks', hasAnyPerm('inventory', 'sales', 'purchasing', 'transfers', 'disposals', 'barter', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('invoices', hasAnyPerm('sales', 'ledger', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('deliveries', hasAnyPerm('sales', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('returnSlips', hasAnyPerm('sales', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('returnInvoices', hasAnyPerm('sales', 'ledger', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('intakes', hasAnyPerm('purchasing', 'ledger', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('arrivals', hasAnyPerm('purchasing', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('payments', hasAnyPerm('ledger', 'sales', 'purchasing', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchGlobalCollection('checks', hasAnyPerm('checks', 'ledger', 'reports'), knownDocIds),
    fetchTransfers(hasAnyPerm('transfers'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('disposals', hasAnyPerm('disposals', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('barters', hasAnyPerm('barter', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchBranchScopedCollection('adjusts', hasAnyPerm('inventory', 'adjust_inventory', 'reports'), isAdmin, branchIds, knownDocIds),
    fetchGlobalCollection('moneyMoves', hasAnyPerm('ledger', 'reports'), knownDocIds),
    fetchGlobalCollection('expenses', hasAnyPerm('ledger', 'reports'), knownDocIds),
    fetchGlobalCollection('audit', canAudit, knownDocIds),
  ]);

  const baseEmpty = emptyData();
  const loadedSettings = settingsSnap.exists()
    ? ({ ...baseEmpty.settings, ...stripFirestoreMeta(settingsSnap.data()) } as Settings)
    : baseEmpty.settings;

  const normalizedUsers = (users as User[]).map((u) => ({
    ...u,
    pass: '',
    deleted: u.deleted === true,
    deletedAt: typeof u.deletedAt === 'number' ? u.deletedAt : undefined,
    branchIds: Array.isArray(u.branchIds) ? u.branchIds : [],
    perms: u.perms && typeof u.perms === 'object' ? u.perms : {},
  }));

  const db = {
    settings: loadedSettings,
    branches,
    users: normalizedUsers,
    customers,
    items,
    accounts,
    invoices,
    deliveries,
    returnSlips,
    returnInvoices,
    intakes,
    arrivals,
    payments,
    checks,
    transfers,
    disposals,
    barters,
    adjusts,
    moneyMoves,
    expenses,
    stocks,
    audit,
    counters,
  } as DatabaseSchema;

  return {
    status: 'ok',
    db,
    currentUser,
    knownDocIds,
    userPrefs,
    bootstrapped: false,
  };
}

export async function updateOwnUserPrefs(
  uid: string,
  prefs: UserPreferences
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const patch: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (prefs.theme === 'light' || prefs.theme === 'dark') {
      patch.theme = prefs.theme;
    }
    if (typeof prefs.sidebarCollapsed === 'boolean') {
      patch.sidebarCollapsed = prefs.sidebarCollapsed;
    }
    await updateDoc(doc(firestoreDb, 'users', uid), patch);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export function subscribeUserAndSettings(
  uid: string,
  handlers: {
    onUserUpdate: (user: User, prefs: UserPreferences) => void;
    onUserRemovedOrDisabled: () => void;
    onSettingsUpdate: (settings: Settings) => void;
    onError: (err: unknown) => void;
  }
): Unsubscribe {
  const unsubUser = onSnapshot(
    doc(firestoreDb, 'users', uid),
    (snap) => {
      if (!snap.exists()) {
        handlers.onUserRemovedOrDisabled();
        return;
      }
      const data = snap.data();
      const isDeleted = data.deleted === true;
      const user: User = {
        id: snap.id,
        name: String(data.name || ''),
        username: String(data.username || ''),
        pass: '',
        role: data.role === 'admin' ? 'admin' : 'user',
        branchIds: Array.isArray(data.branchIds) ? data.branchIds.map(String) : [],
        active: !isDeleted && data.active === true,
        deleted: isDeleted,
        deletedAt: typeof data.deletedAt === 'number' ? data.deletedAt : undefined,
        perms: data.perms && typeof data.perms === 'object' ? { ...data.perms } : {},
      };
      if (!user.active || user.deleted) {
        handlers.onUserRemovedOrDisabled();
        return;
      }
      handlers.onUserUpdate(user, {
        theme: data.theme === 'light' ? 'light' : data.theme === 'dark' ? 'dark' : undefined,
        sidebarCollapsed:
          typeof data.sidebarCollapsed === 'boolean' ? data.sidebarCollapsed : undefined,
      });
    },
    (error) => {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String((error as { code?: unknown }).code || '')
          : '';
      const msg = error instanceof Error ? error.message : String(error || '');
      if (code === 'permission-denied' || msg.includes('Missing or insufficient permissions')) {
        handlers.onUserRemovedOrDisabled();
        return;
      }
      handlers.onError(error);
    }
  );

  const unsubSettings = onSnapshot(
    doc(firestoreDb, 'settings', 'main'),
    (snap) => {
      if (!snap.exists()) return;
      const base = emptyData().settings;
      handlers.onSettingsUpdate({
        ...base,
        ...stripFirestoreMeta(snap.data()),
      } as Settings);
    },
    (error) => {
      handlers.onError(error);
    }
  );

  return () => {
    unsubUser();
    unsubSettings();
  };
}

export function createAuditEntry(userLabel: string, action: string, details = '') {
  return {
    id: generateUid(),
    ts: Date.now(),
    user: userLabel || 'system',
    action: String(action || '').slice(0, 200),
    details: String(details || '').slice(0, 1000),
  };
}
