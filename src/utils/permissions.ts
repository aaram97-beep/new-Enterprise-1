import type { User } from '../types';
import { fmt } from './formatters';

export interface PermItem {
  k: string;
  label: string;
  ar: string;
  desc?: string;
  arDesc?: string;
}

export const DELETE_PERM_KEYS: PermItem[] = [
  { k: 'delete_invoices', label: 'Delete Invoices', ar: 'حذف الفواتير', desc: 'Allow deleting sales invoices' },
  { k: 'delete_deliveries', label: 'Delete Deliveries', ar: 'حذف مذكرات التسليم', desc: 'Allow deleting delivery notes & restoring stock' },
  { k: 'delete_returns', label: 'Delete Returns', ar: 'حذف المرتجعات', desc: 'Allow deleting return slips and credit notes' },
  { k: 'delete_buying', label: 'Delete Purchases', ar: 'حذف المشتريات وإيصالات الشراء', desc: 'Allow deleting purchase receipts and arrivals' },
  { k: 'delete_payments', label: 'Delete Payments', ar: 'حذف سندات القبض والدفع', desc: 'Allow deleting payment book entries' },
  { k: 'delete_money', label: 'Delete Banks & Cash Accounts', ar: 'حذف الحسابات المصرفية والخزائن', desc: 'Allow deleting financial accounts & money moves' },
  { k: 'delete_expenses', label: 'Delete Expenses', ar: 'حذف المصاريف', desc: 'Allow deleting logged expenses' },
  { k: 'delete_barter', label: 'Delete Barter', ar: 'حذف عمليات المقايضة', desc: 'Allow deleting barter exchange records' },
  { k: 'delete_checks', label: 'Delete Checks', ar: 'حذف الشيكات', desc: 'Allow deleting checks in hand' },
  { k: 'delete_inventory', label: 'Delete Inventory Items', ar: 'حذف أصناف المخزون', desc: 'Allow deleting items from product catalog' },
  { k: 'delete_transfers', label: 'Delete Transfers', ar: 'حذف تحويلات الفروع', desc: 'Allow deleting branch transfer orders' },
  { k: 'delete_disposals', label: 'Delete Disposals', ar: 'حذف الإتلافات', desc: 'Allow deleting waste & disposal records' },
  { k: 'delete_customers', label: 'Delete Accounts (Clients/Suppliers)', ar: 'حذف حسابات العملاء والموردين', desc: 'Allow deleting customer & supplier profiles' },
];

export const EDIT_PERM_KEYS: PermItem[] = [
  { k: 'edit_invoices', label: 'Edit Invoices', ar: 'تعديل الفواتير', desc: 'Allow editing invoice lines, prices & discounts' },
  { k: 'edit_deliveries', label: 'Edit Deliveries', ar: 'تعديل مذكرات التسليم', desc: 'Allow modifying delivery notes' },
  { k: 'edit_returns', label: 'Edit Returns', ar: 'تعديل المرتجعات', desc: 'Allow modifying return slips' },
  { k: 'edit_buying', label: 'Edit Purchases', ar: 'تعديل المشتريات وإيصالات الشراء', desc: 'Allow editing supplier receipts & arrivals' },
  { k: 'edit_payments', label: 'Edit Payments', ar: 'تعديل سندات القبض والصرف', desc: 'Allow editing payment allocations & receipts' },
  { k: 'edit_money', label: 'Edit Banks & Cash Accounts', ar: 'تعديل المصارف والخزائن', desc: 'Allow editing account details & money moves' },
  { k: 'edit_expenses', label: 'Edit Expenses', ar: 'تعديل المصاريف', desc: 'Allow modifying expense categories & amounts' },
  { k: 'edit_barter', label: 'Edit Barter', ar: 'تعديل المقايضة', desc: 'Allow modifying barter exchange goods' },
  { k: 'edit_checks', label: 'Edit Checks', ar: 'تعديل وتصفية الشيكات', desc: 'Allow clearing, bouncing, or cashing checks' },
  { k: 'edit_inventory', label: 'Edit Inventory Items', ar: 'تعديل أصناف المخزون', desc: 'Allow editing item names, prices & barcodes' },
  { k: 'adjust_inventory', label: 'Adjust Stock in Inventory', ar: 'التسوية المخزنية (Adjust)', desc: 'Allow seeing and using the Adjust button in Inventory to add or deduct stock' },
  { k: 'edit_transfers', label: 'Edit & Process Transfers', ar: 'تعديل ومعالجة التحويلات', desc: 'Allow receiving or canceling branch transfers' },
  { k: 'edit_disposals', label: 'Edit & Approve Disposals', ar: 'تعديل واعتماد الإتلافات', desc: 'Allow approving or rejecting disposal requests' },
  { k: 'edit_customers', label: 'Edit Clients & Suppliers', ar: 'تعديل العملاء والموردين', desc: 'Allow updating customer phones, address & terms' },
];

