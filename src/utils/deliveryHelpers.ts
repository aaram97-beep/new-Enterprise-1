import type { Item, StockBatch } from '../types';
import { r2, toIsoDate } from './formatters';

export interface DeliveryBatchGroup {
  item: Item;
  batches: StockBatch[];
}

export interface DeliveryDraftLine {
  itemId: string;
  stockId: string;
  qty: number;
}

export interface DeliverySourceItemOption {
  id: string;
  label: string;
  sub: string;
  code: string;
}

export const sortDeliveryBatches = (
  list: StockBatch[],
  prioritizeFurtherExpiry?: boolean
): StockBatch[] =>
  list.slice().sort((a, b) => {
    const expA = toIsoDate(a.expiry);
    const expB = toIsoDate(b.expiry);
    return prioritizeFurtherExpiry
      ? expB.localeCompare(expA)
      : (expA || '9999-12-31').localeCompare(expB || '9999-12-31');
  });

export const getBatchesForDeliveryItem = ({
  branchId,
  itemId,
  stocks,
  selectedStockId,
  prioritizeFurtherExpiry,
}: {
  branchId: string;
  itemId: string;
  stocks: StockBatch[];
  selectedStockId?: string;
  prioritizeFurtherExpiry?: boolean;
}): StockBatch[] => {
  if (!itemId) return [];
  return sortDeliveryBatches(
    stocks.filter(
      (s) =>
        s.branchId === branchId &&
        s.itemId === itemId &&
        (s.qty > 0.005 || (Boolean(selectedStockId) && s.id === selectedStockId))
    ),
    prioritizeFurtherExpiry
  );
};

export const buildDeliverySourceItemOptions = ({
  sourceItemIds,
  branchId,
  stocks,
  items,
  remainingByItem,
  labels,
}: {
  sourceItemIds: (string | null | undefined)[];
  branchId: string;
  stocks: StockBatch[];
  items: Item[];
  remainingByItem: Record<string, number>;
  labels?: { rem?: string; stock?: string };
}): DeliverySourceItemOption[] => {
  const uniqueIds = Array.from(new Set(sourceItemIds.filter((id): id is string => Boolean(id))));
  const remLbl = labels?.rem || 'Rem';
  const stockLbl = labels?.stock || 'Stock';

  const resolved = uniqueIds
    .map((id) => items.find((i) => i.id === id))
    .filter((it): it is Item => Boolean(it));

  // Put items that still have remaining unfulfilled qty first, keeping relative order
  resolved.sort((a, b) => {
    const remA = remainingByItem[a.id] ?? 0;
    const remB = remainingByItem[b.id] ?? 0;
    if (remA > 0.005 && remB <= 0.005) return -1;
    if (remB > 0.005 && remA <= 0.005) return 1;
    return 0;
  });

  return resolved.map((it) => {
    const branchStock = r2(
      stocks
        .filter((s) => s.branchId === branchId && s.itemId === it.id)
        .reduce((sum, s) => sum + (+s.qty || 0), 0)
    );
    const rem = Math.max(0, r2(remainingByItem[it.id] ?? 0));
    return {
      id: it.id,
      label: it.name,
      sub: `${it.sku ? `${it.sku} • ` : ''}${remLbl}: ${rem} • ${stockLbl}: ${branchStock}`,
      code: it.barcode || it.sku || '',
    };
  });
};

export const pickDeliveryItemForLine = ({
  lines,
  index,
  itemId,
  branchId,
  stocks,
  prioritizeFurtherExpiry,
  balanceBeforeByItem,
}: {
  lines: DeliveryDraftLine[];
  index: number;
  itemId: string;
  branchId: string;
  stocks: StockBatch[];
  prioritizeFurtherExpiry?: boolean;
  balanceBeforeByItem: Record<string, number>;
}): DeliveryDraftLine[] => {
  const usedStockIds = new Set(
    lines
      .filter((l, i) => i !== index && l.itemId === itemId && l.stockId)
      .map((l) => l.stockId)
  );
  const batches = getBatchesForDeliveryItem({
    branchId,
    itemId,
    stocks,
    prioritizeFurtherExpiry,
  });
  const preferredBatch = batches.find((b) => !usedStockIds.has(b.id) && b.qty > 0.005) || batches[0];

  const otherAllocated = r2(
    lines.reduce((sum, l, i) => (i !== index && l.itemId === itemId ? sum + (+l.qty || 0) : sum), 0)
  );
  const remLeft = Math.max(0, r2((balanceBeforeByItem[itemId] ?? 0) - otherAllocated));
  const currentQty = lines[index]?.qty || 0;
  let nextQty = currentQty;
  if (currentQty <= 0 || lines[index]?.itemId !== itemId) {
    if (remLeft > 0.005) {
      nextQty = preferredBatch && preferredBatch.qty > 0.005 ? r2(Math.min(remLeft, preferredBatch.qty)) : remLeft;
    } else {
      nextQty = 0;
    }
  }

  const updated = [...lines];
  updated[index] = {
    itemId,
    stockId: preferredBatch ? preferredBatch.id : '',
    qty: nextQty,
  };
  return updated;
};

