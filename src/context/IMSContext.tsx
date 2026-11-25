import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type {
  DatabaseSchema,
  UserSession,
  Invoice,
  Delivery,
  ReturnSlip,
  ReturnInvoice,
  Intake,
  Arrival,
  Payment,
  CheckDoc,
  Transfer,
  Disposal,
  Barter,
  Item,
  Customer,
  User,
  Branch,
  MoneyAccount,
  MoneyMove,
  Expense,
  StockAdjust,
  StockBatch,
} from '../types';
import { seedData, emptyData } from '../data/seedData';
import { NAVS, FEATURE_KEYS } from '../data/constants';
import { r2, uid, todayStr, addDays, setGlobalMoneyDecimals, toIsoDate } from '../utils/formatters';
import { simulateStock } from '../utils/stockSimulation';
import { processDirectSaleInvoiceStock } from '../utils/directSale';
import {
  isProtectedViewAllowed,
  resolveAuthenticatedUser,
} from '../utils/sessionAuth';
import { tx } from '../utils/translations';
import { returnSlipRemaining } from '../utils/calculations';
import {
  canDelete as checkCanDelete,
  canEdit as checkCanEdit,
  canAdjustInventory as checkCanAdjustInventory,
  canViewReport as checkCanViewReport,
  canViewCost as checkCanViewCost,
  canViewCompanyWorth as checkCanViewCompanyWorth,
  maskCost as checkMaskCost,
  maskWorth as checkMaskWorth,
  hasSectionAccess,
} from '../utils/permissions';
import {
  auth,
  createEmployeeAuthUser,
  extractFirebaseAuthCode,
  isValidInternalUsername,
  mapAuthError,
  testConnection,
  updateCurrentUserPassword,
  usernameToInternalEmail,
} from '../firebase';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import type { Unsubscribe } from 'firebase/firestore';
import {
  cloneKnownDocIds,
  commitDiffOps,
  computeFirestoreDiffOps,
  createAuditEntry,
  createEmptyKnownDocIds,
  loadCompanyDataForUser,
  sanitizeSettingsForFirestore,
  sanitizeUserForFirestore,
  subscribeUserAndSettings,
  updateOwnUserPrefs,
  type KnownDocIdsMap,
} from '../utils/firestoreSync';

function cloneDb(source: DatabaseSchema): DatabaseSchema {
  if (typeof structuredClone === 'function') {
    return structuredClone(source);
  }
  return JSON.parse(JSON.stringify(source)) as DatabaseSchema;
}

