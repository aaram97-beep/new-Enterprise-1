import type {
  Delivery,
  DeliveryLine,
  Invoice,
  InvoiceLine,
  Item,
  Settings,
  StockBatch,
} from '../types';
import { r2, toIsoDate, uid } from './formatters';
import { resolveItemTracking } from './tracking';

/**
 * Finds a stock batch matching item, branch, batchNo, and expiry.
 * When batchNo and expiry are empty, still matches unbatched rows cleanly.
 */
const findMatchingBatch = (
  stocks: StockBatch[],
  itemId: string,
  branchId: string,
  batchNo: string | undefined,
  expiry: string | undefined
): StockBatch | undefined =>
  stocks.find(
    (s) =>
      s.itemId === itemId &&
      s.branchId === branchId &&
      (s.batchNo || '') === (batchNo || '') &&
      (s.expiry || '') === (expiry || '')
  );

/**
 * Restores any stock previously deducted for `invoiceId` (via linked deliveries)
 * onto a fresh copy of `stocks`. Used both when opening InvoiceModal in Edit mode
 * (so depleted batches still appear in dropdowns with their restored quantities)
 * and when re-applying stock deductions on save.
 */
export const buildVirtualStocksForInvoiceEdit = (
  stocks: StockBatch[],
  deliveries: Delivery[],
  invoiceId?: string | null
): StockBatch[] => {
  const cloned = stocks.map((s) => ({ ...s }));
  if (!invoiceId) return cloned;

  const existingDels = (deliveries || []).filter((d) => d.invoiceId === invoiceId);
  existingDels.forEach((d) => {
    (d.lines || []).forEach((l) => {
      if (!l.itemId || r2(l.qty) <= 0) return;
      const existing = findMatchingBatch(cloned, l.itemId, d.branchId, l.batchNo, l.expiry);
      if (existing) {
        existing.qty = r2((+existing.qty || 0) + r2(l.qty));
      } else {
        cloned.push({
          id: `restored-${invoiceId}-${l.itemId}-${l.batchNo || ''}-${l.expiry || ''}`,
          itemId: l.itemId,
          branchId: d.branchId,
          batchNo: l.batchNo || '',
          expiry: l.expiry || '',
          qty: r2(l.qty),
          cost: r2(l.cost || 0),
        });
      }
    });
  });

  return cloned;
};

/**
 * Computes branch stock quantities per stockId previously deducted for `invoiceId`.
 */
export const getRestoredQtyByStockId = (
  virtualStocks: StockBatch[],
  deliveries: Delivery[],
  invoiceId?: string | null
): Record<string, number> => {
  const byStock: Record<string, number> = {};
  if (!invoiceId) return byStock;

  (deliveries || [])
    .filter((d) => d.invoiceId === invoiceId)
    .forEach((d) => {
      (d.lines || []).forEach((l) => {
        if (!l.itemId || r2(l.qty) <= 0) return;
        const match = findMatchingBatch(virtualStocks, l.itemId, d.branchId, l.batchNo, l.expiry);
        if (match) {
          byStock[match.id] = r2((byStock[match.id] || 0) + r2(l.qty));
        }
      });
    });

  return byStock;
};

/**
 * Resolves FEFO-sorted available batches in `branchId` for an item.
 */
export const getDirectSaleBatchesForItem = (
  virtualStocks: StockBatch[],
  branchId: string,
  itemId: string | null | undefined,
  selectedStockId?: string
): StockBatch[] => {
  if (!itemId) return [];
  return virtualStocks
    .filter(
      (s) =>
        s.branchId === branchId &&
        s.itemId === itemId &&
        (s.qty > 0.0049 || (Boolean(selectedStockId) && s.id === selectedStockId))
    )
    .slice()
    .sort((a, b) =>
      (toIsoDate(a.expiry) || '9999-12-31').localeCompare(toIsoDate(b.expiry) || '9999-12-31')
    );
};

/**
 * Resolves the initial `stockId` to display on an InvoiceLine when editing or picking an item.
 */
export const resolveInitialStockIdForInvoiceLine = ({
  line,
  branchId,
  virtualStocks,
  settings,
  item,
}: {
  line: InvoiceLine;
  branchId: string;
  virtualStocks: StockBatch[];
  settings?: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null;
  item?: Item | null;
}): string => {
  if (!line.itemId) return '';
  const track = resolveItemTracking(settings, item);
  if (track.mode === 'none') return '';

  if (line.stockId) {
    const exact = virtualStocks.find(
      (s) => s.id === line.stockId && s.itemId === line.itemId && s.branchId === branchId
    );
    if (exact) return exact.id;
  }

  if (line.batchNo !== undefined || line.expiry !== undefined) {
    const byMeta = findMatchingBatch(
      virtualStocks,
      line.itemId,
      branchId,
      line.batchNo,
      line.expiry
    );
    if (byMeta) return byMeta.id;
  }

  const batches = getDirectSaleBatchesForItem(virtualStocks, branchId, line.itemId);
  return batches.length > 0 ? batches[0].id : '';
};

export type DirectSaleProcessResult =
  | {
      ok: true;
      stocks: StockBatch[];
      deliveries: Delivery[];
      normalizedInvoice: Invoice;
    }
  | {
      ok: false;
      error: string;
    };

