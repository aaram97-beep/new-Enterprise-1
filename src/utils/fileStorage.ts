import fs from 'node:fs/promises';
import path from 'node:path';
import type { DatabaseSchema } from '../types/index.ts';
import { mergeDatabases } from './dbMerge.ts';

export interface StoragePaths {
  dataDir: string;
  dbFile: string;
  backupsDir: string;
  metaFile: string;
  snapshotsDir: string;
}

export interface StorageStats {
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

export interface WriteWithMergeResult {
  merged: boolean;
  version: number;
  db: Record<string, unknown>;
  stats: StorageStats;
  mergedRemoteRecords: number;
}

const DEFAULT_FOLDER_NAME = 'ims-data';
const DB_FILENAME = 'database.json';
const META_FILENAME = 'meta.json';
const BACKUPS_DIRNAME = 'backups';
const SNAPSHOTS_DIRNAME = '.snapshots';
const MAX_SNAPSHOT_HISTORY = 12;

// Per-file write queue so concurrent API writes never race or corrupt JSON
const writeQueues = new Map<string, Promise<unknown>>();
// Bounded recent version history per dbFile so concurrent multi-staff writes can 3-way merge without extra client bandwidth
const versionSnapshots = new Map<string, Map<number, DatabaseSchema>>();

function recordSnapshotMemory(dbFile: string, version: number, db: Record<string, unknown>): void {
  let history = versionSnapshots.get(dbFile);
  if (!history) {
    history = new Map<number, DatabaseSchema>();
    versionSnapshots.set(dbFile, history);
  }
  history.set(version, structuredClone(db) as unknown as DatabaseSchema);
  if (history.size > MAX_SNAPSHOT_HISTORY) {
    const oldestKey = history.keys().next().value;
    if (typeof oldestKey === 'number') {
      history.delete(oldestKey);
    }
  }
}

async function persistSnapshot(paths: StoragePaths, version: number, db: Record<string, unknown>): Promise<void> {
  recordSnapshotMemory(paths.dbFile, version, db);
  try {
    await fs.mkdir(paths.snapshotsDir, { recursive: true });
    const snapFile = path.join(paths.snapshotsDir, `v${version}.json`);
    await atomicWriteJson(snapFile, db);
    const minKeep = version - MAX_SNAPSHOT_HISTORY;
    if (minKeep > 0) {
      const files = await fs.readdir(paths.snapshotsDir).catch(() => [] as string[]);
      for (const f of files) {
        const m = /^v(\d+)\.json$/.exec(f);
        if (m && Number(m[1]) <= minKeep) {
          await fs.unlink(path.join(paths.snapshotsDir, f)).catch(() => undefined);
        }
      }
    }
  } catch {
    // Best-effort disk snapshot; memory map still holds snapshot
  }
}

async function getRecordedSnapshot(paths: StoragePaths, version: number): Promise<DatabaseSchema | null> {
  const inMem = versionSnapshots.get(paths.dbFile)?.get(version);
  if (inMem) return inMem;
  try {
    const snapFile = path.join(paths.snapshotsDir, `v${version}.json`);
    const raw = await fs.readFile(snapFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (isValidDbShape(parsed)) {
      recordSnapshotMemory(paths.dbFile, version, parsed);
      return parsed as unknown as DatabaseSchema;
    }
  } catch {
    // Snapshot not present or expired
  }
  return null;
}

function enqueueWrite<T>(key: string, task: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.then(
    () => undefined,
    () => undefined
  );
  writeQueues.set(key, settled);
  return next;
}

export function resolveStoragePaths(
  customDir?: string,
  baseDir: string = process.cwd()
): StoragePaths {
  const rawDir = (customDir ?? process.env.IMS_DATA_DIR ?? DEFAULT_FOLDER_NAME).trim() || DEFAULT_FOLDER_NAME;
  const dataDir = path.isAbsolute(rawDir) ? path.resolve(rawDir) : path.resolve(baseDir, rawDir);
  return {
    dataDir,
    dbFile: path.join(dataDir, DB_FILENAME),
    backupsDir: path.join(dataDir, BACKUPS_DIRNAME),
    metaFile: path.join(dataDir, META_FILENAME),
    snapshotsDir: path.join(dataDir, SNAPSHOTS_DIRNAME),
  };
}

export function isValidDbShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    Array.isArray(obj.invoices) &&
    Array.isArray(obj.items) &&
    Array.isArray(obj.customers) &&
    Array.isArray(obj.branches)
  );
}

export async function ensureStorageDirs(paths: StoragePaths): Promise<void> {
  await fs.mkdir(paths.dataDir, { recursive: true });
  await fs.mkdir(paths.backupsDir, { recursive: true });
}

