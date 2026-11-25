import { todayStr, addDays } from '../utils/formatters';
import type {
  Invoice,
  Delivery,
  ReturnSlip,
  ReturnInvoice,
  Intake,
  Arrival,
  Barter,
  CheckDoc,
  Transfer,
  Disposal,
  Item,
  Customer,
  User,
  Branch,
  MoneyAccount,
  MoneyMove,
  Expense,
  StockAdjust,
} from '../types';

export interface NavItemDef {
  id: string;
  label: string;
  ar: string;
  icon: string;
  perm?: string;
  feat?: string;
}

export const NAVS: NavItemDef[] = [
  { id: 'dash', label: 'Dashboard', ar: 'لوحة التحكم', icon: '📊' },
  { id: 'alerts', label: 'Alerts', ar: 'التنبيهات', icon: '🔔' },
  { id: 'invoices', label: 'Invoices', ar: 'المبيعات والفواتير', icon: '🧾', perm: 'sales', feat: 'sales' },
  { id: 'deliveries', label: 'Deliveries & Backlog', ar: 'التسليم والمتأخرات', icon: '🚚', perm: 'sales', feat: 'sales' },
  { id: 'returns', label: 'Returns', ar: 'المرتجعات وإشعارات الدائن', icon: '↩️', perm: 'sales', feat: 'sales' },
  { id: 'intake', label: 'Purchases', ar: 'المشتريات والاستلام', icon: '📦', perm: 'purchasing', feat: 'purchasing' },
  { id: 'paybook', label: 'Payment Book', ar: 'دفتر السداد والقبض', icon: '📖', perm: 'ledger', feat: 'paybook' },
  { id: 'money', label: 'Banks & Cash', ar: 'المصارف والخزائن', icon: '💰', perm: 'ledger', feat: 'money' },
  { id: 'barter', label: 'Barter', ar: 'المقايضة وتبادل الأصناف', icon: '🔄', perm: 'barter', feat: 'barter' },
  { id: 'checks', label: 'Checks', ar: 'الشيكات', icon: '📑', perm: 'checks', feat: 'checks' },
  { id: 'inventory', label: 'Inventory', ar: 'المخزون والأصناف', icon: '🏷️', perm: 'inventory', feat: 'inventory' },
  { id: 'transfers', label: 'Transfers', ar: 'التحويلات بين الفروع', icon: '↔️', perm: 'transfers', feat: 'transfers' },
  { id: 'disposals', label: 'Disposals', ar: 'الإتلافات والشطب', icon: '🗑️', perm: 'disposals', feat: 'disposals' },
  { id: 'customers', label: 'Customers', ar: 'العملاء والموردين', icon: '👥', perm: 'customers', feat: 'customers' },
  { id: 'ledger', label: 'Ledgers', ar: 'كشوفات الحساب', icon: '⚖️', perm: 'ledger', feat: 'ledger' },
  { id: 'reports', label: 'Reports', ar: 'التقارير والتحليلات', icon: '📈', perm: 'reports', feat: 'reports' },
  { id: 'accounts', label: 'Accounting', ar: 'المحاسبة والمركز المالي', icon: '🏛️', perm: 'reports', feat: 'accounting' },
  { id: 'data', label: 'Data', ar: 'البيانات والنسخ الاحتياطي', icon: '💾', perm: 'data' },
  { id: 'users', label: 'Users', ar: 'المستخدمين والصلاحيات', icon: '🛡️', perm: 'adminonly' },
  { id: 'branches', label: 'Branches', ar: 'الفروع والمستودعات', icon: '🏢', perm: 'adminonly' },
  { id: 'settings', label: 'Settings', ar: 'الإعدادات', icon: '⚙️', perm: 'settings' },
];

export const FEATURE_KEYS = [
  { k: 'sales', label: 'Sales   invoices, deliveries, returns' },
  { k: 'purchasing', label: 'Purchases   receipts & arrivals' },
  { k: 'paybook', label: 'Payment Book' },
  { k: 'money', label: 'Banks & Cash   accounts, transfers, expenses' },
  { k: 'ledger', label: 'Customer & provider ledgers' },
  { k: 'barter', label: 'Barter exchanges' },
  { k: 'checks', label: 'Checks' },
  { k: 'inventory', label: 'Inventory & items' },
  { k: 'transfers', label: 'Branch transfers' },
  { k: 'disposals', label: 'Disposals & write-offs' },
  { k: 'customers', label: 'Customers & providers' },
  { k: 'reports', label: 'Reports' },
  { k: 'accounting', label: 'Accounting' },
];

