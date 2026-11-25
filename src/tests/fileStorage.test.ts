import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  resolveStoragePaths,
  ensureStorageDirs,
  readDatabaseFile,
  writeDatabaseFile,
  createBackupSnapshot,
  getStorageStats,
  isValidDbShape,
} from '../utils/fileStorage.ts';
import { seedData } from '../data/seedData.ts';

async function withTempDir(fn: (tmpDir: string) => Promise<void>): Promise<void> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ims-storage-test-'));
  try {
    await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('resolveStoragePaths resolves separate ims-data folder relative to workspace baseDir', () => {
  const paths = resolveStoragePaths(undefined, '/srv/app');
  assert.equal(paths.dataDir, '/srv/app/ims-data');
  assert.equal(paths.dbFile, '/srv/app/ims-data/database.json');
  assert.equal(paths.backupsDir, '/srv/app/ims-data/backups');
});

test('readDatabaseFile returns exists=false cleanly when database.json has not been created yet', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('custom-folder', tmpDir);
    const result = await readDatabaseFile(paths);
    assert.equal(result.exists, false);
    assert.equal(result.db, null);
  });
});

test('writeDatabaseFile creates the separate data folder atomically and reloads identical data', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('ims-data', tmpDir);
    const sampleDb = seedData() as unknown as Record<string, unknown>;
    (sampleDb.settings as Record<string, unknown>).companyName = 'Folder Saved Co.';

    const stats = await writeDatabaseFile(paths, sampleDb, tmpDir);
    assert.equal(stats.exists, true);
    assert.equal(stats.relativeDataDir, 'ims-data');
    assert.equal(stats.relativeDbFile, path.join('ims-data', 'database.json'));
    assert.ok(stats.sizeBytes > 100);
    assert.ok(stats.updatedAt);

    const loaded = await readDatabaseFile(paths);
    assert.equal(loaded.exists, true);
    assert.equal((loaded.db?.settings as Record<string, unknown>)?.companyName, 'Folder Saved Co.');
  });
});

test('concurrent writeDatabaseFile calls serialize cleanly without corrupting JSON', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('ims-data', tmpDir);
    await ensureStorageDirs(paths);

    const writes = Array.from({ length: 6 }, (_, idx) => {
      const db = seedData() as unknown as Record<string, unknown>;
      (db.settings as Record<string, unknown>).companyName = `Concurrent Co #${idx}`;
      return writeDatabaseFile(paths, db, tmpDir);
    });

    await Promise.all(writes);
    const loaded = await readDatabaseFile(paths);
    assert.equal(loaded.exists, true);
    assert.equal((loaded.db?.settings as Record<string, unknown>)?.companyName, 'Concurrent Co #5');
  });
});

test('createBackupSnapshot writes a timestamped JSON snapshot into backups/ inside the data folder', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('ims-data', tmpDir);
    const sampleDb = seedData() as unknown as Record<string, unknown>;
    await writeDatabaseFile(paths, sampleDb, tmpDir);

    const snap = await createBackupSnapshot(paths);
    assert.ok(snap.fileName.startsWith('ims-backup-'));
    assert.ok(snap.filePath.startsWith(paths.backupsDir));
    assert.ok(snap.sizeBytes > 100);

    const stats = await getStorageStats(paths, tmpDir);
    assert.equal(stats.backupCount, 1);

    const rawSnap = JSON.parse(await fs.readFile(snap.filePath, 'utf8'));
    assert.equal(isValidDbShape(rawSnap), true);
  });
});

test('writeDatabaseFile rejects malformed database payloads', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('ims-data', tmpDir);
    await assert.rejects(() => writeDatabaseFile(paths, { foo: 'bar' }, tmpDir), /Invalid database payload/);
  });
});

test('versioned snapshots persist to .snapshots directory and prune older versions beyond 12', async () => {
  await withTempDir(async (tmpDir) => {
    const paths = resolveStoragePaths('ims-data', tmpDir);
    assert.equal(paths.snapshotsDir, path.join(tmpDir, 'ims-data', '.snapshots'));

    for (let v = 1; v <= 15; v++) {
      const db = seedData() as unknown as Record<string, unknown>;
      (db.settings as Record<string, unknown>).companyName = `Snapshot Co v${v}`;
      await writeDatabaseFile(paths, db, tmpDir);
    }

    const snapFiles = (await fs.readdir(paths.snapshotsDir)).filter((f) => /^v\d+\.json$/.test(f));
    assert.ok(snapFiles.length <= 12, `Expected <= 12 snapshot files, got ${snapFiles.length}`);
    assert.equal(snapFiles.includes('v1.json'), false);
    assert.equal(snapFiles.includes('v15.json'), true);
  });
});
