import type { AuditLog, DatabaseSchema, Settings } from '../types/index.ts';
import { simulateStock } from './stockSimulation.ts';

const MERGEABLE_ENTITY_COLLECTIONS = [
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
] as const;

type MergeableCollection = (typeof MERGEABLE_ENTITY_COLLECTIONS)[number];

export interface MergeDatabasesResult {
  db: DatabaseSchema;
  mergedRemoteRecords: number;
  mergedLocalRecords: number;
}

function stableJson(val: unknown): string {
  if (val === null || val === undefined) return String(val);
  if (typeof val !== 'object') return JSON.stringify(val);
  if (Array.isArray(val)) {
    return `[${val.map((item) => stableJson(item)).join(',')}]`;
  }
  const obj = val as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableJson(obj[k])}`).join(',')}}`;
}

function mergeRecordFields<T extends Record<string, unknown>>(
  baseRec: T,
  localRec: T,
  remoteRec: T
): T {
  const keys = new Set([
    ...Object.keys(baseRec),
    ...Object.keys(localRec),
    ...Object.keys(remoteRec),
  ]);
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    const bVal = baseRec[key];
    const lVal = localRec[key];
    const rVal = remoteRec[key];
    const localChanged = stableJson(lVal) !== stableJson(bVal);
    const remoteChanged = stableJson(rVal) !== stableJson(bVal);

    if (localChanged && !remoteChanged) {
      if (lVal !== undefined) out[key] = structuredClone(lVal);
    } else if (!localChanged && remoteChanged) {
      if (rVal !== undefined) out[key] = structuredClone(rVal);
    } else if (localChanged && remoteChanged) {
      if (
        bVal &&
        lVal &&
        rVal &&
        typeof bVal === 'object' &&
        typeof lVal === 'object' &&
        typeof rVal === 'object' &&
        !Array.isArray(bVal) &&
        !Array.isArray(lVal) &&
        !Array.isArray(rVal)
      ) {
        out[key] = mergeRecordFields(
          bVal as Record<string, unknown>,
          lVal as Record<string, unknown>,
          rVal as Record<string, unknown>
        );
      } else if (lVal !== undefined) {
        out[key] = structuredClone(lVal);
      }
    } else if (rVal !== undefined) {
      out[key] = structuredClone(rVal);
    }
  }
  return out as T;
}

function mergeSettings(
  baseSettings: Settings | undefined,
  localSettings: Settings,
  remoteSettings: Settings
): Settings {
  if (!baseSettings) {
    const mergedFeatures = {
      ...(remoteSettings.features || {}),
      ...(localSettings.features || {}),
    };
    return {
      ...remoteSettings,
      ...localSettings,
      features: mergedFeatures,
    };
  }

  return mergeRecordFields(
    baseSettings as unknown as Record<string, unknown>,
    localSettings as unknown as Record<string, unknown>,
    remoteSettings as unknown as Record<string, unknown>
  ) as unknown as Settings;
}

export function mergeCounters(
  baseCounters: Record<string, Record<string, number>> | undefined,
  localCounters: Record<string, Record<string, number>> | undefined,
  remoteCounters: Record<string, Record<string, number>> | undefined
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const branchIds = new Set([
    ...Object.keys(baseCounters || {}),
    ...Object.keys(remoteCounters || {}),
    ...Object.keys(localCounters || {}),
  ]);

  for (const bid of branchIds) {
    const bMap = baseCounters?.[bid] || {};
    const rMap = remoteCounters?.[bid] || {};
    const lMap = localCounters?.[bid] || {};
    const types = new Set([
      ...Object.keys(bMap),
      ...Object.keys(rMap),
      ...Object.keys(lMap),
    ]);
    const branchCounters: Record<string, number> = {};
    for (const type of types) {
      const vals = [bMap[type], rMap[type], lMap[type]].filter(
        (v): v is number => typeof v === 'number' && Number.isFinite(v)
      );
      branchCounters[type] = vals.length > 0 ? Math.max(...vals) : 1000;
    }
    out[bid] = branchCounters;
  }

  return out;
}

function mergeAuditLogs(
  localAudit: AuditLog[] | undefined,
  remoteAudit: AuditLog[] | undefined
): AuditLog[] {
  const byId = new Map<string, AuditLog>();
  for (const entry of remoteAudit || []) {
    if (entry && typeof entry.id === 'string') {
      byId.set(entry.id, structuredClone(entry));
    }
  }
  for (const entry of localAudit || []) {
    if (entry && typeof entry.id === 'string' && !byId.has(entry.id)) {
      byId.set(entry.id, structuredClone(entry));
    }
  }
  const merged = Array.from(byId.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));
  if (merged.length > 800) {
    return merged.slice(merged.length - 800);
  }
  return merged;
}