export const ACCOUNT_TYPES = [
  { k: 'cashbox', label: 'Branch Cashbox' },
  { k: 'bank', label: 'Bank Account' },
  { k: 'cheques', label: 'Cheques in Hand' },
];

export const EXPENSE_CATS = ['Rent', 'Salaries', 'Transport', 'Utilities', 'Bank fees', 'Maintenance', 'Other'];

export const PERM_KEYS = [
  { k: 'sales', label: 'Sales   Invoices   Deliveries   Returns' },
  { k: 'purchasing', label: 'Purchases   Receipts & Arrivals' },
  { k: 'barter', label: 'Barter exchanges' },
  { k: 'checks', label: 'Checks' },
  { k: 'inventory', label: 'Inventory & Items' },
  { k: 'transfers', label: 'Branch transfers' },
  { k: 'disposals', label: 'Disposals & write-offs' },
  { k: 'customers', label: 'Customers & providers' },
  { k: 'ledger', label: 'Ledgers   Payment Book' },
  { k: 'reports', label: 'Reports & analytics' },
  { k: 'data', label: 'Import / export / backup' },
  { k: 'settings', label: 'Settings' },
];

export const CHECK_STATUSES = ['received', 'deposited', 'cleared', 'bounced', 'overdue'] as const;

export const IMPORT_KINDS = [
  { id: 'items', label: 'Item Catalog', hint: 'name, SKU, price, cost, company, group, barcode, reorder' },
  { id: 'customers', label: 'Customers (opening balances)', hint: 'name, phone, address, opening balance, provider flag' },
  { id: 'stock', label: 'Warehouse Stock', hint: 'item (SKU, name or barcode), branch, quantity, cost, batch, expiry' },
];

export interface ImportFieldDef {
  key: string;
  label: string;
  req: boolean;
  matches: string[];
}

export const IMPORT_FIELDS: Record<string, ImportFieldDef[]> = {
  items: [
    { key: 'name', label: 'Item name', req: true, matches: ['name', 'item', 'product', 'description', 'الاسم', 'اسم الصنف'] },
    { key: 'sku', label: 'SKU', req: false, matches: ['sku', 'code', 'number', 'الرمز'] },
    { key: 'price', label: 'Selling price', req: false, matches: ['price', 'sell', 'sale', 'السعر'] },
    { key: 'cost', label: 'Buying cost', req: false, matches: ['cost', 'buy', 'التكلفة', 'شراء'] },
    { key: 'company', label: 'Company', req: false, matches: ['company', 'brand', 'الشركة'] },
    { key: 'group', label: 'Group', req: false, matches: ['group', 'category', 'المجموعة'] },
    { key: 'barcode', label: 'Barcode / GTIN', req: false, matches: ['barcode', 'gtin', 'باركود'] },
    { key: 'reorder', label: 'Reorder level', req: false, matches: ['reorder', 'min', 'حد الطلب'] },
    { key: 'note', label: 'Special note', req: false, matches: ['note', 'remark', 'ملاحظات'] },
  ],
  customers: [
    { key: 'name', label: 'Customer name', req: true, matches: ['name', 'customer', 'العميل', 'الاسم'] },
    { key: 'phone', label: 'Phone', req: false, matches: ['phone', 'mobile', 'tel', 'الهاتف'] },
    { key: 'address', label: 'Address', req: false, matches: ['address', 'location', 'العنوان'] },
    { key: 'openingBalance', label: 'Opening balance', req: false, matches: ['opening', 'balance', 'الافتتاحي'] },
    { key: 'provider', label: 'Is provider (yes/no)', req: false, matches: ['provider', 'supplier', 'vendor', 'مورد'] },
  ],
  stock: [
    { key: 'item', label: 'Item (SKU, name or barcode)', req: true, matches: ['item', 'sku', 'code', 'barcode', 'product', 'الصنف', 'المادة'] },
    { key: 'branch', label: 'Branch (code or name)', req: true, matches: ['branch', 'warehouse', 'store', 'location', 'الفرع', 'المستودع', 'المخزن'] },
    { key: 'qty', label: 'Quantity', req: true, matches: ['qty', 'quantity', 'count', 'amount', 'stock', 'الكمية', 'العدد'] },
    { key: 'cost', label: 'Unit cost', req: false, matches: ['cost', 'buy', 'التكلفة'] },
    { key: 'batchNo', label: 'Batch no', req: false, matches: ['batch', 'lot', 'الدفعة', 'التشغيلة', 'الوجبة'] },
    { key: 'expiry', label: 'Expiry date', req: false, matches: ['expiry', 'expiration', 'exp', 'الصلاحية', 'انتهاء'] },
  ],
};

