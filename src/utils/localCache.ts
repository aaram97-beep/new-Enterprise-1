import type { DatabaseSchema } from '../types';

export const ENTITY_KINDS = [
  'branches',
  'users',
  'customers',
  'items',
  'accounts',
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
  'stocks',
  'audit',
] as const;

export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface CachedDbEnvelope {
  db: DatabaseSchema;
  savedAt: number;
  revision: number;
  syncedCloudRevision?: number;
  syncedServerRevision?: number;
  syncedServerVersion?: number;
  workspaceId?: string;
}

export interface BootDbDecision {
  db: DatabaseSchema | null;
  remoteDb?: DatabaseSchema | null;
  source: 'server' | 'server-merged' | 'indexeddb-recovery' | 'localstorage-recovery' | 'seed';
  revision: number;
  syncedCloudRevision: number;
  needsServerWrite: boolean;
  needsMerge?: boolean;
}

export interface EntityRecord {
  key: string;
  id: string;
  kind: EntityKind;
  payload: Record<string, unknown>;
  status?: string;
}

export interface EntityDiffResult {
  workspaceChanged: boolean;
  upserts: EntityRecord[];
  deletes: string[];
}

const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
const VALID_ENTITY_STATUSES = new Set([
  'active',
  'transit',
  'completed',
  'cancelled',
  'pending',
  'approved',
  'rejected',
  'received',
  'deposited',
  'cleared',
  'bounced',
  'overdue',
  'done',
]);

const SEED_AUDIT_ACTIONS = new Set([
  'System initialized',
  'Opening stock',
  'Login',
  'Delivery',
]);

const IDB_NAME = 'enterprise_ims_cache_v1';
const IDB_STORE = 'snapshots';
const IDB_RECORD_KEY = 'primary_db';
export const FALLBACK_LOCAL_KEY = 'enterprise_ims_v2';

export function sanitizeValidId(rawId: unknown, fallbackPrefix = 'rec'): string {
  const s = String(rawId ?? '').trim();
  if (s && s.length <= 100 && VALID_ID_REGEX.test(s)) return s;
  const cleaned = s.replace(/[^a-zA-Z0-9_\-]+/g, '_').replace(/^_+|_+$/g, '');
  if (cleaned) return cleaned.slice(0, 100);
  return `${fallbackPrefix}_${Date.now().toString(36)}`.slice(0, 100);
}

/**
 * Recursively converts any JS object into a Firestore-safe structure:
 * - Removes object keys whose values are undefined
 * - Replaces non-finite numbers (NaN/Infinity) with 0
 * - Converts undefined array elements to null or filters cleanly
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === null || value === undefined) return null as T;
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as T;
  }
  if (typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sanitizeForFirestore(item))) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === undefined || typeof v === 'function' || typeof v === 'symbol') continue;
      out[k] = sanitizeForFirestore(v);
    }
    return out as T;
  }
  return null as T;
}

export function normalizeDbShape(db: any): db is DatabaseSchema {
  return Boolean(
    db &&
      typeof db === 'object' &&
      db.settings &&
      typeof db.settings === 'object' &&
      Array.isArray(db.items) &&
      Array.isArray(db.customers) &&
      Array.isArray(db.invoices)
  );
}

/**
 * Detects whether a database snapshot is merely an untouched demo seed or empty initial template.
 * Returns true if there is real user/business data or intentional settings/workspace edits
 * that must never be overwritten by seedData().
 */