/**
 * Atomically validates and applies direct-sale stock deduction for an invoice:
 *  1. Restores any previously deducted stock for `inv.id` (clean edit support)
 *  2. For tracked items (mode !== 'none'), deducts from the explicitly chosen batch (`line.stockId` or batch/expiry metadata)
 *  3. For untracked items (mode === 'none'), auto-deducts across branch batches FEFO with zero extra fields required
 *  4. Maintains a synced internal `Delivery` record linked to `inv.id` so COGS, Item Movement Card, Valuation, and `deleteInvoice` remain 100% consistent.
 */
export const processDirectSaleInvoiceStock = ({
  settings,
  items,
  stocks,
  deliveries,
  inv,
  deliveryNo,
}: {
  settings: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'>;
  items: Item[];
  stocks: StockBatch[];
  deliveries: Delivery[];
  inv: Invoice;
  deliveryNo: string;
}): DirectSaleProcessResult => {
  const workingStocks = buildVirtualStocksForInvoiceEdit(stocks, deliveries, inv.id);
  // Give restored synthetic IDs real UUIDs if they remain positive at the end
  const existingDels = (deliveries || []).filter((d) => d.invoiceId === inv.id);
  const remainingDeliveries = (deliveries || []).filter((d) => d.invoiceId !== inv.id);

  const deliveryLines: DeliveryLine[] = [];
  const normalizedLines: InvoiceLine[] = [];

  for (const line of inv.lines) {
    if (!line.itemId || r2(line.qty) <= 0) continue;
    const reqQty = r2(line.qty);
    const itemObj = items.find((i) => i.id === line.itemId);
    const itemLabel = itemObj?.name || 'item';
    const track = resolveItemTracking(settings, itemObj);

    if (track.mode !== 'none') {
      // Explicit batch selection required when Lot or Expiry is tracked
      let batch: StockBatch | undefined;
      if (line.stockId) {
        batch = workingStocks.find(
          (s) => s.id === line.stockId && s.itemId === line.itemId && s.branchId === inv.branchId
        );
      }
      if (!batch && (line.batchNo !== undefined || line.expiry !== undefined)) {
        batch = findMatchingBatch(
          workingStocks,
          line.itemId,
          inv.branchId,
          line.batchNo,
          line.expiry
        );
      }
      if (!batch) {
        return {
          ok: false,
          error: `Please select a batch for ${itemLabel}`,
        };
      }
      if ((+batch.qty || 0) + 0.000001 < reqQty) {
        return {
          ok: false,
          error: `Insufficient stock in batch ${batch.batchNo || '(no batch)'} for ${itemLabel} (available ${r2(batch.qty)})`,
        };
      }

      batch.qty = r2((+batch.qty || 0) - reqQty);
      deliveryLines.push({
        itemId: line.itemId,
        qty: reqQty,
        batchNo: batch.batchNo || '',
        expiry: batch.expiry || '',
        cost: r2(batch.cost ?? itemObj?.cost ?? 0),
      });
      normalizedLines.push({
        itemId: line.itemId,
        qty: reqQty,
        price: r2(line.price),
        discType: line.discType,
        discVal: r2(line.discVal),
        stockId: batch.id.startsWith('restored-') ? undefined : batch.id,
        batchNo: batch.batchNo || '',
        expiry: batch.expiry || '',
        cost: r2(batch.cost ?? itemObj?.cost ?? 0),
      });
    } else {
      // Lot & Expiry Disabled: auto-deduct FEFO with zero extra fields required on invoice
      let left = reqQty;
      const pool = workingStocks
        .filter((s) => s.itemId === line.itemId && s.branchId === inv.branchId && s.qty > 0.0049)
        .slice()
        .sort((a, b) =>
          (toIsoDate(a.expiry) || '9999-12-31').localeCompare(toIsoDate(b.expiry) || '9999-12-31')
        );

      for (const s of pool) {
        if (left <= 0.0049) break;
        const take = r2(Math.min(s.qty, left));
        s.qty = r2(s.qty - take);
        left = r2(left - take);
        deliveryLines.push({
          itemId: line.itemId,
          qty: take,
          batchNo: s.batchNo || '',
          expiry: s.expiry || '',
          cost: r2(s.cost ?? itemObj?.cost ?? 0),
        });
      }

      if (left > 0.0049) {
        const totalAvail = r2(
          workingStocks
            .filter((s) => s.itemId === line.itemId && s.branchId === inv.branchId)
            .reduce((sum, s) => sum + (+s.qty || 0), 0)
        );
        return {
          ok: false,
          error: `Insufficient stock of ${itemLabel} (available ${totalAvail})`,
        };
      }

      normalizedLines.push({
        itemId: line.itemId,
        qty: reqQty,
        price: r2(line.price),
        discType: line.discType,
        discVal: r2(line.discVal),
      });
    }
  }

  const finalStocks = workingStocks
    .filter((s) => s.qty > 0.0049)
    .map((s) => (s.id.startsWith('restored-') ? { ...s, id: uid() } : s));

  const syncedDelivery: Delivery = {
    id: existingDels[0]?.id || uid(),
    no: existingDels[0]?.no || deliveryNo || inv.no,
    date: inv.date,
    invoiceId: inv.id,
    returnSlipId: '',
    customerId: inv.customerId,
    branchId: inv.branchId,
    note: inv.note || 'Direct sale',
    lines: deliveryLines,
  };

  return {
    ok: true,
    stocks: finalStocks,
    deliveries: [...remainingDeliveries, syncedDelivery],
    normalizedInvoice: {
      ...inv,
      lines: normalizedLines,
    },
  };
};