function indexById(arr: unknown[] | undefined): { order: string[]; map: Map<string, Record<string, unknown>> } {
  const order: string[] = [];
  const map = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(arr)) return { order, map };
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const id = typeof rec.id === 'string' ? rec.id : '';
    if (!id) continue;
    if (!map.has(id)) order.push(id);
    map.set(id, rec);
  }
  return { order, map };
}

/**
 * Three-way entity-level merge for concurrent multi-staff updates.
 * Preserves records created, modified, or deleted concurrently by different staff
 * and deterministically recomputes branch inventory from merged transactions.
 */
export function mergeDatabases(params: {
  baseDb?: DatabaseSchema | null;
  localDb: DatabaseSchema;
  remoteDb: DatabaseSchema;
}): MergeDatabasesResult {
  const { baseDb, localDb, remoteDb } = params;
  const merged: Record<string, unknown> = {
    settings: mergeSettings(baseDb?.settings, localDb.settings, remoteDb.settings),
    counters: mergeCounters(baseDb?.counters, localDb.counters, remoteDb.counters),
    audit: mergeAuditLogs(localDb.audit, remoteDb.audit),
  };

  let mergedRemoteRecords = 0;
  let mergedLocalRecords = 0;

  for (const kind of MERGEABLE_ENTITY_COLLECTIONS) {
    const baseIdx = indexById(baseDb ? (baseDb[kind] as unknown[]) : undefined);
    const remoteIdx = indexById(remoteDb[kind] as unknown[]);
    const localIdx = indexById(localDb[kind] as unknown[]);

    const seen = new Set<string>();
    const allIds: string[] = [];
    for (const id of [...remoteIdx.order, ...localIdx.order]) {
      if (!seen.has(id)) {
        seen.add(id);
        allIds.push(id);
      }
    }

    const resultList: Record<string, unknown>[] = [];

    for (const id of allIds) {
      const bRec = baseIdx.map.get(id);
      const rRec = remoteIdx.map.get(id);
      const lRec = localIdx.map.get(id);

      if (!baseDb) {
        if (lRec && rRec) {
          if (stableJson(lRec) !== stableJson(rRec)) {
            resultList.push(structuredClone(lRec));
            mergedLocalRecords += 1;
          } else {
            resultList.push(structuredClone(rRec));
          }
        } else if (rRec) {
          resultList.push(structuredClone(rRec));
          mergedRemoteRecords += 1;
        } else if (lRec) {
          resultList.push(structuredClone(lRec));
          mergedLocalRecords += 1;
        }
        continue;
      }

      if (!bRec) {
        if (lRec && rRec) {
          resultList.push(structuredClone(lRec));
          mergedLocalRecords += 1;
        } else if (rRec) {
          resultList.push(structuredClone(rRec));
          mergedRemoteRecords += 1;
        } else if (lRec) {
          resultList.push(structuredClone(lRec));
          mergedLocalRecords += 1;
        }
      } else {
        const localChanged = lRec ? stableJson(lRec) !== stableJson(bRec) : false;
        const remoteChanged = rRec ? stableJson(rRec) !== stableJson(bRec) : false;

        if (!lRec && rRec) {
          if (remoteChanged) {
            // Remote staff edited after base; preserve remote edit rather than silently dropping
            resultList.push(structuredClone(rRec));
            mergedRemoteRecords += 1;
          }
          // Otherwise local staff deleted it intentionally; omit
        } else if (lRec && !rRec) {
          if (localChanged) {
            resultList.push(structuredClone(lRec));
            mergedLocalRecords += 1;
          }
          // Otherwise remote staff deleted it intentionally; keep deleted
        } else if (lRec && rRec) {
          if (!localChanged && remoteChanged) {
            resultList.push(structuredClone(rRec));
            mergedRemoteRecords += 1;
          } else if (localChanged && !remoteChanged) {
            resultList.push(structuredClone(lRec));
            mergedLocalRecords += 1;
          } else if (localChanged && remoteChanged) {
            resultList.push(mergeRecordFields(bRec, lRec, rRec));
            mergedLocalRecords += 1;
          } else {
            resultList.push(structuredClone(rRec));
          }
        }
      }
    }

    merged[kind as MergeableCollection] = resultList;
  }

  const finalDb = merged as unknown as DatabaseSchema;
  finalDb.stocks = simulateStock(finalDb);

  return {
    db: finalDb,
    mergedRemoteRecords,
    mergedLocalRecords,
  };
}