export function hasSubstantiveBusinessData(db: DatabaseSchema | null | undefined): boolean {
  if (!db || !normalizeDbShape(db)) return false;
  if (db.settings.workspaceInitialized === true) return true;

  const isBlankTemplate =
    db.settings.companyName === 'My Company' &&
    db.items.length === 0 &&
    db.customers.length === 0 &&
    db.invoices.length === 0 &&
    (db.intakes || []).length === 0 &&
    (db.barters || []).length === 0 &&
    (db.payments || []).length === 0 &&
    (db.branches || []).length <= 1 &&
    (db.users || []).length <= 1 &&
    (db.audit || []).length <= 1;

  if (isBlankTemplate) return false;

  const hasDisabledFeature = Object.values(db.settings.features || {}).some((v) => v === false);
  const settingsCustomizedFromSeed =
    db.settings.companyName !== 'A97 Trading Co.' ||
    (db.settings.address || '') !== 'Main Street, Baghdad, Iraq' ||
    (db.settings.phone || '') !== '+964 771 000 0000' ||
    (db.settings.currency || '$') !== '$' ||
    Number(db.settings.taxRate || 0) !== 0 ||
    Number(db.settings.expiryWarnDays ?? 30) !== 30 ||
    (db.settings.lang || 'en') !== 'en' ||
    Boolean(db.settings.logo) ||
    db.settings.directSaleMode === true ||
    db.settings.isBranchCompany === true ||
    Number(db.settings.moneyDecimals ?? 2) !== 2 ||
    db.settings.showInOtherBranchStatus === false ||
    hasDisabledFeature;

  if (settingsCustomizedFromSeed) return true;

  const audit = Array.isArray(db.audit) ? db.audit : [];
  const matchesUntouchedDemoCounts =
    (db.settings.lotExpiryMode === undefined || db.settings.lotExpiryMode === 'both') &&
    db.settings.trackBatchExpiry !== false &&
    db.items.length === 12 &&
    db.customers.length === 24 &&
    db.invoices.length === 40 &&
    (db.deliveries || []).length === 35 &&
    (db.intakes || []).length === 21 &&
    (db.barters || []).length === 2 &&
    (db.branches || []).length === 3 &&
    (db.users || []).length === 2 &&
    db.users[0]?.pass === 'admin' &&
    db.users[1]?.pass === '1234' &&
    audit.length <= 5 &&
    audit.every((a) => SEED_AUDIT_ACTIONS.has(a.action));

  return !matchesUntouchedDemoCounts;
}

/**
 * Resolves the authoritative initial database on boot so container rebuilds or server resets
 * never erase real business data saved in the browser cache, and concurrent offline browser edits
 * can merge cleanly with newer server edits.
 */
export function pickBootDatabase(params: {
  serverExists: boolean;
  serverDb: DatabaseSchema | null;
  indexedDbEnvelope: CachedDbEnvelope | null;
  legacyLocalDb: DatabaseSchema | null;
}): BootDbDecision {
  const { serverExists, serverDb, indexedDbEnvelope, legacyLocalDb } = params;
  const serverValid = Boolean(serverExists && serverDb && normalizeDbShape(serverDb));
  const serverSubstantive = serverValid && hasSubstantiveBusinessData(serverDb);

  const idbDb = indexedDbEnvelope && normalizeDbShape(indexedDbEnvelope.db) ? indexedDbEnvelope.db : null;
  const idbSubstantive = Boolean(idbDb && hasSubstantiveBusinessData(idbDb));

  const legacyValid = Boolean(legacyLocalDb && normalizeDbShape(legacyLocalDb));
  const legacySubstantive = legacyValid && hasSubstantiveBusinessData(legacyLocalDb);

  const idbHasUnsyncedEdits = Boolean(
    idbDb &&
      idbSubstantive &&
      indexedDbEnvelope &&
      typeof indexedDbEnvelope.syncedServerRevision === 'number' &&
      indexedDbEnvelope.revision > indexedDbEnvelope.syncedServerRevision
  );

  if (serverSubstantive && serverDb) {
    if (idbHasUnsyncedEdits && idbDb) {
      return {
        db: idbDb,
        remoteDb: serverDb,
        source: 'server-merged',
        revision: Math.max(indexedDbEnvelope?.revision ?? 1, 1),
        syncedCloudRevision: indexedDbEnvelope?.syncedCloudRevision ?? 0,
        needsServerWrite: true,
        needsMerge: true,
      };
    }
    return {
      db: serverDb,
      source: 'server',
      revision: Math.max(indexedDbEnvelope?.revision ?? 1, 1),
      syncedCloudRevision: indexedDbEnvelope?.syncedCloudRevision ?? 0,
      needsServerWrite: false,
    };
  }

  if (idbDb && (idbSubstantive || !serverValid)) {
    return {
      db: idbDb,
      source: 'indexeddb-recovery',
      revision: Math.max(indexedDbEnvelope?.revision ?? 1, 1),
      syncedCloudRevision: indexedDbEnvelope?.syncedCloudRevision ?? 0,
      needsServerWrite: true,
    };
  }

  if (legacyValid && legacyLocalDb && (legacySubstantive || !serverValid)) {
    return {
      db: legacyLocalDb,
      source: 'localstorage-recovery',
      revision: 1,
      syncedCloudRevision: 0,
      needsServerWrite: true,
    };
  }

  if (serverValid && serverDb) {
    return {
      db: serverDb,
      source: 'server',
      revision: indexedDbEnvelope?.revision ?? 0,
      syncedCloudRevision: indexedDbEnvelope?.syncedCloudRevision ?? 0,
      needsServerWrite: false,
    };
  }

  return {
    db: null,
    source: 'seed',
    revision: 0,
    syncedCloudRevision: 0,
    needsServerWrite: true,
  };
}