function stableJson(val: unknown): string {
  if (val === null || val === undefined || typeof val !== 'object') {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map((v) => stableJson(v)).join(',')}]`;
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson((val as Record<string, unknown>)[k])}`).join(',')}}`;
}

function migrateDb(rawDb: any, recomputeStocks = false): DatabaseSchema {
  const base = emptyData();
  const db: any = {
    ...base,
    ...rawDb,
  };
  if (!Array.isArray(db.arrivals)) db.arrivals = [];
  if (!db.settings) db.settings = { ...base.settings };
  else {
    db.settings = { ...base.settings, ...db.settings };
    if (!db.settings.lang) db.settings.lang = 'en';
  }

  if (!db.settings.features) {
    const feats: Record<string, boolean> = {};
    FEATURE_KEYS.forEach((f) => {
      feats[f.k] = true;
    });
    db.settings.features = feats;
  }
  if (db.settings.showInOtherBranchStatus === undefined) {
    db.settings.showInOtherBranchStatus = true;
  }
  if (db.settings.moneyDecimals === undefined) {
    db.settings.moneyDecimals = 2;
  }
  setGlobalMoneyDecimals(db.settings.moneyDecimals);

  // Migrate intakes with legacy lot/expiry lines to arrivals if imported from an old backup
  if (Array.isArray(db.intakes)) {
    db.intakes.forEach((p: any) => {
      if ((p.lines || []).some((l: any) => 'batchNo' in l || 'expiry' in l)) {
        db.arrivals.push({
          id: uid(),
          no: (p.no || '').replace('INT-', 'ARR-'),
          date: p.date,
          intakeId: p.id,
          branchId: p.branchId,
          note: 'Arrived (migrated)',
          lines: p.lines.map((l: any) => ({
            itemId: l.itemId,
            qty: r2(l.qty || 0),
            cost: r2(l.cost || 0),
            batchNo: l.batchNo || '',
            expiry: l.expiry || '',
          })),
        });
        p.lines = p.lines.map((l: any) => ({ itemId: l.itemId, qty: r2(l.qty || 0), cost: r2(l.cost || 0) }));
      }
    });
  }

  if (!Array.isArray(db.accounts) || !db.accounts.length) {
    db.accounts = [];
    (db.branches || []).forEach((b: any) => {
      db.accounts.push({
        id: 'acc-' + b.id + '-cash',
        name: b.name + '   Cashbox',
        type: 'cashbox',
        branchId: b.id,
        opening: 0,
        note: '',
      });
    });
    db.accounts.push({
      id: 'acc-cheq',
      name: 'Cheques in Hand',
      type: 'cheques',
      branchId: null,
      opening: 0,
      note: '',
    });
  }

  if (!Array.isArray(db.moneyMoves)) db.moneyMoves = [];
  if (!Array.isArray(db.expenses)) db.expenses = [];
  if (!Array.isArray(db.stocks)) db.stocks = [];
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.branches)) db.branches = [];

  if (Array.isArray(db.payments)) {
    db.payments.forEach((p: any) => {
      if (!p.branchId) {
        const m = (p.no || '').match(/BR(\d+)/);
        p.branchId = m ? 'b' + m[1] : (db.branches[0] || {}).id || 'b1';
      }
      if (!p.accountId) {
        p.accountId =
          ((db.accounts.filter((a: any) => a.type === 'cashbox' && a.branchId === p.branchId)[0]) || {}).id ||
          null;
      }
    });
  }

  if (!db.counters) db.counters = {};
  for (const bid in db.counters) {
    db.counters[bid] = { ...db.counters[bid] };
    if (!('MTR' in db.counters[bid])) db.counters[bid].MTR = 1000;
    if (!('EXP' in db.counters[bid])) db.counters[bid].EXP = 1000;
    if (!('ARR' in db.counters[bid])) db.counters[bid].ARR = 1000;
  }

  // Only normalize passwords away when loading into client state
  db.users = (db.users || []).map((u: any) => ({
    ...u,
    pass: '',
    deleted: u.deleted === true,
    deletedAt: typeof u.deletedAt === 'number' ? u.deletedAt : undefined,
    branchIds: Array.isArray(u.branchIds) ? u.branchIds : [],
    perms: u.perms && typeof u.perms === 'object' ? u.perms : {},
  }));

  if (recomputeStocks) {
    const v39 = (db.invoices || []).find((x: any) => x.no === 'INV-BR2-1011' || x.id === 'v39');
    if (v39) {
      v39.date = addDays(todayStr(), -14);
      const dels = (db.deliveries || []).filter((d: any) => d.invoiceId === v39.id);
      if (dels.length === 1 || (dels.length === 3 && dels.some((d: any) => d.no === 'DEL-BR2-1010' && d.date > todayStr()))) {
        const other = (db.deliveries || []).filter((d: any) => d.invoiceId !== v39.id);
        const del1 = {
          id: 'dl-mig-v39-1',
          no: 'DEL-BR2-1009',
          date: addDays(todayStr(), -14),
          invoiceId: v39.id,
          customerId: v39.customerId,
          branchId: v39.branchId,
          lines: [
            { itemId: 'i7', qty: 2, batchNo: 'OPEN-1', expiry: addDays(todayStr(), 240), cost: 1.4 },
            { itemId: 'i3', qty: 2, batchNo: 'OPEN-1', expiry: addDays(todayStr(), 240), cost: 1.2 },
          ],
        };
        const del2 = {
          id: 'dl-mig-v39-2',
          no: 'DEL-BR2-1010',
          date: addDays(todayStr(), -9),
          invoiceId: v39.id,
          customerId: v39.customerId,
          branchId: v39.branchId,
          lines: [
            { itemId: 'i7', qty: 3, batchNo: 'OPEN-1', expiry: addDays(todayStr(), 240), cost: 1.4 },
            { itemId: 'i3', qty: 3, batchNo: 'OPEN-1', expiry: addDays(todayStr(), 240), cost: 1.2 },
          ],
        };
        const del3 = {
          id: (dels.find((d: any) => d.no === 'DEL-BR2-1011') || {}).id || 'dl-mig-v39-3',
          no: 'DEL-BR2-1011',
          date: todayStr(),
          invoiceId: v39.id,
          customerId: v39.customerId,
          branchId: v39.branchId,
          lines: [
            { itemId: 'i7', qty: 2, batchNo: 'OPEN-1', expiry: addDays(todayStr(), 240), cost: 1.4 },
            { itemId: 'i3', qty: 2, batchNo: 'OPEN-1', expiry: addDays(todayStr(), 240), cost: 1.2 },
          ],
        };
        db.deliveries = [...other, del1, del2, del3];
      }
    }
    db.stocks = simulateStock(db);
  }

  return db as DatabaseSchema;
}

export interface ToastState {
  message: string;
  type: 'ok' | 'error';
}

export interface ErrorLogItem {
  ts: number;
  msg: string;
  src?: string;
}

interface IMSContextType {
  db: DatabaseSchema;
  session: UserSession | null;
  branchId: string;
  view: string;
  theme: 'light' | 'dark';
  sidebarCollapsed: boolean;
  syncing: boolean;
  toast: ToastState | null;
  errBanner: string;
  errLog: ErrorLogItem[];
  setDb: React.Dispatch<React.SetStateAction<DatabaseSchema>>;
  setView: (v: string) => void;
  setBranchId: (b: string) => void;
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  setSidebarCollapsed: (collapsed: boolean | ((prev: boolean) => boolean)) => void;
  setErrBanner: (b: string) => void;
  setErrLog: React.Dispatch<React.SetStateAction<ErrorLogItem[]>>;
  toastMsg: (msg: string, type?: 'ok' | 'error') => void;
  audit: (action: string, details?: string) => void;
  logError: (msg: string, src?: string) => void;
  login: (user: string, pass: string, remember?: boolean) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  t: (key: string) => string;
  featOn: (key?: string) => boolean;
  canAccess: (section: string) => boolean;
  myBranches: Branch[];
  allowedNavs: typeof NAVS;
  sessionUser: User | null;
  nextNo: (branchId: string | null | undefined, type: string) => string;
  stockOf: (itemId: string | null | undefined, branchId?: string | null) => number;
  stocksOf: (itemId: string | null | undefined, branchId?: string | null) => StockBatch[];
  addStock: (itemId: string, branchId: string, batchNo: string | undefined, expiry: string | undefined, qty: number, cost?: number) => void;
  takeStock: (stockId: string, qty: number) => { ok: boolean; msg?: string; itemId?: string; batchNo?: string; expiry?: string; cost?: number };
  takeFEFO: (itemId: string, branchId: string, qty: number) => { ok: boolean; msg?: string; taken?: { qty: number; batchNo?: string; expiry?: string }[] };
  subtractStock: (itemId: string, branchId: string, batchNo: string | undefined, expiry: string | undefined, qty: number) => void;
  saveInvoice: (invoice: Invoice) => { ok: boolean; error?: string };
  deleteInvoice: (invoice: Invoice) => void;
  saveDelivery: (delivery: Delivery) => { ok: boolean; error?: string };
  deleteDelivery: (delivery: Delivery) => void;
  saveReturnSlip: (slip: ReturnSlip) => void;
  deleteReturnSlip: (slip: ReturnSlip) => void;
  saveReturnInvoice: (creditNote: ReturnInvoice) => void;
  deleteReturnInvoice: (creditNote: ReturnInvoice) => void;
  saveIntake: (intake: Intake) => { ok: boolean; error?: string };
  deleteIntake: (intake: Intake) => { ok: boolean; error?: string };
  saveArrival: (arrival: Arrival) => { ok: boolean; error?: string };
  deleteArrival: (arrival: Arrival) => void;
  confirmPayment: (payment: Payment) => void;
  deletePayment: (payment: Payment) => void;
  saveBarter: (barter: Barter) => { ok: boolean; error?: string };
  deleteBarter: (barter: Barter) => void;
  saveCheck: (check: CheckDoc) => void;
  deleteCheck: (check: CheckDoc) => void;
  setCheckStatus: (check: CheckDoc, status: CheckDoc['status']) => void;
  confirmPayout: (check: CheckDoc, amount: number, date?: string, note?: string, targetAccountId?: string) => void;
  saveTransfer: (transfer: Transfer) => { ok: boolean; error?: string };
  receiveTransfer: (transfer: Transfer) => void;
  cancelTransfer: (transfer: Transfer) => void;
  saveDisposal: (disposal: Disposal) => void;
  approveDisposal: (disposal: Disposal) => void;
  rejectDisposal: (disposal: Disposal) => void;
  saveItem: (item: Item) => void;
  deleteItem: (item: Item) => void;
  saveCustomer: (customer: Customer) => void;
  deleteCustomer: (customer: Customer) => void;
  saveUser: (user: User) => Promise<{ ok: boolean; error?: string }>;
  deleteUser: (user: User) => Promise<void>;
  saveBranch: (branch: Branch) => { ok: boolean; error?: string };
  deleteBranch: (branch: Branch) => void;
  saveAdjust: (adj: StockAdjust) => { ok: boolean; error?: string };
  saveAccount: (account: MoneyAccount) => { ok: boolean; error?: string };
  deleteAccount: (account: MoneyAccount) => { ok: boolean; error?: string };
  saveMove: (move: MoneyMove) => { ok: boolean; error?: string };
  acceptMove: (move: MoneyMove) => void;
  cancelMove: (move: MoneyMove) => void;
  saveExpense: (expense: Expense) => { ok: boolean; error?: string };
  deleteExpense: (expense: Expense) => void;
  loadDemoData: () => void;
  eraseAllData: () => void;
  restoreDatabase: (newDb: DatabaseSchema) => void;
  canDelete: (section: string) => boolean;
  canEdit: (section: string) => boolean;
  canAdjustInventory: () => boolean;
  canViewReport: (reportId: string) => boolean;
  canViewCost: () => boolean;
  canViewCompanyWorth: () => boolean;
  maskCost: (val: number | string | undefined | null, currency?: string) => string;
  maskWorth: (val: number | string | undefined | null, currency?: string, placeholder?: string) => string;
}

const IMSContext = createContext<IMSContextType | undefined>(undefined);

export const IMSProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [db, setDb] = useState<DatabaseSchema>(() => migrateDb(emptyData(), false));
  const [isDbReady, setIsDbReady] = useState<boolean>(false);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [session, setSession] = useState<UserSession | null>(null);

  const [branchId, setBranchId] = useState<string>('b1');
  const [view, setView] = useState<string>('dash');
  const [theme, setThemeState] = useState<'light' | 'dark'>('dark');
  const [sidebarCollapsed, setSidebarCollapsedState] = useState<boolean>(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [errBanner, setErrBanner] = useState<string>('');
  const [errLog, setErrLog] = useState<ErrorLogItem[]>([]);

  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestDbRef = useRef<DatabaseSchema>(db);
  latestDbRef.current = db;
  const sessionRef = useRef<UserSession | null>(session);
  sessionRef.current = session;

  const knownDocIdsRef = useRef<KnownDocIdsMap>(createEmptyKnownDocIds());
  const lastSavedDbRef = useRef<DatabaseSchema | null>(null);
  const skipNextSaveRef = useRef<boolean>(false);
  const loadedUidRef = useRef<string | null>(null);
  const loginInFlightRef = useRef<boolean>(false);
  const loggingOutRef = useRef<boolean>(false);
  const saveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const userSettingsUnsubRef = useRef<Unsubscribe | null>(null);

  const toastMsg = useCallback((message: string, type: 'ok' | 'error' = 'ok') => {
    setToast({ message, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 2800);
  }, []);

  const logError = useCallback((msg: string, src?: string) => {
    const m = String(msg || 'Unknown error').slice(0, 300);
    setErrLog((prev) => [...prev, { ts: Date.now(), msg: m, src: src || '' }].slice(-20));
    setErrBanner(m);
  }, []);

  const setTheme = useCallback((nextTheme: 'light' | 'dark') => {
    setThemeState(nextTheme);
    const uidNow = auth.currentUser?.uid;
    if (uidNow) {
      void updateOwnUserPrefs(uidNow, { theme: nextTheme }).catch(() => undefined);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      const uidNow = auth.currentUser?.uid;
      if (uidNow) {
        void updateOwnUserPrefs(uidNow, { theme: next }).catch(() => undefined);
      }
      return next;
    });
  }, []);

  const setSidebarCollapsed = useCallback(
    (collapsed: boolean | ((prev: boolean) => boolean)) => {
      setSidebarCollapsedState((prev) => {
        const next = typeof collapsed === 'function' ? collapsed(prev) : collapsed;
        const uidNow = auth.currentUser?.uid;
        if (uidNow) {
          void updateOwnUserPrefs(uidNow, { sidebarCollapsed: next }).catch(() => undefined);
        }
        return next;
      });
    },
    []
  );

  // Sync theme with HTML root class
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.classList.remove('density-compact', 'density-standard', 'density-auto');
  }, []);

  // Sync global money decimal places
  useEffect(() => {
    setGlobalMoneyDecimals(db.settings.moneyDecimals ?? 2);
  }, [db.settings.moneyDecimals]);

  const cleanupRealtimeListeners = useCallback(() => {
    if (userSettingsUnsubRef.current) {
      userSettingsUnsubRef.current();
      userSettingsUnsubRef.current = null;
    }
  }, []);

  const attachRealtimeListeners = useCallback(
    (uidNow: string) => {
      cleanupRealtimeListeners();
      userSettingsUnsubRef.current = subscribeUserAndSettings(uidNow, {
        onUserUpdate: (updatedUser, prefs) => {
          if (prefs.theme === 'light' || prefs.theme === 'dark') {
            setThemeState(prefs.theme);
          }
          if (typeof prefs.sidebarCollapsed === 'boolean') {
            setSidebarCollapsedState(prefs.sidebarCollapsed);
          }
          setSession((prev) =>
            prev && prev.id === updatedUser.id
              ? {
                  id: updatedUser.id,
                  name: updatedUser.name,
                  role: updatedUser.role,
                  username: updatedUser.username,
                }
              : prev
          );
          // Sync remote permission/role changes without echoing writes back to Firestore
          const prevUser = latestDbRef.current.users.find((u) => u.id === updatedUser.id);
          if (
            prevUser &&
            stableJson(sanitizeUserForFirestore(prevUser)) !==
              stableJson(sanitizeUserForFirestore(updatedUser))
          ) {
            if (lastSavedDbRef.current) {
              lastSavedDbRef.current = {
                ...lastSavedDbRef.current,
                users: lastSavedDbRef.current.users.map((u) =>
                  u.id === updatedUser.id ? updatedUser : u
                ),
              };
            }
            skipNextSaveRef.current = true;
            setDb((prev) => ({
              ...prev,
              users: prev.users.map((u) => (u.id === updatedUser.id ? updatedUser : u)),
            }));
          }
        },
        onUserRemovedOrDisabled: () => {
          cleanupRealtimeListeners();
          loadedUidRef.current = null;
          lastSavedDbRef.current = null;
          knownDocIdsRef.current = createEmptyKnownDocIds();
          setSession(null);
          setDb(migrateDb(emptyData(), false));
          setErrBanner('Your account was deactivated or removed. Contact an administrator.');
          void signOut(auth).catch(() => undefined);
        },
        onSettingsUpdate: (nextSettings) => {
          const curClean = sanitizeSettingsForFirestore(latestDbRef.current.settings);
          const nextClean = sanitizeSettingsForFirestore(nextSettings);
          if (stableJson(curClean) === stableJson(nextClean)) return;
          if (lastSavedDbRef.current) {
            lastSavedDbRef.current = {
              ...lastSavedDbRef.current,
              settings: nextSettings,
            };
          }
          skipNextSaveRef.current = true;
          setDb((prev) => ({ ...prev, settings: nextSettings }));
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : 'Realtime listener error';
          logError(msg, 'firestore-listener');
        },
      });
    },
    [cleanupRealtimeListeners, logError]
  );

  const hydrateAuthenticatedWorkspace = useCallback(
    async (fbUser: FirebaseUser, opts?: { addLoginAudit?: boolean }): Promise<'ok' | 'inactive' | 'missing'> => {
      const loaded = await loadCompanyDataForUser(fbUser);
      if (loaded.status !== 'ok' || !loaded.db || !loaded.currentUser || !loaded.knownDocIds) {
        return loaded.status === 'inactive' ? 'inactive' : 'missing';
      }

      const migrated = migrateDb(loaded.db, false);
      const nextSession: UserSession = {
        id: loaded.currentUser.id,
        name: loaded.currentUser.name,
        role: loaded.currentUser.role,
        username: loaded.currentUser.username,
      };

      knownDocIdsRef.current = cloneKnownDocIds(loaded.knownDocIds);
      lastSavedDbRef.current = cloneDb(migrated);
      loadedUidRef.current = fbUser.uid;

      if (loaded.userPrefs?.theme === 'light' || loaded.userPrefs?.theme === 'dark') {
        setThemeState(loaded.userPrefs.theme);
      } else {
        setThemeState('dark');
      }
      setSidebarCollapsedState(Boolean(loaded.userPrefs?.sidebarCollapsed));

      const defaultBranch =
        loaded.currentUser.role === 'admin'
          ? migrated.branches[0]?.id || 'b1'
          : loaded.currentUser.branchIds[0] || migrated.branches[0]?.id || 'b1';
      setBranchId(defaultBranch);

      skipNextSaveRef.current = true;
      setDb(migrated);
      setSession(nextSession);
      setErrBanner('');
      attachRealtimeListeners(fbUser.uid);
      void testConnection();

      if (opts?.addLoginAudit) {
        const entry = createAuditEntry(nextSession.name, 'Login', nextSession.username);
        setDb((prev) => ({
          ...prev,
          audit: [...prev.audit, entry].slice(-800),
        }));
      }

      return 'ok';
    },
    [attachRealtimeListeners]
  );

  // Firebase Auth session observer (single initial load when already signed in; instant login view otherwise)
  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
      if (!active) return;
      if (loginInFlightRef.current) return;

      if (!fbUser) {
        cleanupRealtimeListeners();
        loadedUidRef.current = null;
        lastSavedDbRef.current = null;
        knownDocIdsRef.current = createEmptyKnownDocIds();
        skipNextSaveRef.current = true;
        setSession(null);
        setDb(migrateDb(emptyData(), false));
        setIsDbReady(true);
        return;
      }

      if (loadedUidRef.current === fbUser.uid) {
        setIsDbReady(true);
        return;
      }

      try {
        setSyncing(true);
        const status = await hydrateAuthenticatedWorkspace(fbUser, { addLoginAudit: false });
        if (!active) return;
        if (status !== 'ok') {
          await signOut(auth).catch(() => undefined);
          loadedUidRef.current = null;
          lastSavedDbRef.current = null;
          knownDocIdsRef.current = createEmptyKnownDocIds();
          setSession(null);
          setDb(migrateDb(emptyData(), false));
          setErrBanner(
            status === 'inactive'
              ? 'Your account is inactive. Contact an administrator.'
              : 'User profile not found in Firestore.'
          );
        }
      } catch (err) {
        if (!active) return;
        const msg = err instanceof Error ? err.message : 'Failed to load company data from Firestore';
        logError(msg, 'firestore-boot');
      } finally {
        if (active) {
          setSyncing(false);
          setIsDbReady(true);
        }
      }
    });

    return () => {
      active = false;
      cleanupRealtimeListeners();
      unsub();
    };
  }, [cleanupRealtimeListeners, hydrateAuthenticatedWorkspace, logError]);

  const flushFirestoreWrites = useCallback(async () => {
    const uidNow = auth.currentUser?.uid;
    if (!uidNow || loadedUidRef.current !== uidNow || !lastSavedDbRef.current) {
      return;
    }

    const executeTask = async () => {
      const currentUid = auth.currentUser?.uid;
      if (!currentUid || loadedUidRef.current !== currentUid || !lastSavedDbRef.current) {
        return;
      }
      const nextSnapshot = cloneDb(latestDbRef.current);
      const prevSnapshot = lastSavedDbRef.current;
      const defaultBid = nextSnapshot.branches[0]?.id || 'b1';

      const ops = computeFirestoreDiffOps({
        prevDb: prevSnapshot,
        nextDb: nextSnapshot,
        knownDocIds: knownDocIdsRef.current,
        defaultBranchId: defaultBid,
      });

      if (ops.length === 0) {
        lastSavedDbRef.current = nextSnapshot;
        return;
      }

      setSyncing(true);
      try {
        await commitDiffOps(ops, knownDocIdsRef.current);
        lastSavedDbRef.current = nextSnapshot;
      } finally {
        setSyncing(false);
      }
    };

    const nextPromise = writeQueueRef.current.then(executeTask, executeTask);
    writeQueueRef.current = nextPromise.catch(() => undefined);
    return nextPromise;
  }, []);

  // Incremental debounced Firestore persistence when state changes
  useEffect(() => {
    if (!isDbReady || !session || !loadedUidRef.current) return;
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }

    const timer = setTimeout(() => {
      saveDebounceTimerRef.current = null;
      if (loggingOutRef.current) return;
      void flushFirestoreWrites().catch((err) => {
        const msg = err instanceof Error ? err.message : 'Failed to save changes to Firestore';
        logError(`Firestore save error: ${msg}`, 'firestore-write');
        toastMsg('Could not save changes to Firestore', 'error');
      });
    }, 150);
    saveDebounceTimerRef.current = timer;

    return () => {
      clearTimeout(timer);
      if (saveDebounceTimerRef.current === timer) {
        saveDebounceTimerRef.current = null;
      }
    };
  }, [db, isDbReady, session, flushFirestoreWrites, logError, toastMsg]);

  const audit = useCallback(
    (action: string, details?: string) => {
      setDb((prev) => {
        const item = createAuditEntry(sessionRef.current ? sessionRef.current.name : 'system', action, details || '');
        const nextAudit = [...prev.audit, item];
        if (nextAudit.length > 800) nextAudit.splice(0, nextAudit.length - 800);
        return { ...prev, audit: nextAudit };
      });
    },
    []
  );

  const sessionUser = resolveAuthenticatedUser(session, db.users);

  // Immediately clear stale or deactivated sessions once DB is ready
  useEffect(() => {
    if (!isDbReady || !session || loggingOutRef.current) return;
    if (!sessionUser) {
      cleanupRealtimeListeners();
      loadedUidRef.current = null;
      setSession(null);
      void signOut(auth).catch(() => undefined);
    }
  }, [isDbReady, session, sessionUser, cleanupRealtimeListeners]);

  const canDelete = useCallback(
    (section: string) => checkCanDelete(sessionUser, section),
    [sessionUser]
  );
  const canEdit = useCallback(
    (section: string) => checkCanEdit(sessionUser, section),
    [sessionUser]
  );
  const canAdjustInventory = useCallback(
    () => checkCanAdjustInventory(sessionUser),
    [sessionUser]
  );
  const canViewReport = useCallback(
    (reportId: string) => checkCanViewReport(sessionUser, reportId),
    [sessionUser]
  );
  const canViewCost = useCallback(
    () => checkCanViewCost(sessionUser, db.settings.isBranchCompany),
    [sessionUser, db.settings.isBranchCompany]
  );
  const canViewCompanyWorth = useCallback(
    () => checkCanViewCompanyWorth(sessionUser, db.settings.isBranchCompany),
    [sessionUser, db.settings.isBranchCompany]
  );
  const maskCost = useCallback(
    (val: number | string | undefined | null, currency?: string) =>
      checkMaskCost(val, sessionUser, currency, db.settings.isBranchCompany),
    [sessionUser, db.settings.isBranchCompany]
  );
  const maskWorth = useCallback(
    (val: number | string | undefined | null, currency?: string, placeholder?: string) =>
      checkMaskWorth(val, sessionUser, currency, placeholder, db.settings.isBranchCompany),
    [sessionUser, db.settings.isBranchCompany]
  );

  const myBranches = ((): Branch[] => {
    if (!sessionUser) return [];
    if (sessionUser.role === 'admin') return db.branches;
    return db.branches.filter((b) => (sessionUser.branchIds || []).includes(b.id));
  })();

  // Keep branchId in sync with allowed branches
  useEffect(() => {
    if (myBranches.length > 0) {
      if (branchId === 'all') {
        if (view !== 'inventory') {
          setBranchId(myBranches[0].id);
        }
        return;
      }
      if (!myBranches.some((b) => b.id === branchId)) {
        setBranchId(myBranches[0].id);
      }
    }
  }, [myBranches, branchId, view]);

  const featOn = useCallback(
    (key?: string): boolean => {
      if (!key) return true;
      if (!db.settings.features) return true;
      return db.settings.features[key] !== false;
    },
    [db.settings.features]
  );

  const canAccess = useCallback(
    (section: string): boolean => {
      return hasSectionAccess(
        sessionUser,
        db.settings.features,
        section,
        db.settings.isBranchCompany,
        db.settings.directSaleMode
      );
    },
    [sessionUser, db.settings.features, db.settings.isBranchCompany, db.settings.directSaleMode]
  );

  const allowedNavs = ((): typeof NAVS => {
    if (!sessionUser) return [];
    return NAVS.filter((n) => canAccess(n.id));
  })();

  useEffect(() => {
    if (!sessionUser) return;
    if (!isProtectedViewAllowed(sessionUser, view, canAccess)) {
      setView('dash');
    }
  }, [sessionUser, view, canAccess]);

  const t = useCallback(
    (key: string): string => {
      return tx(key, db.settings.lang);
    },
    [db.settings.lang]
  );

  const login = useCallback(
    async (username: string, pass: string, remember = true) => {
      const normalized = username.trim().toLowerCase();
      if (!normalized || !pass || !isValidInternalUsername(normalized)) {
        return { ok: false, error: 'Invalid credentials or inactive account' };
      }

      loginInFlightRef.current = true;
      try {
        await setPersistence(
          auth,
          remember ? browserLocalPersistence : browserSessionPersistence
        );
        const internalEmail = usernameToInternalEmail(normalized);

        let fbUser: FirebaseUser | null = null;
        let newlyBootstrappedAuth = false;

        try {
          const cred = await signInWithEmailAndPassword(auth, internalEmail, pass);
          fbUser = cred.user;
        } catch (err) {
          const code = extractFirebaseAuthCode(err);
          // First-time bootstrap when the default 'admin' Firebase Auth user doesn't exist yet in arcode1
          if (
            normalized === 'admin' &&
            (code === 'auth/user-not-found' || code === 'auth/invalid-credential')
          ) {
            try {
              const created = await createUserWithEmailAndPassword(auth, internalEmail, pass);
              fbUser = created.user;
              newlyBootstrappedAuth = true;
            } catch (createErr) {
              const createCode = extractFirebaseAuthCode(createErr);
              if (createCode === 'auth/email-already-in-use') {
                return { ok: false, error: 'Invalid credentials or inactive account' };
              }
              return { ok: false, error: mapAuthError(createErr).message };
            }
          } else {
            return { ok: false, error: mapAuthError(err).message };
          }
        }

        if (!fbUser) {
          return { ok: false, error: 'Invalid credentials or inactive account' };
        }

        setSyncing(true);
        try {
          const status = await hydrateAuthenticatedWorkspace(fbUser, { addLoginAudit: true });
          if (status !== 'ok') {
            if (newlyBootstrappedAuth) {
              // Workspace was already initialized by another admin; remove orphan auth account cleanly
              await fbUser.delete().catch(() => undefined);
            }
            await signOut(auth).catch(() => undefined);
            loadedUidRef.current = null;
            return {
              ok: false,
              error:
                status === 'inactive'
                  ? 'Invalid credentials or inactive account'
                  : 'Invalid credentials or inactive account',
            };
          }
          setView('dash');
          return { ok: true };
        } catch (err) {
          await signOut(auth).catch(() => undefined);
          loadedUidRef.current = null;
          const msg = err instanceof Error ? err.message : 'Failed to load company database';
          logError(msg, 'firestore-login');
          return { ok: false, error: msg };
        } finally {
          setSyncing(false);
        }
      } catch (err) {
        return { ok: false, error: mapAuthError(err).message };
      } finally {
        loginInFlightRef.current = false;
      }
    },
    [hydrateAuthenticatedWorkspace, logError]
  );

  const logout = useCallback(async () => {
    if (loggingOutRef.current) return;
    loggingOutRef.current = true;
    try {
      if (saveDebounceTimerRef.current) {
        clearTimeout(saveDebounceTimerRef.current);
        saveDebounceTimerRef.current = null;
      }

      if (auth.currentUser && loadedUidRef.current === auth.currentUser.uid && lastSavedDbRef.current) {
        await writeQueueRef.current.catch(() => undefined);
        const logoutEntry = createAuditEntry(
          sessionRef.current ? sessionRef.current.name : 'system',
          'Logout',
          sessionRef.current ? sessionRef.current.username : ''
        );
        const cur = latestDbRef.current;
        const withLogout: DatabaseSchema = {
          ...cur,
          audit: [...cur.audit, logoutEntry].slice(-800),
        };
        latestDbRef.current = withLogout;
        try {
          const ops = computeFirestoreDiffOps({
            prevDb: lastSavedDbRef.current,
            nextDb: withLogout,
            knownDocIds: knownDocIdsRef.current,
            defaultBranchId: withLogout.branches[0]?.id || 'b1',
          });
          await commitDiffOps(ops, knownDocIdsRef.current);
        } catch {
          // Best-effort final flush on logout
        }
      }

      cleanupRealtimeListeners();
      loadedUidRef.current = null;
      lastSavedDbRef.current = null;
      knownDocIdsRef.current = createEmptyKnownDocIds();
      skipNextSaveRef.current = true;
      setSession(null);
      setDb(migrateDb(emptyData(), false));
      setErrBanner('');
      await signOut(auth);
    } finally {
      loggingOutRef.current = false;
    }
  }, [cleanupRealtimeListeners]);

  const nextNo = useCallback(
    (bId: string | null | undefined, type: string): string => {
      const activeBid = (!bId || bId === 'all') ? ((myBranches[0] || {}).id || 'b1') : bId;
      const curBranchCounters = latestDbRef.current.counters?.[activeBid] || {};
      const nextNum = (curBranchCounters[type] || 1000) + 1;
      latestDbRef.current = {
        ...latestDbRef.current,
        counters: {
          ...latestDbRef.current.counters,
          [activeBid]: {
            ...curBranchCounters,
            [type]: nextNum,
          },
        },
      };
      setDb((prev) => {
        const counters = { ...prev.counters };
        const baseCounter: Record<string, number> = counters[activeBid]
          ? { ...counters[activeBid] }
          : {
              INV: 1000,
              DEL: 1000,
              RSL: 1000,
              RIN: 1000,
              INT: 1000,
              ARR: 1000,
              TRF: 1000,
              DSP: 1000,
              CHK: 1000,
              BRT: 1000,
              PAY: 1000,
              MTR: 1000,
              EXP: 1000,
            };
        baseCounter[type] = Math.max(nextNum, (baseCounter[type] || 1000) + 1);
        counters[activeBid] = baseCounter;
        return { ...prev, counters };
      });
      const b = db.branches.find((x) => x.id === activeBid);
      return `${type}-${(b && b.code) || 'BR'}-${nextNum}`;
    },
    [myBranches, db.branches]
  );

  const stockOf = useCallback(
    (itemId: string | null | undefined, bId?: string | null): number => {
      if (!itemId) return 0;
      return r2(
        db.stocks
          .filter((s) => s.itemId === itemId && (bId == null || bId === 'all' || bId === '0' || s.branchId === bId))
          .reduce((a, s) => a + (+s.qty || 0), 0)
      );
    },
    [db.stocks]
  );

  const stocksOf = useCallback(
    (itemId: string | null | undefined, bId?: string | null): StockBatch[] => {
      if (!itemId) return [];
      return db.stocks.filter(
        (s) => s.itemId === itemId && s.qty > 0.005 && (bId == null || bId === 'all' || bId === '0' || s.branchId === bId)
      );
    },
    [db.stocks]
  );

  const addStock = useCallback(
    (
      itemId: string,
      bId: string,
      batchNo: string | undefined,
      expiry: string | undefined,
      qty: number,
      cost?: number
    ) => {
      const roundedQty = r2(qty);
      if (!itemId || roundedQty <= 0) return;
      setDb((prev) => {
        const idx = prev.stocks.findIndex(
          (s) =>
            s.itemId === itemId &&
            s.branchId === bId &&
            (s.batchNo || '') === (batchNo || '') &&
            (s.expiry || '') === (expiry || '')
        );
        if (idx > -1) {
          const existing = prev.stocks[idx];
          const updated = {
            ...existing,
            qty: r2(existing.qty + roundedQty),
            ...(cost != null ? { cost: r2(cost) } : {}),
          };
          const stocks = [...prev.stocks];
          stocks[idx] = updated;
          return { ...prev, stocks };
        }
        return {
          ...prev,
          stocks: [
            ...prev.stocks,
            {
              id: uid(),
              itemId,
              branchId: bId,
              batchNo: batchNo || '',
              expiry: expiry || '',
              qty: roundedQty,
              cost: r2(cost || 0),
            },
          ],
        };
      });
    },
    []
  );

  const takeStock = useCallback(
    (
      stockId: string,
      qty: number
    ):
      | { ok: true; itemId: string; batchNo: string; expiry: string; cost: number }
      | { ok: false; msg: string } => {
      const s = db.stocks.find((x) => x.id === stockId);
      if (!s) return { ok: false as const, msg: 'Batch not found' };
      const rounded = r2(qty);
      if (s.qty + 0.000001 < rounded) {
        return {
          ok: false as const,
          msg: `Insufficient stock in batch ${s.batchNo || '(no batch)'}   available ${s.qty}`,
        };
      }
      const info = { itemId: s.itemId, batchNo: s.batchNo, expiry: s.expiry, cost: s.cost };
      setDb((prev) => {
        let stocks = prev.stocks.map((item) => (item.id === stockId ? { ...item, qty: r2(item.qty - rounded) } : item));
        stocks = stocks.filter((item) => item.qty > 0.0049);
        return { ...prev, stocks };
      });
      return { ok: true as const, ...info };
    },
    [db.stocks]
  );

  const takeFEFO = useCallback(
    (itemId: string, bId: string, qty: number) => {
      let left = r2(qty);
      const taken: { qty: number; batchNo?: string; expiry?: string }[] = [];
      const pool = db.stocks
        .filter((s) => s.itemId === itemId && s.branchId === bId && s.qty > 0)
        .slice()
        .sort((a, b) => (toIsoDate(a.expiry) || '9999-12-31').localeCompare(toIsoDate(b.expiry) || '9999-12-31'));

      for (const s of pool) {
        if (left <= 0.0049) break;
        const tQty = Math.min(s.qty, left);
        const res = takeStock(s.id, tQty);
        if (res.ok) {
          taken.push({ qty: r2(tQty), batchNo: res.batchNo, expiry: res.expiry });
          left = r2(left - tQty);
        }
      }

      if (left > 0.0049) {
        const it = db.items.find((i) => i.id === itemId);
        return { ok: false, msg: `Insufficient stock of ${it ? it.name : 'item'}` };
      }
      return { ok: true, taken };
    },
    [db.stocks, db.items, takeStock]
  );

  const subtractStock = useCallback(
    (
      itemId: string,
      bId: string,
      batchNo: string | undefined,
      expiry: string | undefined,
      qty: number
    ) => {
      setDb((prev) => {
        const stocks = prev.stocks.map((s) => {
          if (
            s.itemId === itemId &&
            s.branchId === bId &&
            (s.batchNo || '') === (batchNo || '') &&
            (s.expiry || '') === (expiry || '')
          ) {
            const tQty = Math.min(s.qty, r2(qty));
            return { ...s, qty: r2(s.qty - tQty) };
          }
          return s;
        });
        return { ...prev, stocks: stocks.filter((s) => s.qty > 0.0049) };
      });
    },
    []
  );

  // Invoices
  const saveInvoice = useCallback(
    (inv: Invoice): { ok: boolean; error?: string } => {
      const existing = db.invoices.find((x) => x.id === inv.id);
      if (existing && !checkCanEdit(sessionUser, 'invoices')) {
        toastMsg('Permission denied: You do not have permission to edit invoices.', 'error');
        return { ok: false, error: 'Permission denied' };
      }

      if (db.settings.directSaleMode) {
        const existingDel = db.deliveries.find((d) => d.invoiceId === inv.id);
        const sim = processDirectSaleInvoiceStock({
          settings: db.settings,
          items: db.items,
          stocks: db.stocks,
          deliveries: db.deliveries,
          inv,
          deliveryNo: existingDel?.no || inv.no,
        });
        if (!sim.ok) {
          toastMsg(sim.error, 'error');
          return { ok: false, error: sim.error };
        }

        const delNo = existingDel?.no || nextNo(inv.branchId, 'DEL');
        setDb((prev) => {
          const applied = processDirectSaleInvoiceStock({
            settings: prev.settings,
            items: prev.items,
            stocks: prev.stocks,
            deliveries: prev.deliveries,
            inv,
            deliveryNo: delNo,
          });
          if (!applied.ok) return prev;
          const invoices = [...prev.invoices];
          const existingIdx = invoices.findIndex((x) => x.id === inv.id);
          if (existingIdx > -1) {
            invoices[existingIdx] = applied.normalizedInvoice;
            audit('Invoice updated', `${inv.no}   direct sale stock adjusted`);
          } else {
            invoices.push(applied.normalizedInvoice);
            audit('Invoice created', `${inv.no}   ${inv.total}   stock deducted`);
          }
          return {
            ...prev,
            invoices,
            stocks: applied.stocks,
            deliveries: applied.deliveries,
          };
        });
        toastMsg(`Invoice ${inv.no} saved — stock deducted`);
        return { ok: true };
      }

      setDb((prev) => {
        const invoices = [...prev.invoices];
        const existingIdx = invoices.findIndex((x) => x.id === inv.id);
        if (existingIdx > -1) {
          invoices[existingIdx] = inv;
          audit('Invoice updated', inv.no);
        } else {
          invoices.push(inv);
          audit('Invoice created', `${inv.no}   ${inv.total}`);
        }
        return { ...prev, invoices };
      });
      toastMsg(`Invoice ${inv.no} saved`);
      return { ok: true };
    },
    [db.invoices, db.settings, db.items, db.stocks, db.deliveries, audit, toastMsg, sessionUser, nextNo]
  );

  const deleteInvoice = useCallback(
    (inv: Invoice) => {
      if (!checkCanDelete(sessionUser, 'invoices')) {
        toastMsg('Permission denied: You do not have permission to delete invoices.', 'error');
        audit('Unauthorized delete attempt blocked', `Invoice ${inv.no}`);
        return;
      }
      setDb((prev) => {
        const invDels = prev.deliveries.filter((d) => d.invoiceId === inv.id);
        const stocks = prev.stocks.map((s) => ({ ...s }));
        invDels.forEach((d) => {
          d.lines.forEach((l) => {
            const f = stocks.find(
              (s) =>
                s.itemId === l.itemId &&
                s.branchId === d.branchId &&
                (s.batchNo || '') === (l.batchNo || '') &&
                (s.expiry || '') === (l.expiry || '')
            );
            if (f) f.qty = r2(f.qty + l.qty);
            else {
              stocks.push({
                id: uid(),
                itemId: l.itemId,
                branchId: d.branchId,
                batchNo: l.batchNo || '',
                expiry: l.expiry || '',
                qty: l.qty,
                cost: l.cost || 0,
              });
            }
          });
        });
        const deliveries = prev.deliveries.filter((d) => d.invoiceId !== inv.id);
        const payments = prev.payments.map((p) => ({
          ...p,
          allocs: (p.allocs || []).filter((a) => !(a.type === 'invoice' && a.docId === inv.id)),
        }));
        const invoices = prev.invoices.filter((x) => x.id !== inv.id);
        audit('Invoice deleted', `${inv.no} (${invDels.length} deliveries reverted)`);
        return { ...prev, invoices, deliveries, payments, stocks };
      });
      toastMsg('Invoice deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Deliveries
  const saveDelivery = useCallback(
    (del: Delivery) => {
      const inv = del.invoiceId ? db.invoices.find((x) => x.id === del.invoiceId) : null;
      const retSlip = del.returnSlipId ? db.returnSlips.find((x) => x.id === del.returnSlipId) : null;
      if (!inv && !retSlip) return { ok: false, error: 'Invoice or Return Slip not found' };
      if (retSlip && returnSlipRemaining(db, retSlip) <= 0.005) {
        return {
          ok: false,
          error: 'Cannot deliver: all items on this return slip are already settled.',
        };
      }
      const isExisting = db.deliveries.some((x) => x.id === del.id);
      if (isExisting && !checkCanEdit(sessionUser, 'deliveries')) {
        return { ok: false, error: 'Permission denied: You do not have permission to edit deliveries.' };
      }
      setDb((prev) => {
        const deliveries = [...prev.deliveries];
        const existingIdx = deliveries.findIndex((x) => x.id === del.id);
        if (existingIdx > -1) {
          deliveries[existingIdx] = del;
          audit('Delivery updated', del.no);
        } else {
          deliveries.push(del);
          const docRef = inv ? inv.no : retSlip!.no;
          audit('Delivery created', `${del.no} for ${docRef}   stock deducted`);
        }
        return { ...prev, deliveries };
      });
      toastMsg(`Delivery ${del.no} saved   stock deducted`);
      return { ok: true };
    },
    [db, audit, toastMsg, sessionUser]
  );

  const deleteDelivery = useCallback(
    (del: Delivery) => {
      if (!checkCanDelete(sessionUser, 'deliveries')) {
        toastMsg('Permission denied: You do not have permission to delete deliveries.', 'error');
        audit('Unauthorized delete attempt blocked', `Delivery ${del.no}`);
        return;
      }
      setDb((prev) => {
        const stocks = prev.stocks.map((s) => ({ ...s }));
        del.lines.forEach((l) => {
          const f = stocks.find(
            (s) =>
              s.itemId === l.itemId &&
              s.branchId === del.branchId &&
              (s.batchNo || '') === (l.batchNo || '')
          );
          if (f) f.qty = r2(f.qty + l.qty);
          else {
            stocks.push({
              id: uid(),
              itemId: l.itemId,
              branchId: del.branchId,
              batchNo: l.batchNo || '',
              expiry: l.expiry || '',
              qty: l.qty,
              cost: l.cost || 0,
            });
          }
        });
        const deliveries = prev.deliveries.filter((x) => x.id !== del.id);
        audit('Delivery deleted', `${del.no}   stock restored`);
        return { ...prev, deliveries, stocks };
      });
      toastMsg('Delivery deleted, stock restored');
    },
    [audit, toastMsg, sessionUser]
  );

  // Return Slips
  const saveReturnSlip = useCallback(
    (slip: ReturnSlip) => {
      const isExisting = db.returnSlips.some((x) => x.id === slip.id);
      if (isExisting && !checkCanEdit(sessionUser, 'returns')) {
        toastMsg('Permission denied: You do not have permission to edit return slips.', 'error');
        return;
      }
      setDb((prev) => {
        const returnSlips = [...prev.returnSlips];
        const existingIdx = returnSlips.findIndex((x) => x.id === slip.id);
        if (existingIdx > -1) {
          returnSlips[existingIdx] = slip;
          audit('Return slip updated', slip.no);
        } else {
          returnSlips.push(slip);
          audit('Return slip created', `${slip.no}   items in stock`);
        }
        return { ...prev, returnSlips };
      });
      toastMsg(`Return slip ${slip.no} saved`);
    },
    [db.returnSlips, audit, toastMsg, sessionUser]
  );

  const deleteReturnSlip = useCallback(
    (slip: ReturnSlip) => {
      if (!checkCanDelete(sessionUser, 'returns')) {
        toastMsg('Permission denied: You do not have permission to delete return slips.', 'error');
        audit('Unauthorized delete attempt blocked', `Return slip ${slip.no}`);
        return;
      }
      setDb((prev) => {
        const returnInvoices = prev.returnInvoices.filter(
          (x) => x.returnSlipId !== slip.id && x.id !== slip.returnInvoiceId
        );
        const returnSlips = prev.returnSlips.filter((x) => x.id !== slip.id);
        const stocks = prev.stocks.map((s) => ({ ...s }));
        slip.lines.forEach((l) => {
          if (!l.itemId) return;
          const f = stocks.find(
            (s) =>
              s.itemId === l.itemId &&
              s.branchId === slip.branchId &&
              (s.batchNo || '') === (l.batchNo || '')
          );
          if (f) f.qty = r2(f.qty - l.qty);
        });

        const attachedDels = prev.deliveries.filter((d) => d.returnSlipId === slip.id);
        attachedDels.forEach((del) => {
          del.lines.forEach((l) => {
            const f = stocks.find(
              (s) =>
                s.itemId === l.itemId &&
                s.branchId === del.branchId &&
                (s.batchNo || '') === (l.batchNo || '')
            );
            if (f) f.qty = r2(f.qty + l.qty);
            else {
              stocks.push({
                id: uid(),
                itemId: l.itemId,
                branchId: del.branchId,
                batchNo: l.batchNo || '',
                expiry: l.expiry || '',
                qty: l.qty,
                cost: l.cost || 0,
              });
            }
          });
        });
        const deliveries = prev.deliveries.filter((d) => d.returnSlipId !== slip.id);

        audit('Return slip deleted', slip.no);
        return {
          ...prev,
          returnSlips,
          returnInvoices,
          deliveries,
          stocks: stocks.filter((s) => s.qty > 0.005),
        };
      });
      toastMsg('Return slip deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Return Invoices (Credit Notes)
  const saveReturnInvoice = useCallback(
    (creditNote: ReturnInvoice) => {
      const slip = db.returnSlips.find((s) => s.id === creditNote.returnSlipId);
      if (slip && returnSlipRemaining(db, slip, null, null, creditNote.id) <= 0.005) {
        toastMsg(
          'Cannot attach credit note: all items on this return slip are already settled.',
          'error'
        );
        return;
      }
      setDb((prev) => {
        const existingIdx = prev.returnInvoices.findIndex((x) => x.id === creditNote.id);
        const returnInvoices = [...prev.returnInvoices];
        if (existingIdx > -1) {
          returnInvoices[existingIdx] = creditNote;
        } else {
          returnInvoices.push(creditNote);
        }
        const returnSlips = prev.returnSlips.map((s) =>
          s.id === creditNote.returnSlipId ? { ...s, returnInvoiceId: creditNote.id } : s
        );
        audit('Credit note attached', `${creditNote.no}   balance reduced by ${creditNote.total}`);
        return { ...prev, returnInvoices, returnSlips };
      });
      toastMsg(`Credit note ${creditNote.no} attached   balance reduced`);
    },
    [db, audit, toastMsg]
  );

  const deleteReturnInvoice = useCallback(
    (creditNote: ReturnInvoice) => {
      if (!checkCanDelete(sessionUser, 'returns')) {
        toastMsg('Permission denied: You do not have permission to delete return credit notes.', 'error');
        audit('Unauthorized delete attempt blocked', `Credit note ${creditNote.no}`);
        return;
      }
      setDb((prev) => {
        const returnInvoices = prev.returnInvoices.filter((x) => x.id !== creditNote.id);
        const remainingForSlip = returnInvoices.filter((x) => x.returnSlipId === creditNote.returnSlipId);
        const returnSlips = prev.returnSlips.map((s) =>
          s.id === creditNote.returnSlipId
            ? { ...s, returnInvoiceId: remainingForSlip.length > 0 ? remainingForSlip[remainingForSlip.length - 1].id : null }
            : s
        );
        audit('Credit note deleted', creditNote.no);
        return { ...prev, returnInvoices, returnSlips };
      });
      toastMsg('Credit note deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Buying Goods (Intakes)
  const saveIntake = useCallback(
    (intake: Intake) => {
      const isExisting = db.intakes.some((x) => x.id === intake.id);
      if (isExisting && !checkCanEdit(sessionUser, 'buying')) {
        return { ok: false, error: 'Permission denied: You do not have permission to edit buying receipts.' };
      }
      setDb((prev) => {
        const intakes = [...prev.intakes];
        const existingIdx = intakes.findIndex((x) => x.id === intake.id);
        if (existingIdx > -1) {
          intakes[existingIdx] = intake;
          audit('Buying receipt updated', intake.no);
        } else {
          intakes.push(intake);
          audit('Buying receipt created', `${intake.no}   ${intake.total}   on the way`);
        }
        return { ...prev, intakes };
      });
      toastMsg(`Receipt ${intake.no} saved   items on the way, payable recorded`);
      return { ok: true };
    },
    [db.intakes, audit, toastMsg, sessionUser]
  );

  const deleteIntake = useCallback(
    (intake: Intake) => {
      if (!checkCanDelete(sessionUser, 'buying')) {
        return { ok: false, error: 'Permission denied: You do not have permission to delete buying receipts.' };
      }
      if (db.arrivals.some((a) => a.intakeId === intake.id)) {
        return { ok: false, error: `Delete arrival notes of ${intake.no} first` };
      }
      setDb((prev) => {
        const payments = prev.payments.map((p) => ({
          ...p,
          allocs: (p.allocs || []).filter((a) => !(a.type === 'intake' && a.docId === intake.id)),
        }));
        const intakes = prev.intakes.filter((x) => x.id !== intake.id);
        audit('Buying receipt deleted', intake.no);
        return { ...prev, intakes, payments };
      });
      toastMsg('Buying receipt deleted');
      return { ok: true };
    },
    [db.arrivals, audit, toastMsg, sessionUser]
  );

  // Arrivals
  const saveArrival = useCallback(
    (arrival: Arrival) => {
      const isExisting = db.arrivals.some((x) => x.id === arrival.id);
      if (isExisting && !checkCanEdit(sessionUser, 'buying')) {
        toastMsg('Permission denied: You do not have permission to edit arrival notes.', 'error');
        return { ok: false, error: 'Permission denied: You do not have permission to edit arrival notes.' };
      }

      setDb((prev) => {
        const arrivals = [...prev.arrivals];
        const stocks = prev.stocks.map((s) => ({ ...s }));
        const items = [...prev.items];

        const existingIdx = arrivals.findIndex((x) => x.id === arrival.id);
        const oldArrival = existingIdx > -1 ? arrivals[existingIdx] : null;

        if (oldArrival) {
          oldArrival.lines.forEach((l) => {
            const f = stocks.find(
              (s) =>
                s.itemId === l.itemId &&
                s.branchId === oldArrival.branchId &&
                (s.batchNo || '') === (l.batchNo || '') &&
                (s.expiry || '') === (l.expiry || '')
            );
            if (f) {
              f.qty = r2(f.qty - l.qty);
            }
          });
        }

        arrival.lines.forEach((l) => {
          const f = stocks.find(
            (s) =>
              s.itemId === l.itemId &&
              s.branchId === arrival.branchId &&
              (s.batchNo || '') === (l.batchNo || '') &&
              (s.expiry || '') === (l.expiry || '')
          );
          if (f) {
            f.qty = r2(f.qty + l.qty);
            if (l.cost !== undefined) f.cost = r2(l.cost);
          } else {
            stocks.push({
              id: uid(),
              itemId: l.itemId,
              branchId: arrival.branchId,
              batchNo: l.batchNo || '',
              expiry: l.expiry || '',
              qty: l.qty,
              cost: r2(l.cost),
            });
          }
          if (l.cost !== undefined) {
            const itIdx = items.findIndex((i) => i.id === l.itemId);
            if (itIdx > -1) {
              items[itIdx] = { ...items[itIdx], cost: l.cost };
            }
          }
        });

        if (existingIdx > -1) {
          arrivals[existingIdx] = arrival;
          audit('Arrival updated', `${arrival.no}   stock adjusted`);
        } else {
          arrivals.push(arrival);
          audit('Arrival received', `${arrival.no}   stock added`);
        }

        return { ...prev, arrivals, stocks: stocks.filter((s) => s.qty > 0.005), items };
      });
      toastMsg(isExisting ? `Arrival ${arrival.no} updated` : `Arrival ${arrival.no} saved   stock added`);
      return { ok: true };
    },
    [db.arrivals, audit, toastMsg, sessionUser]
  );

  const deleteArrival = useCallback(
    (arrival: Arrival) => {
      if (!checkCanDelete(sessionUser, 'buying')) {
        toastMsg('Permission denied: You do not have permission to delete arrival notes.', 'error');
        audit('Unauthorized delete attempt blocked', `Arrival ${arrival.no}`);
        return;
      }
      setDb((prev) => {
        const arrivals = prev.arrivals.filter((x) => x.id !== arrival.id);
        const stocks = prev.stocks.map((s) => ({ ...s }));
        arrival.lines.forEach((l) => {
          const f = stocks.find(
            (s) =>
              s.itemId === l.itemId &&
              s.branchId === arrival.branchId &&
              (s.batchNo || '') === (l.batchNo || '') &&
              (s.expiry || '') === (l.expiry || '')
          );
          if (f) f.qty = r2(f.qty - l.qty);
        });
        audit('Arrival deleted', `${arrival.no}   stock removed`);
        return { ...prev, arrivals, stocks: stocks.filter((s) => s.qty > 0.005) };
      });
      toastMsg('Arrival deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Payments
  const confirmPayment = useCallback(
    (payment: Payment) => {
      const isExisting = db.payments.some((p) => p.id === payment.id);
      if (isExisting && !checkCanEdit(sessionUser, 'payments')) {
        toastMsg('Permission denied: You do not have permission to edit payments.', 'error');
        return;
      }
      setDb((prev) => {
        const payments = isExisting
          ? prev.payments.map((p) => (p.id === payment.id ? payment : p))
          : [...prev.payments, payment];
        audit(
          payment.dir === 'out' ? 'Payment to provider' : 'Payment received',
          `${payment.no}   ${payment.amount} (disc: ${payment.disc})`
        );
        return { ...prev, payments };
      });
      toastMsg(`Payment ${payment.no} recorded`);
    },
    [db.payments, audit, toastMsg, sessionUser]
  );

  const deletePayment = useCallback(
    (payment: Payment) => {
      if (!checkCanDelete(sessionUser, 'payments')) {
        toastMsg('Permission denied: You do not have permission to delete payments.', 'error');
        audit('Unauthorized delete attempt blocked', `Payment ${payment.no}`);
        return;
      }
      setDb((prev) => {
        const payments = prev.payments.filter((x) => x.id !== payment.id);
        audit('Payment deleted', payment.no);
        return { ...prev, payments };
      });
      toastMsg('Payment deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Barters
  const saveBarter = useCallback(
    (barter: Barter) => {
      const isExisting = db.barters.some((b) => b.id === barter.id);
      if (isExisting && !checkCanEdit(sessionUser, 'barter')) {
        return { ok: false, error: 'Permission denied: You do not have permission to edit barter exchanges.' };
      }
      setDb((prev) => {
        const barters = [...prev.barters, barter];
        audit(
          'Barter exchange',
          `${barter.no}   gave ${barter.giveValue}, received ${barter.recvValue} (loss ${barter.loss})`
        );
        return { ...prev, barters };
      });
      toastMsg(`Exchange ${barter.no} settled`);
      return { ok: true };
    },
    [db.barters, audit, toastMsg, sessionUser]
  );

  const deleteBarter = useCallback(
    (barter: Barter) => {
      if (!checkCanDelete(sessionUser, 'barter')) {
        toastMsg('Permission denied: You do not have permission to delete barter exchanges.', 'error');
        audit('Unauthorized delete attempt blocked', `Barter ${barter.no}`);
        return;
      }
      setDb((prev) => {
        const stocks = prev.stocks.map((s) => ({ ...s }));
        barter.giveLines.forEach((l) => {
          if (!l.itemId) return;
          const f = stocks.find((s) => s.itemId === l.itemId && s.branchId === barter.branchId);
          if (f) f.qty = r2(f.qty + l.qty);
          else {
            stocks.push({
              id: uid(),
              itemId: l.itemId,
              branchId: barter.branchId,
              batchNo: l.batchNo || '',
              expiry: l.expiry || '',
              qty: l.qty,
              cost: l.cost,
            });
          }
        });
        barter.recvLines.forEach((l) => {
          if (!l.itemId) return;
          const f =
            stocks.find(
              (s) =>
                s.itemId === l.itemId &&
                s.branchId === barter.branchId &&
                (s.batchNo || '') === (l.batchNo || '') &&
                (s.expiry || '') === (l.expiry || '')
            ) || stocks.find((s) => s.itemId === l.itemId && s.branchId === barter.branchId);
          if (f) f.qty = r2(f.qty - l.qty);
        });
        const barters = prev.barters.filter((x) => x.id !== barter.id);
        audit('Barter deleted', barter.no);
        return { ...prev, barters, stocks: stocks.filter((s) => s.qty > 0.005) };
      });
      toastMsg('Barter deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Checks
  const saveCheck = useCallback(
    (check: CheckDoc) => {
      const isExisting = db.checks.some((c) => c.id === check.id);
      if (isExisting && !checkCanEdit(sessionUser, 'checks')) {
        toastMsg('Permission denied: You do not have permission to edit checks.', 'error');
        return;
      }
      setDb((prev) => {
        const checks = isExisting
          ? prev.checks.map((c) => (c.id === check.id ? check : c))
          : [...prev.checks, check];
        audit('Check recorded', `${check.no}   ${check.checkNo}   ${check.amount}`);
        return { ...prev, checks };
      });
      toastMsg(`Check ${check.checkNo} recorded`);
    },
    [db.checks, audit, toastMsg, sessionUser]
  );

  const deleteCheck = useCallback(
    (check: CheckDoc) => {
      if (!checkCanDelete(sessionUser, 'checks')) {
        toastMsg('Permission denied: You do not have permission to delete checks.', 'error');
        audit('Unauthorized delete attempt blocked', `Check ${check.checkNo}`);
        return;
      }
      setDb((prev) => {
        const checks = prev.checks.filter((x) => x.id !== check.id);
        audit('Check deleted', check.checkNo);
        return { ...prev, checks };
      });
      toastMsg('Check deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  const setCheckStatus = useCallback(
    (check: CheckDoc, status: CheckDoc['status']) => {
      if (!checkCanEdit(sessionUser, 'checks')) {
        toastMsg('Permission denied: You do not have permission to modify check status.', 'error');
        audit('Unauthorized status change blocked', `Check ${check.checkNo}`);
        return;
      }
      setDb((prev) => {
        const checks = prev.checks.map((c) => {
          if (c.id === check.id) {
            const upd = { ...c, status };
            if ((status === 'deposited' || status === 'cleared') && !upd.clearedAccountId) {
              const mainAcc = prev.accounts.find((a) => a.type !== 'cheques') || prev.accounts[0];
              upd.clearedAccountId = mainAcc?.id;
              upd.clearedDate = todayStr();
            }
            return upd;
          }
          return c;
        });
        audit(`Check status   ${status}`, check.checkNo);
        return { ...prev, checks };
      });
      toastMsg(`Check ${check.checkNo}   ${status}`);
    },
    [audit, toastMsg, sessionUser]
  );

  const confirmPayout = useCallback(
    (check: CheckDoc, amount: number, date = todayStr(), note = '', targetAccountId?: string) => {
      if (!checkCanEdit(sessionUser, 'checks')) {
        toastMsg('Permission denied: You do not have permission to process check payouts.', 'error');
        audit('Unauthorized payout attempt blocked', `Check ${check.checkNo}`);
        return;
      }
      setDb((prev) => {
        const checks = prev.checks.map((c) => {
          if (c.id === check.id) {
            const accId =
              targetAccountId ||
              prev.accounts.find((a) => a.type === 'cashbox' && a.branchId === branchId)?.id ||
              prev.accounts.find((a) => a.type === 'cashbox')?.id ||
              prev.accounts[0]?.id;
            const payouts = [...c.payouts, { id: uid(), date, amount: r2(amount), note, accountId: accId }];
            return { ...c, payouts };
          }
          return c;
        });
        audit('Check payout', `${check.checkNo}   ${amount}`);
        return { ...prev, checks };
      });
      toastMsg('Payout recorded');
    },
    [branchId, audit, toastMsg, sessionUser]
  );

  // Transfers
  const saveTransfer = useCallback(
    (transfer: Transfer) => {
      setDb((prev) => {
        const transfers = [...prev.transfers, transfer];
        audit('Transfer dispatched', `${transfer.no}   (in transit)`);
        return { ...prev, transfers };
      });
      toastMsg(`Transfer ${transfer.no} in transit`);
      return { ok: true };
    },
    [audit, toastMsg]
  );

  const receiveTransfer = useCallback(
    (transfer: Transfer) => {
      setDb((prev) => {
        const transfers = prev.transfers.map((tItem) =>
          tItem.id === transfer.id ? { ...tItem, status: 'completed' as const, receivedDate: todayStr() } : tItem
        );
        const stocks = prev.stocks.map((s) => ({ ...s }));
        transfer.lines.forEach((l) => {
          const f = stocks.find(
            (s) =>
              s.itemId === l.itemId &&
              s.branchId === transfer.toBranchId &&
              (s.batchNo || '') === (l.batchNo || '') &&
              (s.expiry || '') === (l.expiry || '')
          );
          if (f) f.qty = r2(f.qty + l.qty);
          else {
            stocks.push({
              id: uid(),
              itemId: l.itemId,
              branchId: transfer.toBranchId,
              batchNo: l.batchNo || '',
              expiry: l.expiry || '',
              qty: l.qty,
              cost: l.cost,
            });
          }
        });
        audit('Transfer received', transfer.no);
        return { ...prev, transfers, stocks };
      });
      toastMsg('Transfer received');
    },
    [audit, toastMsg]
  );

  const cancelTransfer = useCallback(
    (transfer: Transfer) => {
      setDb((prev) => {
        const transfers = prev.transfers.map((tItem) =>
          tItem.id === transfer.id ? { ...tItem, status: 'cancelled' as const } : tItem
        );
        const stocks = prev.stocks.map((s) => ({ ...s }));
        transfer.lines.forEach((l) => {
          const f = stocks.find(
            (s) =>
              s.itemId === l.itemId &&
              s.branchId === transfer.fromBranchId &&
              (s.batchNo || '') === (l.batchNo || '')
          );
          if (f) f.qty = r2(f.qty + l.qty);
          else {
            stocks.push({
              id: uid(),
              itemId: l.itemId,
              branchId: transfer.fromBranchId,
              batchNo: l.batchNo || '',
              expiry: l.expiry || '',
              qty: l.qty,
              cost: l.cost,
            });
          }
        });
        audit('Transfer cancelled', transfer.no);
        return { ...prev, transfers, stocks };
      });
      toastMsg('Transfer cancelled');
    },
    [audit, toastMsg]
  );

  // Disposals
  const saveDisposal = useCallback(
    (disposal: Disposal) => {
      setDb((prev) => {
        const disposals = [...prev.disposals, disposal];
        audit('Disposal logged', disposal.no);
        return { ...prev, disposals };
      });
      toastMsg(`Disposal ${disposal.no} logged for approval`);
    },
    [audit, toastMsg]
  );

  const approveDisposal = useCallback(
    (disposal: Disposal) => {
      setDb((prev) => {
        let loss = 0;
        let stocks = prev.stocks.map((s) => ({ ...s }));
        disposal.lines.forEach((l) => {
          if (!l.itemId) return;
          const s = stocks.find(
            (x) =>
              x.itemId === l.itemId &&
              x.branchId === disposal.branchId &&
              (x.batchNo || '') === (l.batchNo || '')
          );
          if (s) {
            const tQty = Math.min(s.qty, r2(l.qty));
            s.qty = r2(s.qty - tQty);
            loss = r2(loss + r2(tQty * s.cost));
          }
        });
        stocks = stocks.filter((s) => s.qty > 0.005);
        const disposals = prev.disposals.map((d) =>
          d.id === disposal.id ? { ...d, status: 'approved' as const, loss } : d
        );
        audit('Disposal approved', `${disposal.no}   write-off ${loss}`);
        return { ...prev, disposals, stocks };
      });
      toastMsg('Disposal approved');
    },
    [audit, toastMsg]
  );

  const rejectDisposal = useCallback(
    (disposal: Disposal) => {
      setDb((prev) => {
        const disposals = prev.disposals.map((d) =>
          d.id === disposal.id ? { ...d, status: 'rejected' as const } : d
        );
        audit('Disposal rejected', disposal.no);
        return { ...prev, disposals };
      });
      toastMsg('Disposal rejected');
    },
    [audit, toastMsg]
  );

  // Items
  const saveItem = useCallback(
    (item: Item) => {
      const isExisting = db.items.some((i) => i.id === item.id);
      if (isExisting && !checkCanEdit(sessionUser, 'inventory')) {
        toastMsg('Permission denied: You do not have permission to edit inventory items.', 'error');
        return;
      }
      setDb((prev) => {
        const items = [...prev.items];
        const existingIdx = items.findIndex((x) => x.id === item.id);
        if (existingIdx > -1) {
          items[existingIdx] = item;
          audit('Item updated', item.name);
        } else {
          items.push(item);
          audit('Item created', item.name);
        }
        return { ...prev, items };
      });
      toastMsg('Item saved');
    },
    [db.items, audit, toastMsg, sessionUser]
  );

  const deleteItem = useCallback(
    (item: Item) => {
      if (!checkCanDelete(sessionUser, 'inventory')) {
        toastMsg('Permission denied: You do not have permission to delete inventory items.', 'error');
        audit('Unauthorized delete attempt blocked', `Item ${item.name}`);
        return;
      }
      setDb((prev) => {
        const items = prev.items.filter((x) => x.id !== item.id);
        const stocks = prev.stocks.filter((s) => s.itemId !== item.id);
        audit('Item deleted', item.name);
        return { ...prev, items, stocks };
      });
      toastMsg('Item deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Customers
  const saveCustomer = useCallback(
    (cust: Customer) => {
      const isExisting = db.customers.some((c) => c.id === cust.id);
      if (isExisting && !checkCanEdit(sessionUser, 'customers')) {
        toastMsg('Permission denied: You do not have permission to edit accounts.', 'error');
        return;
      }
      setDb((prev) => {
        const customers = [...prev.customers];
        const existingIdx = customers.findIndex((x) => x.id === cust.id);
        if (existingIdx > -1) {
          customers[existingIdx] = cust;
          audit('Account updated', cust.name);
        } else {
          customers.push(cust);
          audit('Account created', cust.name);
        }
        return { ...prev, customers };
      });
      toastMsg('Account saved');
    },
    [db.customers, audit, toastMsg, sessionUser]
  );

  const deleteCustomer = useCallback(
    (cust: Customer) => {
      if (!checkCanDelete(sessionUser, 'customers')) {
        toastMsg('Permission denied: You do not have permission to delete accounts.', 'error');
        audit('Unauthorized delete attempt blocked', `Customer ${cust.name}`);
        return;
      }
      setDb((prev) => {
        const customers = prev.customers.filter((x) => x.id !== cust.id);
        audit('Account deleted', cust.name);
        return { ...prev, customers };
      });
      toastMsg('Account deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Users (creates/updates/soft-deletes employee profile in Firestore & syncs Firebase Auth)
  const saveUser = useCallback(
    async (user: User): Promise<{ ok: boolean; error?: string }> => {
      if (sessionUser?.role !== 'admin') {
        const msg = 'Permission denied: Administrator role required to manage users.';
        toastMsg(msg, 'error');
        return { ok: false, error: msg };
      }

      const uname = user.username.trim().toLowerCase();
      if (!isValidInternalUsername(uname)) {
        const msg = 'Username must be 2–64 characters using letters, numbers, dots, underscores, or hyphens.';
        toastMsg(msg, 'error');
        return { ok: false, error: msg };
      }

      const existing = db.users.find((x) => x.id === user.id);
      const duplicateByUsername = db.users.find(
        (x) => x.username.toLowerCase() === uname && x.id !== user.id
      );
      if (duplicateByUsername) {
        const msg = duplicateByUsername.deleted
          ? 'This username belongs to a deleted employee whose Firebase login still exists. Restore that deleted employee, pick another username, or remove them in Firebase Console -> Authentication -> Users first.'
          : 'Username already exists';
        toastMsg(msg, 'error');
        return { ok: false, error: msg };
      }

      if (!existing) {
        // Creating new employee: require >= 6 char password and create Firebase Auth user via secondary instance
        if (!user.pass || user.pass.length < 6) {
          const msg = 'Password must be at least 6 characters for Firebase Authentication.';
          toastMsg(msg, 'error');
          return { ok: false, error: msg };
        }
        try {
          const fbUid = await createEmployeeAuthUser(uname, user.pass);
          const cleanNewUser: User = {
            ...user,
            id: fbUid,
            username: uname,
            pass: '',
            deleted: false,
            deletedAt: undefined,
          };
          setDb((prev) => ({
            ...prev,
            users: [...prev.users, cleanNewUser],
          }));
          audit('User created', uname);
          toastMsg('User created and synced to Firebase');
          return { ok: true };
        } catch (err) {
          const mapped = mapAuthError(err);
          toastMsg(mapped.message, 'error');
          return { ok: false, error: mapped.message };
        }
      }

      // Updating existing user
      if (uname !== existing.username.trim().toLowerCase()) {
        const msg = 'Username cannot be changed after Firebase account creation.';
        toastMsg(msg, 'error');
        return { ok: false, error: msg };
      }

      let passwordNote = '';
      if (user.pass) {
        if (user.pass.length < 6) {
          const msg = 'Password must be at least 6 characters for Firebase Authentication.';
          toastMsg(msg, 'error');
          return { ok: false, error: msg };
        }
        if (existing.id === auth.currentUser?.uid) {
          try {
            await updateCurrentUserPassword(user.pass);
          } catch (err) {
            const mapped = mapAuthError(err);
            toastMsg(mapped.message, 'error');
            return { ok: false, error: mapped.message };
          }
        } else {
          passwordNote = ' (permissions saved; reset another employee’s password in Firebase Console -> Authentication)';
        }
      }

      const isRestoring = existing.deleted === true && user.deleted !== true;
      const isDeleted = user.deleted === true;
      const cleanUpdatedUser: User = {
        ...user,
        id: existing.id,
        username: existing.username,
        pass: '',
        active: isDeleted ? false : user.active,
        deleted: isDeleted,
        deletedAt: isDeleted ? (user.deletedAt ?? existing.deletedAt ?? Date.now()) : undefined,
      };

      setDb((prev) => ({
        ...prev,
        users: prev.users.map((x) => (x.id === existing.id ? cleanUpdatedUser : x)),
      }));
      audit(isRestoring ? 'User restored' : 'User updated', existing.username);
      toastMsg(
        isRestoring
          ? `Employee ${existing.username} restored (using their existing password)`
          : `User saved${passwordNote}`
      );
      return { ok: true };
    },
    [db.users, sessionUser, audit, toastMsg]
  );

  const deleteUser = useCallback(
    async (user: User): Promise<void> => {
      if (sessionUser?.role !== 'admin') {
        toastMsg('Permission denied: Administrator role required to delete users.', 'error');
        return;
      }
      if (user.id === sessionUser.id || user.id === auth.currentUser?.uid) {
        toastMsg('Cannot delete your own active admin account.', 'error');
        return;
      }
      const deletedAt = Date.now();
      setDb((prev) => ({
        ...prev,
        users: prev.users.map((x) =>
          x.id === user.id
            ? { ...x, active: false, deleted: true, deletedAt }
            : x
        ),
      }));
      audit('User deleted', user.username);
      toastMsg('User deleted and access revoked');
    },
    [sessionUser, audit, toastMsg]
  );

  // Branches
  const saveBranch = useCallback(
    (branch: Branch) => {
      const code = branch.code.trim().toUpperCase();
      if (db.branches.some((x) => x.code.toUpperCase() === code && x.id !== branch.id)) {
        return { ok: false, error: 'Branch code already exists' };
      }
      setDb((prev) => {
        const branches = [...prev.branches];
        const counters = { ...prev.counters };
        const existingIdx = branches.findIndex((x) => x.id === branch.id);
        if (existingIdx > -1) {
          branches[existingIdx] = branch;
          audit('Branch updated', branch.name);
        } else {
          branches.push(branch);
          counters[branch.id] = {
            INV: 1000,
            DEL: 1000,
            RSL: 1000,
            RIN: 1000,
            INT: 1000,
            ARR: 1000,
            TRF: 1000,
            DSP: 1000,
            CHK: 1000,
            BRT: 1000,
            PAY: 1000,
            MTR: 1000,
            EXP: 1000,
          };
          audit('Branch created', branch.name);
        }
        return { ...prev, branches, counters };
      });
      toastMsg('Branch saved');
      return { ok: true };
    },
    [db.branches, audit, toastMsg]
  );

  const deleteBranch = useCallback(
    (branch: Branch) => {
      setDb((prev) => {
        const branches = prev.branches.filter((x) => x.id !== branch.id);
        const stocks = prev.stocks.filter((s) => s.branchId !== branch.id);
        const counters = { ...prev.counters };
        delete counters[branch.id];
        const users = prev.users.map((u) => ({
          ...u,
          branchIds: (u.branchIds || []).filter((x) => x !== branch.id),
        }));
        audit('Branch deleted', branch.name);
        return { ...prev, branches, stocks, counters, users };
      });
      toastMsg('Branch deleted');
    },
    [audit, toastMsg]
  );

  // Adjustments
  const saveAdjust = useCallback(
    (adj: StockAdjust) => {
      if (!checkCanAdjustInventory(sessionUser)) {
        toastMsg('Permission denied: You do not have permission to adjust inventory stock.', 'error');
        return { ok: false, error: 'Permission denied: You do not have permission to adjust inventory stock.' };
      }
      setDb((prev) => {
        const adjusts = [...prev.adjusts, adj];
        const it = prev.items.find((i) => i.id === adj.itemId);
        audit('Stock adjustment', `${it ? it.name : 'item'} ${adj.qty > 0 ? '+' : ''}${adj.qty}`);
        return { ...prev, adjusts };
      });
      toastMsg('Stock adjusted');
      return { ok: true };
    },
    [audit, toastMsg, sessionUser]
  );

  // Accounts
  const saveAccount = useCallback(
    (acc: MoneyAccount) => {
      const isExisting = db.accounts.some((x) => x.id === acc.id);
      if (isExisting && !checkCanEdit(sessionUser, 'money')) {
        return { ok: false, error: 'Permission denied: You do not have permission to edit accounts.' };
      }
      if (acc.type === 'cheques' && db.accounts.some((x) => x.type === 'cheques' && x.id !== acc.id)) {
        return { ok: false, error: 'Only one Cheques in Hand account is allowed' };
      }
      setDb((prev) => {
        const accounts = [...prev.accounts];
        const existingIdx = accounts.findIndex((x) => x.id === acc.id);
        if (existingIdx > -1) {
          accounts[existingIdx] = acc;
          audit('Account updated', acc.name);
        } else {
          accounts.push(acc);
          audit('Account created', acc.name);
        }
        return { ...prev, accounts };
      });
      toastMsg('Account saved');
      return { ok: true };
    },
    [db.accounts, audit, toastMsg, sessionUser]
  );

  const deleteAccount = useCallback(
    (acc: MoneyAccount) => {
      if (!checkCanDelete(sessionUser, 'money')) {
        return { ok: false, error: 'Permission denied: You do not have permission to delete accounts.' };
      }
      const used =
        db.payments.some((p) => p.accountId === acc.id) ||
        db.expenses.some((e) => e.accountId === acc.id) ||
        db.moneyMoves.some((m) => m.fromAccountId === acc.id || m.toAccountId === acc.id) ||
        db.checks.some(
          (c) => c.clearedAccountId === acc.id || (c.payouts || []).some((p) => p.accountId === acc.id)
        );
      if (used) {
        return { ok: false, error: 'Account has movements and cannot be deleted' };
      }
      setDb((prev) => {
        const accounts = prev.accounts.filter((x) => x.id !== acc.id);
        audit('Account deleted', acc.name);
        return { ...prev, accounts };
      });
      toastMsg('Account deleted');
      return { ok: true };
    },
    [db.payments, db.expenses, db.moneyMoves, db.checks, audit, toastMsg, sessionUser]
  );

  // Money Moves
  const saveMove = useCallback(
    (move: MoneyMove) => {
      setDb((prev) => {
        const moneyMoves = [...prev.moneyMoves, move];
        audit('Money move', `${move.no}   ${move.amount}`);
        return { ...prev, moneyMoves };
      });
      toastMsg(move.status === 'transit' ? `Transfer ${move.no} in transit` : `Money moved ${move.amount}`);
      return { ok: true };
    },
    [audit, toastMsg]
  );

  const acceptMove = useCallback(
    (move: MoneyMove) => {
      setDb((prev) => {
        const moneyMoves = prev.moneyMoves.map((m) =>
          m.id === move.id ? { ...m, status: 'done' as const, acceptedDate: todayStr() } : m
        );
        audit('Money transfer received', move.no);
        return { ...prev, moneyMoves };
      });
      toastMsg(`Transfer ${move.no} received`);
    },
    [audit, toastMsg]
  );

  const cancelMove = useCallback(
    (move: MoneyMove) => {
      if (!checkCanEdit(sessionUser, 'money') && !checkCanDelete(sessionUser, 'money')) {
        toastMsg('Permission denied: You do not have permission to cancel money transfers.', 'error');
        return;
      }
      setDb((prev) => {
        const moneyMoves = prev.moneyMoves.map((m) =>
          m.id === move.id ? { ...m, status: 'cancelled' as const } : m
        );
        audit('Money transfer cancelled', move.no);
        return { ...prev, moneyMoves };
      });
      toastMsg('Money transfer cancelled');
    },
    [audit, toastMsg, sessionUser]
  );

  // Expenses
  const saveExpense = useCallback(
    (exp: Expense) => {
      const isExisting = db.expenses.some((e) => e.id === exp.id);
      if (isExisting && !checkCanEdit(sessionUser, 'expenses')) {
        return { ok: false, error: 'Permission denied: You do not have permission to edit expenses.' };
      }
      setDb((prev) => {
        const expenses = isExisting
          ? prev.expenses.map((e) => (e.id === exp.id ? exp : e))
          : [...prev.expenses, exp];
        audit('Expense', `${exp.no}   ${exp.category}   ${exp.amount}`);
        return { ...prev, expenses };
      });
      toastMsg(`Expense ${exp.no} recorded`);
      return { ok: true };
    },
    [db.expenses, audit, toastMsg, sessionUser]
  );

  const deleteExpense = useCallback(
    (exp: Expense) => {
      if (!checkCanDelete(sessionUser, 'expenses')) {
        toastMsg('Permission denied: You do not have permission to delete expenses.', 'error');
        audit('Unauthorized delete attempt blocked', `Expense ${exp.no}`);
        return;
      }
      setDb((prev) => {
        const expenses = prev.expenses.filter((x) => x.id !== exp.id);
        audit('Expense deleted', exp.no);
        return { ...prev, expenses };
      });
      toastMsg('Expense deleted');
    },
    [audit, toastMsg, sessionUser]
  );

  // Preserve the currently authenticated Firebase admin user on workspace-wide reset/restore
  const buildPreservedAdminUser = useCallback((branchList: Branch[]): User => {
    const activeUid = auth.currentUser?.uid || sessionUser?.id || 'u1';
    const existingSelf = latestDbRef.current.users.find((u) => u.id === activeUid);
    return {
      id: activeUid,
      name: existingSelf?.name || sessionUser?.name || 'Administrator',
      username: existingSelf?.username || sessionUser?.username || 'admin',
      pass: '',
      role: 'admin',
      branchIds: branchList.map((b) => b.id),
      active: true,
      perms: {},
    };
  }, [sessionUser]);

  const loadDemoData = useCallback(() => {
    if (sessionUser?.role !== 'admin') {
      toastMsg('Only administrators can load demo data.', 'error');
      return;
    }
    const fresh = migrateDb(seedData(), true);
    fresh.settings = { ...fresh.settings, workspaceInitialized: true };
    fresh.users = [buildPreservedAdminUser(fresh.branches)];
    setBranchId(fresh.branches[0]?.id || 'b1');
    setDb(fresh);
    audit('Demo data reset', 'Fresh 6-month demo dataset loaded');
    toastMsg('Demo data restored');
  }, [sessionUser, buildPreservedAdminUser, audit, toastMsg]);

  const eraseAllData = useCallback(() => {
    if (sessionUser?.role !== 'admin') {
      toastMsg('Only administrators can erase workspace data.', 'error');
      return;
    }
    const blank = emptyData();
    blank.settings = { ...blank.settings, workspaceInitialized: true };
    blank.users = [buildPreservedAdminUser(blank.branches)];
    blank.audit = [
      ...latestDbRef.current.audit.slice(-799),
      createAuditEntry(
        session?.name || 'Administrator',
        'Workspace erased',
        'Initialized clean company workspace'
      ),
    ];
    setBranchId(blank.branches[0]?.id || 'b1');
    setDb(blank);
    toastMsg('All data erased');
  }, [sessionUser, session, buildPreservedAdminUser, toastMsg]);

  const restoreDatabase = useCallback(
    (newDb: DatabaseSchema) => {
      if (sessionUser?.role !== 'admin') {
        toastMsg('Only administrators can restore a database backup.', 'error');
        return;
      }
      const migrated = migrateDb(newDb, true);
      migrated.settings = { ...migrated.settings, workspaceInitialized: true };
      const adminSelf = buildPreservedAdminUser(migrated.branches);
      const otherActiveUsers = migrated.users.filter(
        (u) => u.id !== adminSelf.id && u.username.toLowerCase() !== adminSelf.username.toLowerCase()
      );
      migrated.users = [adminSelf, ...otherActiveUsers];
      setBranchId(migrated.branches[0]?.id || 'b1');
      setDb(migrated);
      audit('Backup restored');
      toastMsg('Backup restored successfully');
    },
    [sessionUser, buildPreservedAdminUser, audit, toastMsg]
  );

  return (
    <IMSContext.Provider
      value={{
        db,
        session,
        branchId,
        view,
        theme,
        sidebarCollapsed,
        syncing,
        toast,
        errBanner,
        errLog,
        setDb,
        setView,
        setBranchId,
        setTheme,
        toggleTheme,
        setSidebarCollapsed,
        setErrBanner,
        setErrLog,
        toastMsg,
        audit,
        logError,
        login,
        logout,
        t,
        featOn,
        canAccess,
        myBranches,
        allowedNavs,
        sessionUser,
        nextNo,
        stockOf,
        stocksOf,
        addStock,
        takeStock,
        takeFEFO,
        subtractStock,
        saveInvoice,
        deleteInvoice,
        saveDelivery,
        deleteDelivery,
        saveReturnSlip,
        deleteReturnSlip,
        saveReturnInvoice,
        deleteReturnInvoice,
        saveIntake,
        deleteIntake,
        saveArrival,
        deleteArrival,
        confirmPayment,
        deletePayment,
        saveBarter,
        deleteBarter,
        saveCheck,
        deleteCheck,
        setCheckStatus,
        confirmPayout,
        saveTransfer,
        receiveTransfer,
        cancelTransfer,
        saveDisposal,
        approveDisposal,
        rejectDisposal,
        saveItem,
        deleteItem,
        saveCustomer,
        deleteCustomer,
        saveUser,
        deleteUser,
        saveBranch,
        deleteBranch,
        saveAdjust,
        saveAccount,
        deleteAccount,
        saveMove,
        acceptMove,
        cancelMove,
        saveExpense,
        deleteExpense,
        loadDemoData,
        eraseAllData,
        restoreDatabase,
        canDelete,
        canEdit,
        canAdjustInventory,
        canViewReport,
        canViewCost,
        canViewCompanyWorth,
        maskCost,
        maskWorth,
      }}
    >
      {isDbReady ? (
        children
      ) : (
        <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-300 text-sm">
          Loading system data...
        </div>
      )}
    </IMSContext.Provider>
  );
};

export const useIMS = () => {
  const context = useContext(IMSContext);
  if (!context) throw new Error('useIMS must be used within an IMSProvider');
  return context;
};
