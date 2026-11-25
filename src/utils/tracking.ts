import type { Item, ItemTrackingMode, Settings, StockBatch, TrackingMode } from '../types';

export interface TrackingResolution {
  mode: TrackingMode;
  trackLot: boolean;
  trackExpiry: boolean;
  selection: ItemTrackingMode;
}

const VALID_MODES = new Set<TrackingMode>(['both', 'lot', 'expiry', 'none']);
const VALID_ITEM_MODES = new Set<ItemTrackingMode>(['global', 'both', 'lot', 'expiry', 'none']);

export const getGlobalTrackingMode = (
  settings?: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null
): TrackingMode => {
  if (
    settings?.trackBatchExpiry === false &&
    (!settings.lotExpiryMode || settings.lotExpiryMode === 'both')
  ) {
    return 'none';
  }
  if (settings?.lotExpiryMode && VALID_MODES.has(settings.lotExpiryMode)) {
    return settings.lotExpiryMode;
  }
  if (settings?.trackBatchExpiry === false) {
    return 'none';
  }
  return 'both';
};

export const modeToFlags = (
  mode: TrackingMode
): { mode: TrackingMode; trackLot: boolean; trackExpiry: boolean } => {
  switch (mode) {
    case 'lot':
      return { mode: 'lot', trackLot: true, trackExpiry: false };
    case 'expiry':
      return { mode: 'expiry', trackLot: false, trackExpiry: true };
    case 'none':
      return { mode: 'none', trackLot: false, trackExpiry: false };
    case 'both':
    default:
      return { mode: 'both', trackLot: true, trackExpiry: true };
  }
};

export const getGlobalTrackFlags = (
  settings?: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null
): { mode: TrackingMode; trackLot: boolean; trackExpiry: boolean } =>
  modeToFlags(getGlobalTrackingMode(settings));

export type ItemTrackingInput = {
  batch?: boolean;
  trackingMode?: ItemTrackingMode;
};

export const getItemTrackingSelection = (
  item?: ItemTrackingInput | null
): ItemTrackingMode => {
  if (item?.trackingMode && VALID_ITEM_MODES.has(item.trackingMode)) {
    return item.trackingMode;
  }
  if (item && item.batch === false) {
    return 'none';
  }
  return 'global';
};

export const resolveItemTracking = (
  settings?: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null,
  item?: ItemTrackingInput | null
): TrackingResolution => {
  const globalFlags = getGlobalTrackFlags(settings);
  const selection = getItemTrackingSelection(item);

  if (!item || selection === 'global') {
    return {
      ...globalFlags,
      selection,
    };
  }

  const itemFlags = modeToFlags(selection);
  const trackLot = globalFlags.trackLot && itemFlags.trackLot;
  const trackExpiry = globalFlags.trackExpiry && itemFlags.trackExpiry;
  const mode: TrackingMode =
    trackLot && trackExpiry ? 'both' : trackLot ? 'lot' : trackExpiry ? 'expiry' : 'none';

  return {
    mode,
    trackLot,
    trackExpiry,
    selection,
  };
};

export const getLinesTrackingFlags = (
  settings: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null | undefined,
  items: (ItemTrackingInput & { id: string })[],
  itemIds: (string | null | undefined)[]
): { showLotCol: boolean; showExpiryCol: boolean } => {
  const globalFlags = getGlobalTrackFlags(settings);
  const pickedIds = itemIds.filter((id): id is string => Boolean(id));
  if (pickedIds.length === 0) {
    return {
      showLotCol: globalFlags.trackLot,
      showExpiryCol: globalFlags.trackExpiry,
    };
  }

  let showLotCol = false;
  let showExpiryCol = false;
  for (const id of pickedIds) {
    const it = items.find((i) => i.id === id);
    const res = resolveItemTracking(settings, it);
    if (res.trackLot) showLotCol = true;
    if (res.trackExpiry) showExpiryCol = true;
  }

  return { showLotCol, showExpiryCol };
};

export const formatStockChoiceLabel = (
  stock: Pick<StockBatch, 'batchNo' | 'expiry' | 'qty'>,
  item: ItemTrackingInput | null | undefined,
  settings: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null | undefined,
  fmtDate: (d?: string) => string,
  availLabel = 'avail'
): string => {
  const { trackLot, trackExpiry } = resolveItemTracking(settings, item);
  const parts: string[] = [];
  if (trackLot) parts.push(stock.batchNo || 'no-batch');
  if (trackExpiry) parts.push(`exp ${stock.expiry ? fmtDate(stock.expiry) : '—'}`);
  const qtyText = `${stock.qty} ${availLabel}`.trim();
  return parts.length > 0 ? `${parts.join(' • ')} (${qtyText})` : qtyText;
};

export const formatLineBatchExpirySuffix = (
  batchNo: string | undefined,
  expiry: string | undefined,
  item: ItemTrackingInput | null | undefined,
  settings: Pick<Settings, 'lotExpiryMode' | 'trackBatchExpiry'> | null | undefined,
  fmtDate: (d?: string) => string
): string => {
  const { trackLot, trackExpiry } = resolveItemTracking(settings, item);
  let out = '';
  if (trackLot && batchNo) out += ` [${batchNo}]`;
  if (trackExpiry && expiry) out += ` exp ${fmtDate(expiry)}`;
  return out;
};

export const trackingModeLabel = (mode: TrackingMode): string => {
  switch (mode) {
    case 'lot':
      return 'Lot / Batch only';
    case 'expiry':
      return 'Expiry Date only';
    case 'none':
      return 'None (Quantity only)';
    case 'both':
    default:
      return 'Lot & Expiry Date';
  }
};