export function extractEntityRecords(db: DatabaseSchema): Map<string, EntityRecord> {
  const map = new Map<string, EntityRecord>();
  for (const kind of ENTITY_KINDS) {
    const arr = (db as any)[kind];
    if (!Array.isArray(arr)) continue;
    for (let idx = 0; idx < arr.length; idx++) {
      const raw = arr[idx];
      if (!raw || typeof raw !== 'object') continue;
      const safeId = sanitizeValidId(raw.id, `${kind}_${idx}`);
      const key = `${kind}__${safeId}`;
      const cleanPayload = sanitizeForFirestore({ ...raw, id: safeId }) as Record<string, unknown>;
      const rawStatus = typeof raw.status === 'string' && VALID_ENTITY_STATUSES.has(raw.status) ? raw.status : undefined;
      map.set(key, {
        key,
        id: safeId,
        kind,
        payload: cleanPayload,
        status: rawStatus,
      });
    }
  }
  return map;
}

export function computeEntityDiff(
  prevDb: DatabaseSchema | null,
  nextDb: DatabaseSchema
): EntityDiffResult {
  const nextMap = extractEntityRecords(nextDb);
  if (!prevDb) {
    return {
      workspaceChanged: true,
      upserts: Array.from(nextMap.values()),
      deletes: [],
    };
  }

  const prevMap = extractEntityRecords(prevDb);
  const upserts: EntityRecord[] = [];
  const deletes: string[] = [];

  for (const [key, rec] of nextMap.entries()) {
    const prevRec = prevMap.get(key);
    if (!prevRec || JSON.stringify(prevRec.payload) !== JSON.stringify(rec.payload) || prevRec.status !== rec.status) {
      upserts.push(rec);
    }
  }

  for (const key of prevMap.keys()) {
    if (!nextMap.has(key)) {
      deletes.push(key);
    }
  }

  const workspaceChanged =
    JSON.stringify(sanitizeForFirestore(prevDb.settings)) !== JSON.stringify(sanitizeForFirestore(nextDb.settings)) ||
    JSON.stringify(sanitizeForFirestore(prevDb.counters)) !== JSON.stringify(sanitizeForFirestore(nextDb.counters));

  return {
    workspaceChanged,
    upserts,
    deletes,
  };
}

function fnv1aHashPair(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c + ((i & 0xff) << 3);
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  return `${(h1 >>> 0).toString(36)}:${(h2 >>> 0).toString(36)}:${input.length}`;
}

export function computeDatabaseFingerprint(db: DatabaseSchema): string {
  const parts: string[] = [
    JSON.stringify(sanitizeForFirestore(db.settings || {})),
    JSON.stringify(sanitizeForFirestore(db.counters || {})),
  ];
  for (const kind of ENTITY_KINDS) {
    const arr = (db as unknown as Record<string, unknown>)[kind];
    parts.push(`${kind}:${JSON.stringify(sanitizeForFirestore(Array.isArray(arr) ? arr : []))}`);
  }
  return fnv1aHashPair(parts.join('|'));
}

export function readLegacyLocalDb(): DatabaseSchema | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(FALLBACK_LOCAL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return normalizeDbShape(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeLegacyLocalDb(db: DatabaseSchema): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(FALLBACK_LOCAL_KEY, JSON.stringify(db));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function openCacheDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function readIndexedDbEnvelope(): Promise<CachedDbEnvelope | null> {
  const idb = await openCacheDb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_RECORD_KEY);
      req.onsuccess = () => {
        const val = req.result as CachedDbEnvelope | undefined;
        idb.close();
        if (val && normalizeDbShape(val.db)) {
          resolve(val);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        idb.close();
        resolve(null);
      };
    } catch {
      idb.close();
      resolve(null);
    }
  });
}

export async function writeIndexedDbEnvelope(envelope: CachedDbEnvelope): Promise<void> {
  // Always update localStorage backup first if small enough so even pre-load fallback survives
  writeLegacyLocalDb(envelope.db);
  const idb = await openCacheDb();
  if (!idb) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(envelope, IDB_RECORD_KEY);
      tx.oncomplete = () => {
        idb.close();
        resolve();
      };
      tx.onerror = () => {
        idb.close();
        resolve();
      };
    } catch {
      idb.close();
      resolve();
    }
  });
}
