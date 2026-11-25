import type { Arrival, ArrivalLine, Intake, StockBatch, Item } from '../types';
import { r2 } from './formatters';

export interface IntakeArrivalDraftLine extends ArrivalLine {
  rem: number;
}

export const batchKey = (itemId: string, batchNo?: string, expiry?: string): string =>
  `${itemId}::${(batchNo || '').trim()}::${expiry || ''}`;

export const intakeQtyForItem = (intake: Intake, itemId: string): number =>
  r2(
    (intake.lines || [])
      .filter((l) => l.itemId === itemId)
      .reduce((sum, l) => sum + (+l.qty || 0), 0)
  );

export const arrivedInOtherNotes = (
  arrivals: Arrival[],
  intakeId: string,
  itemId: string,
  excludeArrivalId?: string | null
): number =>
  r2(
    (arrivals || [])
      .filter((a) => a.intakeId === intakeId && a.id !== excludeArrivalId)
      .reduce(
        (acc, a) =>
          acc +
          (a.lines || [])
            .filter((l) => l.itemId === itemId)
            .reduce((y, l) => y + (+l.qty || 0), 0),
        0
      )
  );

export const remainingIntakeCapacity = (
  intake: Intake,
  arrivals: Arrival[],
  itemId: string,
  excludeArrivalId?: string | null
): number => {
  const invoicedQty = intakeQtyForItem(intake, itemId);
  const arrivedOther = arrivedInOtherNotes(arrivals, intake.id, itemId, excludeArrivalId);
  return Math.max(0, r2(invoicedQty - arrivedOther));
};

/**
 * Builds initial draft lines for a purchase-linked Arrival Note.
 * - Preserves ALL lot/expiry split lines when editing an existing arrival.
 * - Aggregates capacity per unique itemId from intake.lines.
 */
export const buildIntakeArrivalLines = (
  intake: Intake,
  arrivals: Arrival[],
  editingArrival?: Arrival | null
): IntakeArrivalDraftLine[] => {
  const uniqueItemIds: string[] = [];
  const itemDefaultCost: Record<string, number> = {};

  (intake.lines || []).forEach((l) => {
    if (!l.itemId) return;
    if (!uniqueItemIds.includes(l.itemId)) {
      uniqueItemIds.push(l.itemId);
    }
    itemDefaultCost[l.itemId] = r2(l.cost || 0);
  });

  if (editingArrival) {
    const draftLines: IntakeArrivalDraftLine[] = [];
    const seenItems = new Set<string>();

    (editingArrival.lines || []).forEach((al) => {
      const maxCap = remainingIntakeCapacity(intake, arrivals, al.itemId, editingArrival.id);
      seenItems.add(al.itemId);
      draftLines.push({
        itemId: al.itemId,
        rem: maxCap,
        qty: r2(+al.qty || 0),
        cost: al.cost !== undefined ? r2(al.cost) : (itemDefaultCost[al.itemId] ?? 0),
        batchNo: al.batchNo || '',
        expiry: al.expiry || '',
      });
    });

    // Also surface any remaining unarrived items from the intake so the user can receive them while editing
    uniqueItemIds.forEach((iid) => {
      if (seenItems.has(iid)) return;
      const maxCap = remainingIntakeCapacity(intake, arrivals, iid, editingArrival.id);
      if (maxCap > 0.005) {
        draftLines.push({
          itemId: iid,
          rem: maxCap,
          qty: 0,
          cost: itemDefaultCost[iid] ?? 0,
          batchNo: '',
          expiry: '',
        });
      }
    });

    return draftLines;
  }

  const initLines: IntakeArrivalDraftLine[] = [];
  uniqueItemIds.forEach((iid) => {
    const maxCap = remainingIntakeCapacity(intake, arrivals, iid, null);
    if (maxCap > 0.005) {
      initLines.push({
        itemId: iid,
        rem: maxCap,
        qty: maxCap,
        cost: itemDefaultCost[iid] ?? 0,
        batchNo: '',
        expiry: '',
      });
    }
  });
  return initLines;
};

/**
 * Splits / duplicates a row at `index` right below it so the user can enter a second lot / expiry.
 * Automatically prefills the new row's qty with any remaining unallocated quantity for that item.
 */
export const splitIntakeArrivalLine = (
  lines: IntakeArrivalDraftLine[],
  index: number
): IntakeArrivalDraftLine[] => {
  const src = lines[index];
  if (!src) return lines;

  const allocatedForItem = r2(
    lines
      .filter((l) => l.itemId === src.itemId)
      .reduce((sum, l) => sum + (+l.qty || 0), 0)
  );
  const unallocated = Math.max(0, r2((src.rem || 0) - allocatedForItem));

  const newRow: IntakeArrivalDraftLine = {
    itemId: src.itemId,
    rem: src.rem,
    qty: unallocated,
    cost: src.cost,
    batchNo: '',
    expiry: '',
  };

  const next = [...lines];
  next.splice(index + 1, 0, newRow);
  return next;
};