export const REPORT_PERM_KEYS: PermItem[] = [
  { k: 'report_aging', label: 'A/R Customer Aging Report', ar: 'تقرير أعمار الديون والذمم المدينة', desc: 'Aging buckets for customer balances' },
  { k: 'report_valuation', label: 'Stock Valuation Report', ar: 'تقرير تقييم المخزون وبطاقات الجرد', desc: 'Item batch quantities and stock value' },
  { k: 'report_itemcard', label: 'Item Movement Card', ar: 'بطاقة حركة الصنف التفصيلية', desc: 'Chronological ins and outs per product' },
  { k: 'report_movement', label: 'Movement Velocity Report', ar: 'تقرير سرعة دوران المخزون (سريع/بطيء)', desc: 'Fast, slow, and dead stock analysis' },
  { k: 'report_loss', label: 'Loss & Disposals Report', ar: 'تقرير خسائر الإتلافات والشطب', desc: 'Total waste, spoiled, and damaged inventory loss' },
  { k: 'report_audit', label: 'Activity Audit Log', ar: 'سجل تدقيق الأنشطة والعمليات', desc: 'Audit trail of user actions across the system' },
  { k: 'report_accounting', label: 'Financial Accounting Module', ar: 'نظام المحاسبة والمركز المالي', desc: 'Full accounting module access' },
  { k: 'report_trial', label: 'Trial Balance Report', ar: 'ميزان المراجعة', desc: 'Debit & credit balances across all accounts' },
  { k: 'report_journal', label: 'General Journal Entries', ar: 'دفتر اليومية العامة', desc: 'Chronological double-entry transactions' },
  { k: 'report_income', label: 'Income Statement (P&L)', ar: 'قائمة الدخل والأرباح والخسائر', desc: 'Sales, COGS, expenses, and net profit' },
  { k: 'report_apaging', label: 'A/P Supplier Aging Report', ar: 'تقرير أعمار ذمم الموردين والدائنين', desc: 'Aging buckets for unpaid supplier invoices' },
  { k: 'report_balance', label: 'Balance Sheet & Equity', ar: 'الميزانية العمومية والمركز المالي', desc: 'Assets, liabilities, and owner equity' },
  { k: 'report_cashflow', label: 'Cash Flow Statement', ar: 'قائمة التدفقات النقدية', desc: 'Cash inflows, operating expenses, and net flow' },
];

export const SENSITIVE_FINANCIAL_PERM_KEYS: PermItem[] = [
  {
    k: 'view_buying_cost',
    label: 'View Buying Prices of Items (Cost)',
    ar: 'الاطلاع على أسعار الشراء وتكلفة البضاعة',
    desc: 'When unchecked, buying cost prices are masked (***) across inventory, receipts, and valuation.',
    arDesc: 'عند إلغاء هذا الخيار، يتم حجب أسعار الشراء وتظهر كرموز مخفية (***) في المخزون والفواتير والتقارير.',
  },
  {
    k: 'view_company_worth',
    label: 'View Worth of Company & Financial Assets',
    ar: 'الاطلاع على القيمة المالية للشركة وصافي الأصول',
    desc: 'When unchecked, company net worth, balance sheet equity, total inventory worth, and financial KPI totals are restricted.',
    arDesc: 'عند إلغاء هذا الخيار، يتم حجب صافي ثروة الشركة، حقوق الملكية، وإجمالي قيمة بضاعة المخزون.',
  },
];

/**
 * Check if a user has a specific permission.
 * Admins always have full permissions (bypass all restrictions).
 */
export function hasPerm(user: User | null | undefined, permKey: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.perms) return false;
  return !!user.perms[permKey];
}

/**
 * Check if a user can delete in a given section.
 */