export async function readVersionMeta(paths: StoragePaths): Promise<number> {
  try {
    const raw = await fs.readFile(paths.metaFile, 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    if (typeof parsed.version === 'number' && Number.isFinite(parsed.version) && parsed.version >= 0) {
      return Math.floor(parsed.version);
    }
  } catch {
    // meta.json missing or unreadable; infer from database.json existence below
  }
  try {
    const stat = await fs.stat(paths.dbFile);
    return stat.isFile() ? 1 : 0;
  } catch {
    return 0;
  }
}

async function atomicWriteJson(targetPath: string, payload: unknown): Promise<number> {
  const serialized = JSON.stringify(payload, null, 2);
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  const tmpPath = path.join(
    dir,
    `.${base}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  await fs.writeFile(tmpPath, serialized, 'utf8');
  await fs.rename(tmpPath, targetPath);
  return Buffer.byteLength(serialized, 'utf8');
}

async function writeVersionMeta(paths: StoragePaths, version: number): Promise<void> {
  await atomicWriteJson(paths.metaFile, {
    version,
    updatedAt: new Date().toISOString(),
  });
}

export async function readDatabaseFile(
  paths: StoragePaths
): Promise<{ exists: boolean; db: Record<string, unknown> | null; version: number }> {
  try {
    const raw = await fs.readFile(paths.dbFile, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isValidDbShape(parsed)) {
      throw new Error('Stored database JSON has invalid structure');
    }
    const version = Math.max(await readVersionMeta(paths), 1);
    if (!(await getRecordedSnapshot(paths, version))) {
      recordSnapshotMemory(paths.dbFile, version, parsed);
    }
    return { exists: true, db: parsed, version };
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code === 'ENOENT') {
      return { exists: false, db: null, version: 0 };
    }
    throw err;
  }
}

export async function writeDatabaseFile(
  paths: StoragePaths,
  db: Record<string, unknown>,
  baseDir: string = process.cwd()
): Promise<StorageStats> {
  if (!isValidDbShape(db)) {
    throw new Error('Invalid database payload');
  }
  return enqueueWrite(paths.dbFile, async () => {
    await ensureStorageDirs(paths);
    const prevVersion = await readVersionMeta(paths);
    const nextVersion = prevVersion + 1;
    await atomicWriteJson(paths.dbFile, db);
    await writeVersionMeta(paths, nextVersion);
    await persistSnapshot(paths, nextVersion, db);
    return getStorageStats(paths, baseDir);
  });
}

export async function writeDatabaseWithMerge(
  paths: StoragePaths,
  incomingDb: Record<string, unknown>,
  options: {
    baseVersion?: number;
    baseDb?: Record<string, unknown> | null;
    mode?: 'merge' | 'replace';
  } = {},
  baseDir: string = process.cwd()
): Promise<WriteWithMergeResult> {
  if (!isValidDbShape(incomingDb)) {
    throw new Error('Invalid database payload');
  }

  return enqueueWrite(paths.dbFile, async () => {
    await ensureStorageDirs(paths);
    const current = await readDatabaseFile(paths);
    const mode = options.mode === 'replace' ? 'replace' : 'merge';

    let finalDb: Record<string, unknown> = incomingDb;
    let merged = false;
    let mergedRemoteRecords = 0;

    if (
      mode === 'merge' &&
      current.exists &&
      current.db &&
      typeof options.baseVersion === 'number' &&
      options.baseVersion > 0 &&
      options.baseVersion < current.version
    ) {
      const baseSnapshot =
        (options.baseDb && isValidDbShape(options.baseDb)
          ? (options.baseDb as unknown as DatabaseSchema)
          : null) ?? (await getRecordedSnapshot(paths, options.baseVersion));

      const mergeResult = mergeDatabases({
        baseDb: baseSnapshot,
        localDb: incomingDb as unknown as DatabaseSchema,
        remoteDb: current.db as unknown as DatabaseSchema,
      });

      finalDb = mergeResult.db as unknown as Record<string, unknown>;
      merged = true;
      mergedRemoteRecords = mergeResult.mergedRemoteRecords;
    }

    const nextVersion = current.version + 1;
    await atomicWriteJson(paths.dbFile, finalDb);
    await writeVersionMeta(paths, nextVersion);
    await persistSnapshot(paths, nextVersion, finalDb);
    const stats = await getStorageStats(paths, baseDir);

    return {
      merged,
      version: nextVersion,
      db: finalDb,
      stats,
      mergedRemoteRecords,
    };
  });
}

export async function createBackupSnapshot(
  paths: StoragePaths,
  dbOverride?: Record<string, unknown>
): Promise<{ fileName: string; filePath: string; sizeBytes: number; createdAt: string }> {
  return enqueueWrite(paths.dbFile, async () => {
    await ensureStorageDirs(paths);
    let payload = dbOverride;
    if (!payload) {
      const current = await readDatabaseFile(paths);
      if (!current.exists || !current.db) {
        throw new Error('No database saved in folder yet');
      }
      payload = current.db;
    }
    if (!isValidDbShape(payload)) {
      throw new Error('Invalid database payload');
    }
    const now = new Date();
    const stamp = now.toISOString().replace(/[:.]/g, '-');
    const fileName = `ims-backup-${stamp}.json`;
    const filePath = path.join(paths.backupsDir, fileName);
    const sizeBytes = await atomicWriteJson(filePath, payload);
    return {
      fileName,
      filePath,
      sizeBytes,
      createdAt: now.toISOString(),
    };
  });
}

export async function getStorageStats(
  paths: StoragePaths,
  baseDir: string = process.cwd()
): Promise<StorageStats> {
  const relativeDataDir = path.relative(baseDir, paths.dataDir) || '.';
  const relativeDbFile = path.relative(baseDir, paths.dbFile) || DB_FILENAME;

  let exists = false;
  let sizeBytes = 0;
  let updatedAt: string | null = null;

  try {
    const stat = await fs.stat(paths.dbFile);
    exists = stat.isFile();
    sizeBytes = stat.size;
    updatedAt = stat.mtime.toISOString();
  } catch (err: unknown) {
    const code = (err as { code?: string } | null)?.code;
    if (code !== 'ENOENT') {
      throw err;
    }
  }

  let backupCount = 0;
  try {
    const entries = await fs.readdir(paths.backupsDir);
    backupCount = entries.filter((name) => name.endsWith('.json') && !name.startsWith('.')).length;
  } catch {
    backupCount = 0;
  }

  const version = exists ? Math.max(await readVersionMeta(paths), 1) : 0;

  return {
    dataDir: paths.dataDir,
    relativeDataDir,
    dbFile: paths.dbFile,
    relativeDbFile,
    backupsDir: paths.backupsDir,
    exists,
    sizeBytes,
    updatedAt,
    backupCount,
    version,
  };
}
