import test from 'node:test';
import assert from 'node:assert/strict';
import type { User, UserSession } from '../types';
import {
  clearStoredSession,
  isProtectedViewAllowed,
  readStoredSession,
  resolveAuthenticatedUser,
  SESSION_STORAGE_KEY,
  writeStoredSession,
  type StorageLike,
} from '../utils/sessionAuth';

function makeMemoryStorage(): StorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (k) => (map.has(k) ? map.get(k)! : null),
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
  };
}

const SAMPLE_USERS: User[] = [
  {
    id: 'u1',
    name: 'Administrator',
    username: 'admin',
    pass: 'admin',
    role: 'admin',
    branchIds: ['b1'],
    active: true,
    perms: {},
  },
  {
    id: 'u2',
    name: 'Cashier Sara',
    username: 'sara',
    pass: '1234',
    role: 'user',
    branchIds: ['b1'],
    active: true,
    perms: { sales: true },
  },
  {
    id: 'u3',
    name: 'Former Staff',
    username: 'olduser',
    pass: '1234',
    role: 'user',
    branchIds: ['b1'],
    active: false,
    perms: { sales: true },
  },
];

test('Session persistence: writes to localStorage by default (survives reload / reopen) and clears sessionStorage', () => {
  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  sessionStore.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: 'u2', name: 'Cashier Sara', role: 'user', username: 'sara' }));

  const adminSession: UserSession = { id: 'u1', name: 'Administrator', role: 'admin', username: 'admin' };
  writeStoredSession(adminSession, true, localStore, sessionStore);

  assert.equal(sessionStore.getItem(SESSION_STORAGE_KEY), null);
  const loaded = readStoredSession(localStore, sessionStore);
  assert.deepEqual(loaded, { session: adminSession, remember: true });
});

test('Session persistence: remember=false stores only in sessionStorage and clears localStorage', () => {
  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  localStore.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: 'u1', name: 'Administrator', role: 'admin', username: 'admin' }));

  const userSession: UserSession = { id: 'u2', name: 'Cashier Sara', role: 'user', username: 'sara' };
  writeStoredSession(userSession, false, localStore, sessionStore);

  assert.equal(localStore.getItem(SESSION_STORAGE_KEY), null);
  const loaded = readStoredSession(localStore, sessionStore);
  assert.deepEqual(loaded, { session: userSession, remember: false });
});

test('Session persistence: clearStoredSession removes session from both localStorage and sessionStorage', () => {
  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();

  writeStoredSession({ id: 'u1', name: 'Administrator', role: 'admin', username: 'admin' }, true, localStore, sessionStore);
  clearStoredSession(localStore, sessionStore);

  assert.equal(localStore.getItem(SESSION_STORAGE_KEY), null);
  assert.equal(sessionStore.getItem(SESSION_STORAGE_KEY), null);
  assert.equal(readStoredSession(localStore, sessionStore), null);
});

test('Session validation: ignores corrupt JSON or invalid shapes safely', () => {
  const localStore = makeMemoryStorage();
  const sessionStore = makeMemoryStorage();
  localStore.setItem(SESSION_STORAGE_KEY, '{not-valid-json');
  assert.equal(readStoredSession(localStore, sessionStore), null);

  localStore.setItem(SESSION_STORAGE_KEY, JSON.stringify({ id: 'u1', role: 'superadmin' }));
  assert.equal(readStoredSession(localStore, sessionStore), null);
});

test('Authoritative user resolution: rejects deleted, inactive, or username-tampered stored sessions', () => {
  assert.equal(
    resolveAuthenticatedUser({ id: 'u1', name: 'Administrator', role: 'admin', username: 'admin' }, SAMPLE_USERS)?.id,
    'u1'
  );
  // Inactive user must be blocked
  assert.equal(
    resolveAuthenticatedUser({ id: 'u3', name: 'Former Staff', role: 'user', username: 'olduser' }, SAMPLE_USERS),
    null
  );
  // Deleted / missing user must be blocked
  assert.equal(
    resolveAuthenticatedUser({ id: 'u99', name: 'Ghost', role: 'admin', username: 'ghost' }, SAMPLE_USERS),
    null
  );
  // Mismatched username on forged session id must be blocked
  assert.equal(
    resolveAuthenticatedUser({ id: 'u1', name: 'Fake', role: 'admin', username: 'hacker' }, SAMPLE_USERS),
    null
  );
  // Soft-deleted user must be blocked even if active were mistakenly true
  const softDeletedUser: User = {
    id: 'u4',
    name: 'Deleted Staff',
    username: 'deluser',
    pass: '',
    role: 'user',
    branchIds: ['b1'],
    active: true,
    deleted: true,
    deletedAt: 1700000000000,
    perms: { sales: true },
  };
  assert.equal(
    resolveAuthenticatedUser({ id: 'u4', name: 'Deleted Staff', role: 'user', username: 'deluser' }, [
      ...SAMPLE_USERS,
      softDeletedUser,
    ]),
    null
  );
  // Authoritative role from db.users overrides tampered stored role string
  const resolved = resolveAuthenticatedUser(
    { id: 'u2', name: 'Cashier Sara', role: 'admin', username: 'sara' },
    SAMPLE_USERS
  );
  assert.equal(resolved?.role, 'user');
});

test('Protected view guard: never allows any route or view without an active authenticated user', () => {
  const alwaysAllow = () => true;
  assert.equal(isProtectedViewAllowed(null, 'dash', alwaysAllow), false);
  assert.equal(isProtectedViewAllowed(null, 'invoices', alwaysAllow), false);
  assert.equal(isProtectedViewAllowed(null, 'settings', alwaysAllow), false);
  assert.equal(isProtectedViewAllowed(SAMPLE_USERS[2], 'invoices', alwaysAllow), false);
  assert.equal(
    isProtectedViewAllowed({ ...SAMPLE_USERS[1], deleted: true }, 'invoices', alwaysAllow),
    false
  );

  assert.equal(isProtectedViewAllowed(SAMPLE_USERS[1], 'invoices', (v) => v === 'invoices'), true);
  assert.equal(isProtectedViewAllowed(SAMPLE_USERS[1], 'settings', (v) => v === 'invoices'), false);
});