export function canDelete(user: User | null | undefined, section: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const key = `delete_${section}`;
  return hasPerm(user, key);
}

/**
 * Check if a user can edit in a given section.
 */
export function canEdit(user: User | null | undefined, section: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  const key = `edit_${section}`;
  return hasPerm(user, key);
}

/**
 * Check if a user can see and use the Stock Adjust feature in Inventory.
 */
export function canAdjustInventory(user: User | null | undefined): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  return !!user.perms?.adjust_inventory;
}

/**
 * Check if a user can view a specific report.
 */
export function canViewReport(user: User | null | undefined, reportId: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  // If user doesn't have general reports permission, block all reports
  if (!user.perms?.reports) return false;
  const key = `report_${reportId}`;
  // If specific report key exists in perms, check it; if undefined on existing user, check if reports general was granted
  if (user.perms && key in user.perms) {
    return !!user.perms[key];
  }
  // Default to true if user has general reports permission and granular key not yet initialized
  return true;
}

/**
 * Check if a user can view item buying prices / costs.
 * In branch mode, purchase prices and profit calculations are managed centrally by the parent company,
 * so branch-level cost views are turned off.
 */
export function canViewCost(user: User | null | undefined, isBranchCompany?: boolean): boolean {
  if (isBranchCompany) return false;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.perms) return false;
  // If key is undefined (e.g. legacy user without this key yet), default to false for restricted safety, or check if admin
  return !!user.perms.view_buying_cost;
}

/**
 * Check if a user can view company total worth / financial equity / total stock valuation worth.
 * In branch mode, overall company equity and inventory worth are managed centrally.
 */
export function canViewCompanyWorth(user: User | null | undefined, isBranchCompany?: boolean): boolean {
  if (isBranchCompany) return false;
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.perms) return false;
  return !!user.perms.view_company_worth;
}

/**
 * Mask cost values if user doesn't have permission to see buying prices or in branch mode.
 */
export function maskCost(
  val: number | string | undefined | null,
  user: User | null | undefined,
  currency: string = '',
  isBranchCompany?: boolean
): string {
  if (canViewCost(user, isBranchCompany)) {
    if (typeof val === 'number') {
      return currency ? `${fmt(val)} ${currency}` : fmt(val);
    }
    return val !== undefined && val !== null ? String(val) : '—';
  }
  return '***';
}

/**
 * Mask financial worth / company equity if user doesn't have permission or in branch mode.
 */
export function maskWorth(
  val: number | string | undefined | null,
  user: User | null | undefined,
  currency: string = '',
  placeholder: string = '*** (Restricted)',
  isBranchCompany?: boolean
): string {
  if (canViewCompanyWorth(user, isBranchCompany)) {
    if (typeof val === 'number') {
      return currency ? `${fmt(val)} ${currency}` : fmt(val);
    }
    return val !== undefined && val !== null ? String(val) : '—';
  }
  return isBranchCompany ? '*** (Managed Centrally)' : placeholder;
}

const isFeatureOn = (features: Record<string, boolean> | undefined, featKey: string): boolean => {
  if (!features) return true;
  return features[featKey] !== false;
};

/**
 * Unified section access check combining global Settings feature toggles and per-user permissions.
 * Ensures disabled sections are completely hidden everywhere (navs, dashboard cards, alerts, payment options, exports, reports).
 */
