import type { DatabaseSchema, UserSession } from '../types';

export interface ClientStorageInfo {
  dataDir: string;
  relativeDataDir: string;
  dbFile: string;
  relativeDbFile: string;
  backupsDir: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
  backupCount: number;
  version: number;
}

export interface PublicMetaResult {
  exists: boolean;
  version: number;
  companyName: string;
  logo: string;
  lang: 'en' | 'ar';
}

export interface LoadDbResult {
  exists: boolean;
  db: DatabaseSchema | null;
  version: number;
  stats: ClientStorageInfo;
}

export interface SaveDbResult {
  ok: boolean;
  merged: boolean;
  version: number;
  db: DatabaseSchema;
  stats: ClientStorageInfo;
  mergedRemoteRecords: number;
}

export class ServerAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const AJAX_HEADERS = {
  'X-Requested-With': 'IMSClient',
};

export async function fetchPublicMeta(): Promise<PublicMetaResult> {
  const res = await fetch('/api/public-meta', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch public metadata (${res.status})`);
  }
  return res.json() as Promise<PublicMetaResult>;
}

export async function loginOnServer(params: {
  username: string;
  password: string;
  remember?: boolean;
  bootstrapDb?: DatabaseSchema | null;
}): Promise<{ ok: boolean; user?: UserSession; version?: number; error?: string }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...AJAX_HEADERS,
    },
    body: JSON.stringify(params),
  });
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    user?: UserSession;
    version?: number;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false, error: data.error || `Login failed (${res.status})` };
  }
  return { ok: true, user: data.user, version: data.version };
}

export async function logoutOnServer(): Promise<void> {
  await fetch('/api/auth/logout', {
    method: 'POST',
    headers: { ...AJAX_HEADERS },
  }).catch(() => undefined);
}

export async function fetchServerDbVersion(): Promise<{ exists: boolean; version: number }> {
  const res = await fetch('/api/db/version', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ServerAuthError('Authentication required', 401);
  }
  if (!res.ok) {
    throw new Error(`Failed to check database version (${res.status})`);
  }
  return res.json() as Promise<{ exists: boolean; version: number }>;
}

export async function fetchServerDb(): Promise<LoadDbResult> {
  const res = await fetch('/api/db', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ServerAuthError('Authentication required', 401);
  }
  if (!res.ok) {
    throw new Error(`Failed to load database (${res.status})`);
  }
  return res.json() as Promise<LoadDbResult>;
}

export async function saveServerDb(
  db: DatabaseSchema,
  options?: {
    keepalive?: boolean;
    baseVersion?: number;
    baseDb?: DatabaseSchema | null;
    mode?: 'merge' | 'replace';
  }
): Promise<SaveDbResult> {
  const res = await fetch('/api/db', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...AJAX_HEADERS,
    },
    body: JSON.stringify({
      db,
      baseVersion: options?.baseVersion,
      baseDb: options?.baseDb ?? undefined,
      mode: options?.mode ?? 'merge',
    }),
    keepalive: Boolean(options?.keepalive),
  });
  if (res.status === 401) {
    throw new ServerAuthError('Authentication required', 401);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to save database (${res.status})`);
  }
  return res.json() as Promise<SaveDbResult>;
}

export async function fetchStorageStats(): Promise<ClientStorageInfo> {
  const res = await fetch('/api/db/stats', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (res.status === 401) {
    throw new ServerAuthError('Authentication required', 401);
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch storage stats (${res.status})`);
  }
  return res.json() as Promise<ClientStorageInfo>;
}

export async function createServerBackupSnapshot(
  db?: DatabaseSchema
): Promise<{ fileName: string; filePath: string; sizeBytes: number; createdAt: string; stats: ClientStorageInfo }> {
  const res = await fetch('/api/db/snapshot', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...AJAX_HEADERS,
    },
    body: JSON.stringify(db ? { db } : {}),
  });
  if (res.status === 401) {
    throw new ServerAuthError('Authentication required', 401);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Failed to create folder snapshot (${res.status})`);
  }
  return res.json();
}