export const totalAllocatedForItem = (
  lines: Pick<ArrivalLine, 'itemId' | 'qty'>[],
  itemId: string
): number =>
  r2(
    lines
      .filter((l) => l.itemId === itemId)
      .reduce((sum, l) => sum + (+l.qty || 0), 0)
  );

export type ArrivalValidationResult =
  | { ok: true; validLines: ArrivalLine[] }
  | { ok: false; message: string };

export const validateStockReductionOnEdit = (
  editingArrival: Arrival | null | undefined,
  validLines: ArrivalLine[],
  stocks: StockBatch[],
  items: Item[]
): { ok: true } | { ok: false; message: string } => {
  if (!editingArrival) return { ok: true };

  const oldByBatch = new Map<string, { itemId: string; batchNo: string; expiry: string; qty: number }>();
  (editingArrival.lines || []).forEach((oldLine) => {
    const key = batchKey(oldLine.itemId, oldLine.batchNo, oldLine.expiry);
    const prev = oldByBatch.get(key);
    oldByBatch.set(key, {
      itemId: oldLine.itemId,
      batchNo: (oldLine.batchNo || '').trim(),
      expiry: oldLine.expiry || '',
      qty: r2((prev?.qty || 0) + (+oldLine.qty || 0)),
    });
  });

  const newByBatch = new Map<string, number>();
  validLines.forEach((vl) => {
    const key = batchKey(vl.itemId, vl.batchNo, vl.expiry);
    newByBatch.set(key, r2((newByBatch.get(key) || 0) + (+vl.qty || 0)));
  });

  for (const [key, oldEntry] of oldByBatch.entries()) {
    const newQty = newByBatch.get(key) || 0;
    const reduction = r2(oldEntry.qty - newQty);
    if (reduction > 0.005) {
      const currentStock = stocks.find(
        (s) =>
          s.itemId === oldEntry.itemId &&
          s.branchId === editingArrival.branchId &&
          (s.batchNo || '').trim() === oldEntry.batchNo &&
          (s.expiry || '') === oldEntry.expiry
      );
      const avail = currentStock ? currentStock.qty : 0;
      if (reduction > avail + 0.0001) {
        const it = items.find((i) => i.id === oldEntry.itemId);
        return {
          ok: false,
          message: `Cannot reduce qty by ${reduction} for ${it?.name || 'item'}: only ${avail} left in stock (already sold/transferred).`,
        };
      }
    }
  }

  return { ok: true };
};

export const validateIntakeArrivalSave = (params: {
  lines: IntakeArrivalDraftLine[];
  intake: Intake;
  arrivals: Arrival[];
  editingArrival?: Arrival | null;
  stocks: StockBatch[];
  items: Item[];
  t: (s: string) => string;
}): ArrivalValidationResult => {
  const { lines, intake, arrivals, editingArrival, stocks, items, t } = params;
  const valid = lines.filter((l) => r2(l.qty) > 0.005);
  if (!valid.length) {
    return { ok: false, message: t('Enter at least one arriving quantity') };
  }

  // Sum arriving qty per itemId across all split lot rows and validate against remaining intake capacity
  const perItemTotals = new Map<string, number>();
  for (const l of valid) {
    perItemTotals.set(l.itemId, r2((perItemTotals.get(l.itemId) || 0) + r2(l.qty)));
  }

  for (const [itemId, totalQty] of perItemTotals.entries()) {
    const maxCap = remainingIntakeCapacity(intake, arrivals, itemId, editingArrival?.id);
    if (totalQty > maxCap + 0.000001) {
      const it = items.find((i) => i.id === itemId);
      return {
        ok: false,
        message: `${t('Arriving qty exceeds what is on the way for')} ${it?.name || 'item'} (${totalQty} > ${maxCap})`,
      };
    }
  }

  const normalizedValid: ArrivalLine[] = valid.map((l) => ({
    itemId: l.itemId,
    qty: r2(l.qty),
    cost: r2(l.cost),
    batchNo: (l.batchNo || '').trim(),
    expiry: l.expiry || '',
  }));

  const stockCheck = validateStockReductionOnEdit(editingArrival, normalizedValid, stocks, items);
  if (!stockCheck.ok) {
    return stockCheck;
  }

  return { ok: true, validLines: normalizedValid };
};
