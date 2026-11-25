import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getGlobalTrackingMode,
  getGlobalTrackFlags,
  getItemTrackingSelection,
  resolveItemTracking,
  getLinesTrackingFlags,
  formatStockChoiceLabel,
  formatLineBatchExpirySuffix,
  trackingModeLabel,
} from '../utils/tracking.ts';

describe('Lot & Expiry Independent Tracking Helpers', () => {
  test('getGlobalTrackingMode resolves explicit lotExpiryMode and falls back to legacy trackBatchExpiry', () => {
    assert.equal(getGlobalTrackingMode(undefined), 'both');
    assert.equal(getGlobalTrackingMode({}), 'both');
    assert.equal(getGlobalTrackingMode({ trackBatchExpiry: true }), 'both');
    assert.equal(getGlobalTrackingMode({ trackBatchExpiry: false }), 'none');
    assert.equal(getGlobalTrackingMode({ lotExpiryMode: 'both', trackBatchExpiry: false }), 'none');
    assert.equal(getGlobalTrackingMode({ lotExpiryMode: 'lot', trackBatchExpiry: false }), 'lot');
    assert.equal(getGlobalTrackingMode({ lotExpiryMode: 'expiry', trackBatchExpiry: true }), 'expiry');
    assert.equal(getGlobalTrackingMode({ lotExpiryMode: 'none', trackBatchExpiry: true }), 'none');
    assert.equal(getGlobalTrackingMode({ lotExpiryMode: 'both' }), 'both');
  });

  test('getGlobalTrackFlags maps all 4 tracking modes cleanly', () => {
    assert.deepEqual(getGlobalTrackFlags({ lotExpiryMode: 'both' }), {
      mode: 'both',
      trackLot: true,
      trackExpiry: true,
    });
    assert.deepEqual(getGlobalTrackFlags({ lotExpiryMode: 'lot' }), {
      mode: 'lot',
      trackLot: true,
      trackExpiry: false,
    });
    assert.deepEqual(getGlobalTrackFlags({ lotExpiryMode: 'expiry' }), {
      mode: 'expiry',
      trackLot: false,
      trackExpiry: true,
    });
    assert.deepEqual(getGlobalTrackFlags({ lotExpiryMode: 'none' }), {
      mode: 'none',
      trackLot: false,
      trackExpiry: false,
    });
  });

  test('getItemTrackingSelection treats legacy batch:true/undefined as global and batch:false as none', () => {
    assert.equal(getItemTrackingSelection(undefined), 'global');
    assert.equal(getItemTrackingSelection({ batch: true }), 'global');
    assert.equal(getItemTrackingSelection({ batch: false }), 'none');
    assert.equal(getItemTrackingSelection({ trackingMode: 'lot', batch: true }), 'lot');
    assert.equal(getItemTrackingSelection({ trackingMode: 'expiry', batch: false }), 'expiry');
    assert.equal(getItemTrackingSelection({ trackingMode: 'global', batch: false }), 'global');
  });

  test('resolveItemTracking enforces global master cap and lets global selection inherit', () => {
    // Global = 'both'
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'both' }, { trackingMode: 'global' }), {
      mode: 'both',
      trackLot: true,
      trackExpiry: true,
      selection: 'global',
    });
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'both' }, { trackingMode: 'lot' }), {
      mode: 'lot',
      trackLot: true,
      trackExpiry: false,
      selection: 'lot',
    });
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'both' }, { trackingMode: 'expiry' }), {
      mode: 'expiry',
      trackLot: false,
      trackExpiry: true,
      selection: 'expiry',
    });
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'both' }, { trackingMode: 'none' }), {
      mode: 'none',
      trackLot: false,
      trackExpiry: false,
      selection: 'none',
    });

    // Global = 'lot' caps 'both' -> 'lot', 'expiry' -> 'none'
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'lot' }, { trackingMode: 'global' }), {
      mode: 'lot',
      trackLot: true,
      trackExpiry: false,
      selection: 'global',
    });
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'lot' }, { trackingMode: 'both' }), {
      mode: 'lot',
      trackLot: true,
      trackExpiry: false,
      selection: 'both',
    });
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'lot' }, { trackingMode: 'expiry' }), {
      mode: 'none',
      trackLot: false,
      trackExpiry: false,
      selection: 'expiry',
    });

    // Global = 'expiry' caps 'both' -> 'expiry', 'lot' -> 'none'
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'expiry' }, { trackingMode: 'global' }), {
      mode: 'expiry',
      trackLot: false,
      trackExpiry: true,
      selection: 'global',
    });
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'expiry' }, { trackingMode: 'lot' }), {
      mode: 'none',
      trackLot: false,
      trackExpiry: false,
      selection: 'lot',
    });

    // Global = 'none' disables everything regardless of item override
    assert.deepEqual(resolveItemTracking({ lotExpiryMode: 'none' }, { trackingMode: 'both' }), {
      mode: 'none',
      trackLot: false,
      trackExpiry: false,
      selection: 'both',
    });
  });

  test('getLinesTrackingFlags resolves table column visibility for unpicked, mixed, and untracked rows', () => {
    const items = [
      { id: 'i-both', batch: true, trackingMode: 'both' as const },
      { id: 'i-lot', batch: true, trackingMode: 'lot' as const },
      { id: 'i-exp', batch: true, trackingMode: 'expiry' as const },
      { id: 'i-none', batch: false, trackingMode: 'none' as const },
    ];

    // No items picked yet -> inherits global settings
    assert.deepEqual(getLinesTrackingFlags({ lotExpiryMode: 'both' }, items, ['']), {
      showLotCol: true,
      showExpiryCol: true,
    });
    assert.deepEqual(getLinesTrackingFlags({ lotExpiryMode: 'lot' }, items, ['']), {
      showLotCol: true,
      showExpiryCol: false,
    });

    // Only untracked item picked -> hides both columns
    assert.deepEqual(getLinesTrackingFlags({ lotExpiryMode: 'both' }, items, ['i-none']), {
      showLotCol: false,
      showExpiryCol: false,
    });

    // Mixed lot-only + none -> shows only Lot column
    assert.deepEqual(getLinesTrackingFlags({ lotExpiryMode: 'both' }, items, ['i-lot', 'i-none']), {
      showLotCol: true,
      showExpiryCol: false,
    });

    // Mixed lot-only + expiry-only -> shows both columns globally when global allows both
    assert.deepEqual(getLinesTrackingFlags({ lotExpiryMode: 'both' }, items, ['i-lot', 'i-exp']), {
      showLotCol: true,
      showExpiryCol: true,
    });

    // Mixed lot-only + expiry-only capped when global is expiry-only
    assert.deepEqual(getLinesTrackingFlags({ lotExpiryMode: 'expiry' }, items, ['i-lot', 'i-exp']), {
      showLotCol: false,
      showExpiryCol: true,
    });
  });

  test('formatStockChoiceLabel and formatLineBatchExpirySuffix format independently by resolved mode', () => {
    const fmtDate = (d?: string) => (d ? `FMT(${d})` : '—');
    const stock = { batchNo: 'LOT-42', expiry: '2027-06-01', qty: 12 };

    assert.equal(
      formatStockChoiceLabel(stock, { trackingMode: 'both' }, { lotExpiryMode: 'both' }, fmtDate, 'avail'),
      'LOT-42 • exp FMT(2027-06-01) (12 avail)'
    );
    assert.equal(
      formatStockChoiceLabel(stock, { trackingMode: 'lot' }, { lotExpiryMode: 'both' }, fmtDate, 'avail'),
      'LOT-42 (12 avail)'
    );
    assert.equal(
      formatStockChoiceLabel(stock, { trackingMode: 'expiry' }, { lotExpiryMode: 'both' }, fmtDate, 'avail'),
      'exp FMT(2027-06-01) (12 avail)'
    );
    assert.equal(
      formatStockChoiceLabel(stock, { trackingMode: 'none' }, { lotExpiryMode: 'both' }, fmtDate, 'avail'),
      '12 avail'
    );

    assert.equal(
      formatLineBatchExpirySuffix('LOT-42', '2027-06-01', { trackingMode: 'lot' }, { lotExpiryMode: 'both' }, fmtDate),
      ' [LOT-42]'
    );
    assert.equal(
      formatLineBatchExpirySuffix('LOT-42', '2027-06-01', { trackingMode: 'expiry' }, { lotExpiryMode: 'both' }, fmtDate),
      ' exp FMT(2027-06-01)'
    );
    assert.equal(
      formatLineBatchExpirySuffix('LOT-42', '2027-06-01', { trackingMode: 'none' }, { lotExpiryMode: 'both' }, fmtDate),
      ''
    );

    assert.equal(trackingModeLabel('both'), 'Lot & Expiry Date');
    assert.equal(trackingModeLabel('lot'), 'Lot / Batch only');
    assert.equal(trackingModeLabel('expiry'), 'Expiry Date only');
    assert.equal(trackingModeLabel('none'), 'None (Quantity only)');
  });
});