export const splitDeliveryBatchLine = ({
  lines,
  index,
  branchId,
  stocks,
  prioritizeFurtherExpiry,
  balanceBeforeByItem,
  extraAvailByStock,
}: {
  lines: DeliveryDraftLine[];
  index: number;
  branchId: string;
  stocks: StockBatch[];
  prioritizeFurtherExpiry?: boolean;
  balanceBeforeByItem: Record<string, number>;
  extraAvailByStock?: Record<string, number>;
}): DeliveryDraftLine[] => {
  const row = lines[index];
  if (!row) return lines;
  const stockFromRow = row.stockId ? stocks.find((s) => s.id === row.stockId) : undefined;
  const itemId = row.itemId || stockFromRow?.itemId || '';
  if (!itemId) return lines;

  const batches = getBatchesForDeliveryItem({
    branchId,
    itemId,
    stocks,
    prioritizeFurtherExpiry,
  });
  const usedStockIds = new Set(
    lines
      .filter((l) => l.itemId === itemId && l.stockId)
      .map((l) => l.stockId)
  );
  const nextBatch =
    batches.find((b) => !usedStockIds.has(b.id) && b.qty > 0.005) ||
    batches.find((b) => b.id !== row.stockId && b.qty > 0.005);

  const currentBatchAvail = stockFromRow
    ? r2((+stockFromRow.qty || 0) + (extraAvailByStock?.[stockFromRow.id] || 0))
    : 0;

  const totalAllocatedForItem = r2(
    lines.reduce((sum, l) => (l.itemId === itemId ? sum + (+l.qty || 0) : sum), 0)
  );
  const balanceBefore = balanceBeforeByItem[itemId] ?? 0;

  const nextLines = [...lines];
  let newQty = 0;

  if (stockFromRow && row.qty > currentBatchAvail + 0.005 && currentBatchAvail > 0.005) {
    // Auto-clamp over-allocated batch row to its available qty and push remainder to next lot
    const excess = r2(row.qty - currentBatchAvail);
    nextLines[index] = { ...row, itemId, qty: currentBatchAvail };
    const unallocated = Math.max(0, r2(balanceBefore - (totalAllocatedForItem - excess)));
    newQty = unallocated > 0.005 ? r2(Math.min(excess, unallocated)) : excess;
  } else {
    const rem = Math.max(0, r2(balanceBefore - totalAllocatedForItem));
    if (rem > 0.005) {
      newQty = nextBatch && nextBatch.qty > 0.005 ? r2(Math.min(rem, nextBatch.qty)) : rem;
    } else {
      newQty = 0;
    }
  }

  nextLines.splice(index + 1, 0, {
    itemId,
    stockId: nextBatch ? nextBatch.id : '',
    qty: newQty,
  });
  return nextLines;
};

export const getDeliveryBatchGroups = ({
  branchId,
  sourceItemIds,
  stocks,
  items,
  selectedStockId,
  prioritizeFurtherExpiry,
}: {
  branchId: string;
  sourceItemIds: (string | null | undefined)[];
  stocks: StockBatch[];
  items: Item[];
  selectedStockId?: string;
  prioritizeFurtherExpiry?: boolean;
}): DeliveryBatchGroup[] => {
  const selectedStock = selectedStockId ? stocks.find((s) => s.id === selectedStockId) : undefined;
  const cleanSourceIds = sourceItemIds.filter((id): id is string => Boolean(id));
  if (selectedStock && cleanSourceIds.length > 0 && !cleanSourceIds.includes(selectedStock.itemId)) {
    cleanSourceIds.push(selectedStock.itemId);
  }

  const allowedIds =
    cleanSourceIds.length > 0
      ? Array.from(new Set(cleanSourceIds))
      : Array.from(
          new Set(
            stocks
              .filter((s) => s.branchId === branchId && (s.qty > 0.005 || s.id === selectedStockId))
              .map((s) => s.itemId)
          )
        );

  const groups: DeliveryBatchGroup[] = [];
  for (const itemId of allowedIds) {
    const item = items.find((i) => i.id === itemId);
    if (!item) continue;
    const batches = getBatchesForDeliveryItem({
      branchId,
      itemId,
      stocks,
      selectedStockId,
      prioritizeFurtherExpiry,
    });
    if (batches.length > 0) {
      groups.push({ item, batches });
    }
  }

  return groups;
};

export const hasAnyAvailableDeliveryBatch = ({
  branchId,
  sourceItemIds,
  stocks,
}: {
  branchId: string;
  sourceItemIds: (string | null | undefined)[];
  stocks: StockBatch[];
}): boolean => {
  const cleanSourceIds = Array.from(new Set(sourceItemIds.filter((id): id is string => Boolean(id))));
  if (cleanSourceIds.length > 0) {
    return stocks.some((s) => s.branchId === branchId && cleanSourceIds.includes(s.itemId) && s.qty > 0.005);
  }
  return stocks.some((s) => s.branchId === branchId && s.qty > 0.005);
};

export const appendBlankDeliveryLine = (
  lines: DeliveryDraftLine[],
  defaultQty = 0
): DeliveryDraftLine[] => {
  return [...lines, { itemId: '', stockId: '', qty: defaultQty }];
};
