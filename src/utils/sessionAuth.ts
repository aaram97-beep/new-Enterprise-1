import type { User, UserSession } from '../types';

export const SESSION_STORAGE_KEY = 'ims_session';

export interface StorageLike {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export interface StoredSessionRecord {
  session: UserSession;
  remember: boolean;
}

function getDefaultLocalStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function getDefaultSessionStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

export function isValidSessionShape(raw: unknown): raw is UserSession {
  if (!raw || typeof raw !== 'object') return false;
  const candidate = raw as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.trim().length > 0 &&
    typeof candidate.username === 'string' &&
    candidate.username.trim().length > 0 &&
    typeof candidate.name === 'string' &&
    (candidate.role === 'admin' || candidate.role === 'user')
  );
}

export function readStoredSession(
  localStore: StorageLike | null = getDefaultLocalStorage(),
  sessionStore: StorageLike | null = getDefaultSessionStorage()
): StoredSessionRecord | null {
  const tryParse = (store: StorageLike | null): UserSession | null => {
    if (!store) return null;
    try {
      const raw = store.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (isValidSessionShape(parsed)) {
        return {
          id: parsed.id,
          name: parsed.name,
          role: parsed.role,
          username: parsed.username,
        };
      }
    } catch {
      // Corrupt JSON cannot grant a session
    }
    return null;
  };

  const fromLocal = tryParse(localStore);
  if (fromLocal) {
    return { session: fromLocal, remember: true };
  }

  const fromSession = tryParse(sessionStore);
  if (fromSession) {
    return { session: fromSession, remember: false };
  }

  return null;
}

export function writeStoredSession(
  session: UserSession | null,
  remember = true,
  localStore: StorageLike | null = getDefaultLocalStorage(),
  sessionStore: StorageLike | null = getDefaultSessionStorage()
): void {
  if (!session) {
    clearStoredSession(localStore, sessionStore);
    return;
  }

  const payload = JSON.stringify({
    id: session.id,
    name: session.name,
    role: session.role,
    username: session.username,
  });

  if (remember) {
    try {
      localStore?.setItem(SESSION_STORAGE_KEY, payload);
      sessionStore?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Fallback cleanly to sessionStorage if localStorage quota fails
      try {
        sessionStore?.setItem(SESSION_STORAGE_KEY, payload);
      } catch {
        // ignore
      }
    }
  } else {
    try {
      sessionStore?.setItem(SESSION_STORAGE_KEY, payload);
      localStore?.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore
    }
  }
}

export function clearStoredSession(
  localStore: StorageLike | null = getDefaultLocalStorage(),
  sessionStore: StorageLike | null = getDefaultSessionStorage()
): void {
  try {
    localStore?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
  try {
    sessionStore?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Resolves the authoritative User record from `db.users`.
 * Rejects tampered, deleted, username-mismatched, or deactivated user sessions.
 */
export function resolveAuthenticatedUser(
  session: UserSession | null | undefined,
  users: User[]
): User | null {
  if (!isValidSessionShape(session) || !Array.isArray(users)) return null;
  const matched = users.find((u) => u.id === session.id);
  if (!matched || matched.active !== true || matched.deleted === true) return null;
  if (matched.username.trim().toLowerCase() !== session.username.trim().toLowerCase()) {
    return null;
  }
  return matched;
}

/**
 * Pure route guard verifying that no protected view can render without an active authenticated user.
 */
export function isProtectedViewAllowed(
  sessionUser: User | null | undefined,
  targetView: string,
  hasAccess: (viewId: string) => boolean
): boolean {
  if (!sessionUser || sessionUser.active !== true || sessionUser.deleted === true) return false;
  if (!targetView) return false;
  if (targetView === 'dash' || targetView === 'alerts') return true;
  return hasAccess(targetView);
}