export function hasSectionAccess(
  user: User | null | undefined,
  features: Record<string, boolean> | undefined,
  section: string,
  isBranchCompany?: boolean,
  directSaleMode?: boolean
): boolean {
  if (!user) return false;
  const isAdmin = user.role === 'admin';
  const perms = user.perms || {};

  switch (section) {
    case 'deliveries':
      if (directSaleMode) return false;
      return isFeatureOn(features, 'sales') && (isAdmin || !!perms.sales);
    case 'sales':
    case 'invoices':
    case 'returns':
      return isFeatureOn(features, 'sales') && (isAdmin || !!perms.sales);
    case 'purchasing':
    case 'intake':
      return isFeatureOn(features, 'purchasing') && (isAdmin || !!perms.purchasing);
    case 'paybook':
      return isFeatureOn(features, 'paybook') && (isAdmin || !!perms.ledger);
    case 'money':
      return isFeatureOn(features, 'money') && (isAdmin || !!perms.ledger);
    case 'ledger':
      return isFeatureOn(features, 'ledger') && (isAdmin || !!perms.ledger);
    case 'barter':
      return isFeatureOn(features, 'barter') && (isAdmin || !!perms.barter);
    case 'checks':
      return isFeatureOn(features, 'checks') && (isAdmin || !!perms.checks);
    case 'inventory':
      return isFeatureOn(features, 'inventory') && (isAdmin || !!perms.inventory);
    case 'transfers':
      return isFeatureOn(features, 'transfers') && (isAdmin || !!perms.transfers);
    case 'disposals':
      return isFeatureOn(features, 'disposals') && (isAdmin || !!perms.disposals);
    case 'customers':
      return isFeatureOn(features, 'customers') && (isAdmin || !!perms.customers);
    case 'reports':
      return isFeatureOn(features, 'reports') && (isAdmin || !!perms.reports);
    case 'accounting':
    case 'accounts':
      if (!isFeatureOn(features, 'accounting')) return false;
      if (isAdmin) return true;
      if (!perms.reports) return false;
      if ('report_accounting' in perms) return !!perms.report_accounting;
      return Object.keys(perms).some((k) => k.startsWith('report_'))
        ? canViewCompanyWorth(user, isBranchCompany)
        : true;
    case 'data':
      return isAdmin || !!perms.data;
    case 'settings':
      return isAdmin || !!perms.settings;
    case 'users':
    case 'branches':
      return isAdmin;
    case 'dash':
    case 'alerts':
      return true;
    default:
      return isAdmin || !!perms[section];
  }
}

/**
 * Determine whether a permission item should be visible in UserModal
 * based on global Settings feature toggles.
 */
export function isPermKeyVisible(
  permKey: string,
  features: Record<string, boolean> | undefined,
  directSaleMode?: boolean
): boolean {
  switch (permKey) {
    case 'delete_deliveries':
    case 'edit_deliveries':
      if (directSaleMode) return false;
      return isFeatureOn(features, 'sales');
    case 'sales':
    case 'delete_invoices':
    case 'delete_returns':
    case 'edit_invoices':
    case 'edit_returns':
      return isFeatureOn(features, 'sales');
    case 'purchasing':
    case 'delete_buying':
    case 'edit_buying':
      return isFeatureOn(features, 'purchasing');
    case 'delete_payments':
    case 'edit_payments':
      return isFeatureOn(features, 'paybook');
    case 'delete_money':
    case 'edit_money':
    case 'delete_expenses':
    case 'edit_expenses':
      return isFeatureOn(features, 'money');
    case 'ledger':
      return isFeatureOn(features, 'ledger') || isFeatureOn(features, 'paybook') || isFeatureOn(features, 'money');
    case 'barter':
    case 'delete_barter':
    case 'edit_barter':
      return isFeatureOn(features, 'barter');
    case 'checks':
    case 'delete_checks':
    case 'edit_checks':
      return isFeatureOn(features, 'checks');
    case 'inventory':
    case 'delete_inventory':
    case 'edit_inventory':
    case 'adjust_inventory':
      return isFeatureOn(features, 'inventory');
    case 'transfers':
    case 'delete_transfers':
    case 'edit_transfers':
      return isFeatureOn(features, 'transfers');
    case 'disposals':
    case 'delete_disposals':
    case 'edit_disposals':
      return isFeatureOn(features, 'disposals');
    case 'customers':
    case 'delete_customers':
    case 'edit_customers':
      return isFeatureOn(features, 'customers');
    case 'reports':
    case 'report_audit':
      return isFeatureOn(features, 'reports');
    case 'report_aging':
      return isFeatureOn(features, 'reports') && isFeatureOn(features, 'sales');
    case 'report_valuation':
    case 'report_itemcard':
    case 'report_movement':
      return isFeatureOn(features, 'reports') && isFeatureOn(features, 'inventory');
    case 'report_loss':
      return isFeatureOn(features, 'reports') && (isFeatureOn(features, 'disposals') || isFeatureOn(features, 'barter'));
    case 'report_accounting':
    case 'report_trial':
    case 'report_journal':
    case 'report_income':
    case 'report_balance':
    case 'report_cashflow':
      return isFeatureOn(features, 'accounting');
    case 'report_apaging':
      return isFeatureOn(features, 'accounting') && isFeatureOn(features, 'purchasing');
    default:
      return true;
  }
}
