import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasPerm,
  canDelete,
  canEdit,
  canAdjustInventory,
  canViewReport,
  canViewCost,
  canViewCompanyWorth,
  maskCost,
  maskWorth,
  hasSectionAccess,
  isPermKeyVisible,
  DELETE_PERM_KEYS,
  EDIT_PERM_KEYS,
} from '../utils/permissions';
import type { User } from '../types';

const adminUser: User = {
  id: 'u1',
  name: 'Admin Boss',
  username: 'admin',
  pass: 'admin123',
  role: 'admin',
  branchIds: ['b1'],
  active: true,
  perms: {},
};

const cashierUser: User = {
  id: 'u2',
  name: 'Sales Cashier',
  username: 'cashier',
  pass: 'pass123',
  role: 'user',
  branchIds: ['b1'],
  active: true,
  perms: {
    sales: true,
    delete_invoices: true,
    // delete_payments is intentionally omitted/false
    delete_payments: false,
    edit_invoices: true,
    edit_payments: false,
    reports: true,
    report_aging: true,
    report_valuation: false,
    report_balance: false,
    view_buying_cost: false,
    view_company_worth: false,
  },
};

const accountantUser: User = {
  id: 'u3',
  name: 'Head Accountant',
  username: 'accountant',
  pass: 'pass456',
  role: 'user',
  branchIds: ['b1'],
  active: true,
  perms: {
    sales: true,
    ledger: true,
    reports: true,
    delete_invoices: false,
    delete_payments: true,
    edit_invoices: false,
    edit_payments: true,
    report_balance: true,
    report_valuation: true,
    view_buying_cost: true,
    view_company_worth: true,
  },
};

test('RBAC: Admin has absolute access to all actions and views', () => {
  assert.equal(canDelete(adminUser, 'invoices'), true);
  assert.equal(canDelete(adminUser, 'payments'), true);
  assert.equal(canEdit(adminUser, 'invoices'), true);
  assert.equal(canEdit(adminUser, 'payments'), true);
  assert.equal(canViewReport(adminUser, 'valuation'), true);
  assert.equal(canViewReport(adminUser, 'balance'), true);
  assert.equal(canViewCost(adminUser), true);
  assert.equal(canViewCompanyWorth(adminUser), true);
  assert.equal(maskCost(120.5, adminUser, 'IQD'), '120.50 IQD');
  assert.equal(maskWorth(50000, adminUser, 'IQD'), '50,000.00 IQD');
});

test('RBAC: Granular Delete Permissions distinguish invoice vs payment deletion', () => {
  // Cashier has delete_invoices: true, but delete_payments: false
  assert.equal(canDelete(cashierUser, 'invoices'), true);
  assert.equal(canDelete(cashierUser, 'payments'), false);
  assert.equal(canDelete(cashierUser, 'inventory'), false);

  // Accountant has delete_invoices: false, but delete_payments: true
  assert.equal(canDelete(accountantUser, 'invoices'), false);
  assert.equal(canDelete(accountantUser, 'payments'), true);
});

test('RBAC: Granular Edit Permissions distinguish invoice vs payment editing', () => {
  assert.equal(canEdit(cashierUser, 'invoices'), true);
  assert.equal(canEdit(cashierUser, 'payments'), false);
  assert.equal(canEdit(accountantUser, 'invoices'), false);
  assert.equal(canEdit(accountantUser, 'payments'), true);
});