export const defaultAllFeatures = (): Record<string, boolean> => {
  const o: Record<string, boolean> = {};
  FEATURE_KEYS.forEach((f) => {
    o[f.k] = true;
  });
  return o;
};

export const blankInvoice = (): Invoice => ({
  id: '',
  no: '',
  customerId: '',
  branchId: '',
  date: todayStr(),
  lines: [{ itemId: null, qty: 1, price: 0, discType: 'pct', discVal: 0 }],
  orderDiscType: 'pct',
  orderDiscVal: 0,
  sub: 0,
  discAmt: 0,
  tax: 0,
  total: 0,
  note: '',
});

export const blankDelivery = (): Delivery => ({
  id: '',
  no: '',
  invoiceId: '',
  returnSlipId: '',
  customerId: '',
  branchId: '',
  date: todayStr(),
  lines: [],
});

export const blankReturn = (): ReturnSlip => ({
  id: '',
  no: '',
  customerId: '',
  branchId: '',
  date: todayStr(),
  note: '',
  returnInvoiceId: null,
  lines: [{ itemId: null, qty: 1, batchNo: '', expiry: '' }],
});

export const blankRetInv = (): ReturnInvoice => ({
  id: '',
  no: '',
  customerId: '',
  branchId: '',
  returnSlipId: '',
  date: todayStr(),
  lines: [],
  total: 0,
});

export const blankIntake = (): Intake => ({
  id: '',
  no: '',
  providerId: '',
  branchId: '',
  date: todayStr(),
  note: '',
  total: 0,
  lines: [{ itemId: '', qty: 1, cost: 0, code: '' }],
});

export const blankArrival = (): Arrival => ({
  id: '',
  no: '',
  intakeId: '',
  branchId: '',
  date: todayStr(),
  note: '',
  lines: [],
});

export const blankBarter = (): Barter => ({
  id: '',
  no: '',
  partnerId: '',
  branchId: '',
  date: todayStr(),
  giveLines: [],
  recvLines: [],
  giveValue: 0,
  recvValue: 0,
  loss: 0,
});

export const blankCheck = (): CheckDoc => ({
  id: '',
  no: '',
  customerId: '',
  checkNo: '',
  bank: '',
  amount: 0,
  status: 'received',
  receivedDate: todayStr(),
  dueDate: addDays(todayStr(), 30),
  payouts: [],
});

export const blankTransfer = (): Transfer => ({
  id: '',
  no: '',
  date: todayStr(),
  fromBranchId: '',
  toBranchId: '',
  status: 'transit',
  lines: [],
});

export const blankDisposal = (): Disposal => ({
  id: '',
  no: '',
  date: todayStr(),
  branchId: '',
  status: 'pending',
  lines: [],
});

export const blankItem = (): Item => ({
  id: '',
  sku: '',
  name: '',
  company: '',
  group: '',
  cost: 0,
  price: 0,
  reorder: 0,
  barcode: '',
  note: '',
  batch: true,
  trackingMode: 'global',
});

export const blankCustomer = (): Customer => ({
  id: '',
  name: '',
  phone: '',
  address: '',
  openingBalance: 0,
  isProvider: false,
});

export const blankUser = (): User => ({
  id: '',
  name: '',
  username: '',
  pass: '',
  role: 'user',
  branchIds: [],
  active: true,
  perms: {},
});

export const blankBranch = (): Branch => ({
  id: '',
  code: '',
  name: '',
  address: '',
  isMain: false,
});

export const blankAccount = (): MoneyAccount => ({
  id: '',
  name: '',
  type: 'cashbox',
  branchId: null,
  opening: 0,
  note: '',
});

export const blankMoneyMove = (): MoneyMove => ({
  id: '',
  no: '',
  date: todayStr(),
  fromAccountId: '',
  toAccountId: '',
  amount: 0,
  note: '',
  status: 'done',
});

export const blankExpense = (): Expense => ({
  id: '',
  no: '',
  date: todayStr(),
  category: 'Rent',
  accountId: '',
  amount: 0,
  note: '',
});

export const blankAdjust = (): StockAdjust => ({
  id: '',
  date: todayStr(),
  branchId: '',
  itemId: '',
  batchNo: '',
  expiry: '',
  qty: 0,
  cost: 0,
  reason: '',
});