test('RBAC: Inventory Adjust permission is independent of editing inventory items', () => {
  const itemEditorOnly: User = {
    id: 'u-item-edit',
    name: 'Catalog Clerk',
    username: 'catalog',
    pass: 'pass123',
    role: 'user',
    branchIds: ['b1'],
    active: true,
    perms: {
      inventory: true,
      edit_inventory: true,
      adjust_inventory: false,
    },
  };
  const stockAdjusterOnly: User = {
    id: 'u-stock-adj',
    name: 'Stock Auditor',
    username: 'auditor',
    pass: 'pass123',
    role: 'user',
    branchIds: ['b1'],
    active: true,
    perms: {
      inventory: true,
      edit_inventory: false,
      adjust_inventory: true,
    },
  };

  assert.equal(canAdjustInventory(adminUser), true);
  assert.equal(canEdit(itemEditorOnly, 'inventory'), true);
  assert.equal(canAdjustInventory(itemEditorOnly), false);
  assert.equal(canEdit(stockAdjusterOnly, 'inventory'), false);
  assert.equal(canAdjustInventory(stockAdjusterOnly), true);
  assert.equal(canAdjustInventory(null), false);
});

test('RBAC: Report-specific visibility rules', () => {
  // Cashier can view aging, but not valuation or balance sheet
  assert.equal(canViewReport(cashierUser, 'aging'), true);
  assert.equal(canViewReport(cashierUser, 'valuation'), false);
  assert.equal(canViewReport(cashierUser, 'balance'), false);

  // Accountant can view balance and valuation
  assert.equal(canViewReport(accountantUser, 'valuation'), true);
  assert.equal(canViewReport(accountantUser, 'balance'), true);
});

test('RBAC: Protection of Item Buying Cost Prices', () => {
  // Cashier cannot view buying cost prices
  assert.equal(canViewCost(cashierUser), false);
  assert.equal(maskCost(45.5, cashierUser), '***');
  assert.equal(maskCost(100, cashierUser, 'IQD'), '***');

  // Accountant can view buying cost prices
  assert.equal(canViewCost(accountantUser), true);
  assert.equal(maskCost(45.5, accountantUser), '45.50');
  assert.equal(maskCost(100, accountantUser, 'IQD'), '100.00 IQD');
});

test('RBAC: Protection of Company Worth and Financial Assets', () => {
  // Cashier cannot view company worth
  assert.equal(canViewCompanyWorth(cashierUser), false);
  assert.equal(maskWorth(250000, cashierUser), '*** (Restricted)');

  // Accountant can view company worth
  assert.equal(canViewCompanyWorth(accountantUser), true);
  assert.equal(maskWorth(250000, accountantUser, 'IQD'), '250,000.00 IQD');
});

test('RBAC: Branch Company Mode delegates cost and profit while Normal Mode is unaffected', () => {
  // In Normal Mode (isBranchCompany = false or undefined), admin and accountant have full access
  assert.equal(canViewCost(adminUser, false), true);
  assert.equal(canViewCost(accountantUser, false), true);
  assert.equal(canViewCompanyWorth(adminUser, false), true);
  assert.equal(canViewCompanyWorth(accountantUser, false), true);
  assert.equal(maskCost(50, adminUser, 'USD', false), '50.00 USD');
  assert.equal(maskWorth(10000, adminUser, 'USD', '*** (Restricted)', false), '10,000.00 USD');

  // In Branch Company Mode (isBranchCompany = true), cost and profit views are turned off
  assert.equal(canViewCost(adminUser, true), false);
  assert.equal(canViewCost(accountantUser, true), false);
  assert.equal(canViewCost(cashierUser, true), false);
  assert.equal(canViewCompanyWorth(adminUser, true), false);
  assert.equal(canViewCompanyWorth(accountantUser, true), false);
  assert.equal(maskCost(50, adminUser, 'USD', true), '***');
  assert.equal(maskWorth(10000, adminUser, 'USD', '*** (Restricted)', true), '*** (Managed Centrally)');
});

test('RBAC: hasSectionAccess enforces both global features and user section permissions', () => {
  const allOn = {
    sales: true,
    purchasing: true,
    paybook: true,
    money: true,
    ledger: true,
    barter: true,
    checks: true,
    inventory: true,
    transfers: true,
    disposals: true,
    customers: true,
    reports: true,
    accounting: true,
  };

  // Cashier has sales + reports (aging only), no checks/barter/transfers/disposals/purchasing/ledger
  assert.equal(hasSectionAccess(cashierUser, allOn, 'sales'), true);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'invoices'), true);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'checks'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'barter'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'transfers'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'disposals'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'purchasing'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'money'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'paybook'), false);
  assert.equal(hasSectionAccess(cashierUser, allOn, 'accounting'), false);

  // Accountant has ledger: true -> gains money, paybook, ledger; no checks -> false
  assert.equal(hasSectionAccess(accountantUser, allOn, 'money'), true);
  assert.equal(hasSectionAccess(accountantUser, allOn, 'paybook'), true);
  assert.equal(hasSectionAccess(accountantUser, allOn, 'ledger'), true);
  assert.equal(hasSectionAccess(accountantUser, allOn, 'checks'), false);

  // Admin respects global Settings toggles while keeping other sections
  const checksDisabled = { ...allOn, checks: false, barter: false };
  assert.equal(hasSectionAccess(adminUser, checksDisabled, 'checks'), false);
  assert.equal(hasSectionAccess(adminUser, checksDisabled, 'barter'), false);
  assert.equal(hasSectionAccess(adminUser, checksDisabled, 'sales'), true);

  // User with checks: true still loses access if global checks toggle is disabled
  const checkClerk: User = {
    ...cashierUser,
    perms: { ...cashierUser.perms, checks: true },
  };
  assert.equal(hasSectionAccess(checkClerk, allOn, 'checks'), true);
  assert.equal(hasSectionAccess(checkClerk, checksDisabled, 'checks'), false);

  // Global paybook off hides paybook even for accountant with ledger: true
  assert.equal(hasSectionAccess(accountantUser, { ...allOn, paybook: false }, 'paybook'), false);
  assert.equal(hasSectionAccess(accountantUser, { ...allOn, paybook: false }, 'ledger'), true);
});

test('RBAC: isPermKeyVisible hides checkboxes for globally disabled features and labels use Checks', () => {
  const feats = { checks: false, barter: false, sales: true, inventory: true, reports: true, accounting: false };
  assert.equal(isPermKeyVisible('checks', feats), false);
  assert.equal(isPermKeyVisible('delete_checks', feats), false);
  assert.equal(isPermKeyVisible('edit_checks', feats), false);
  assert.equal(isPermKeyVisible('barter', feats), false);
  assert.equal(isPermKeyVisible('delete_barter', feats), false);
  assert.equal(isPermKeyVisible('report_accounting', feats), false);
  assert.equal(isPermKeyVisible('report_apaging', feats), false);
  assert.equal(isPermKeyVisible('sales', feats), true);
  assert.equal(isPermKeyVisible('report_aging', feats), true);

  // Confirm no "Gov Checks" remains in edit/delete perm labels
  assert.equal(DELETE_PERM_KEYS.find((x) => x.k === 'delete_checks')?.label, 'Delete Checks');
  assert.equal(EDIT_PERM_KEYS.find((x) => x.k === 'edit_checks')?.label, 'Edit Checks');

  // Direct Sale Mode hides deliveries section and delivery edit/delete permissions
  assert.equal(isPermKeyVisible('edit_deliveries', feats, false), true);
  assert.equal(isPermKeyVisible('delete_deliveries', feats, false), true);
  assert.equal(isPermKeyVisible('edit_deliveries', feats, true), false);
  assert.equal(isPermKeyVisible('delete_deliveries', feats, true), false);
  assert.equal(isPermKeyVisible('edit_invoices', feats, true), true);
  assert.equal(hasSectionAccess(adminUser, feats, 'deliveries', false, false), true);
  assert.equal(hasSectionAccess(adminUser, feats, 'deliveries', false, true), false);
  assert.equal(hasSectionAccess(cashierUser, feats, 'deliveries', false, true), false);
  assert.equal(hasSectionAccess(cashierUser, feats, 'invoices', false, true), true);
});
