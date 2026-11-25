export type TrackingMode = 'both' | 'lot' | 'expiry' | 'none';
export type ItemTrackingMode = 'global' | TrackingMode;

export interface Settings {
  companyName: string;
  address: string;
  phone: string;
  currency: string;
  taxRate: number;
  expiryWarnDays: number;
  logo: string;
  lang: 'en' | 'ar';
  features: Record<string, boolean>;
  trackBatchExpiry?: boolean;
  lotExpiryMode?: TrackingMode;
  showInOtherBranchStatus?: boolean;
  moneyDecimals?: number;
  theme?: 'light' | 'dark';
  isBranchCompany?: boolean;
  directSaleMode?: boolean;
  workspaceInitialized?: boolean;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
  address: string;
  isMain: boolean;
}

export interface UserPermissions {
  // Navigation / Module access
  sales?: boolean;
  purchasing?: boolean;
  barter?: boolean;
  checks?: boolean;
  inventory?: boolean;
  transfers?: boolean;
  disposals?: boolean;
  customers?: boolean;
  ledger?: boolean;
  reports?: boolean;
  data?: boolean;
  settings?: boolean;

  // Granular Delete Permissions
  delete_invoices?: boolean;
  delete_deliveries?: boolean;
  delete_returns?: boolean;
  delete_buying?: boolean;
  delete_payments?: boolean;
  delete_money?: boolean;
  delete_expenses?: boolean;
  delete_barter?: boolean;
  delete_checks?: boolean;
  delete_inventory?: boolean;
  delete_transfers?: boolean;
  delete_disposals?: boolean;
  delete_customers?: boolean;

  // Granular Edit Permissions
  edit_invoices?: boolean;
  edit_deliveries?: boolean;
  edit_returns?: boolean;
  edit_buying?: boolean;
  edit_payments?: boolean;
  edit_money?: boolean;
  edit_expenses?: boolean;
  edit_barter?: boolean;
  edit_checks?: boolean;
  edit_inventory?: boolean;
  adjust_inventory?: boolean;
  edit_transfers?: boolean;
  edit_disposals?: boolean;
  edit_customers?: boolean;

  // Granular Report Type Permissions
  report_aging?: boolean;
  report_valuation?: boolean;
  report_itemcard?: boolean;
  report_movement?: boolean;
  report_loss?: boolean;
  report_audit?: boolean;
  report_accounting?: boolean;
  report_trial?: boolean;
  report_journal?: boolean;
  report_income?: boolean;
  report_apaging?: boolean;
  report_balance?: boolean;
  report_cashflow?: boolean;

  // Sensitive Financial & Cost Protections
  view_buying_cost?: boolean;
  view_company_worth?: boolean;

  [key: string]: boolean | undefined;
}

export interface User {
  id: string;
  name: string;
  username: string;
  pass: string;
  role: 'admin' | 'user';
  branchIds: string[];
  active: boolean;
  deleted?: boolean;
  deletedAt?: number;
  perms: UserPermissions;
}

export interface UserSession {
  id: string;
  name: string;
  role: 'admin' | 'user';
  username: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  isProvider: boolean;
  note?: string;
}

export interface Item {
  id: string;
  sku: string;
  name: string;
  company: string;
  group: string;
  cost: number;
  price: number;
  reorder: number;
  barcode: string;
  note: string;
  batch: boolean;
  trackingMode?: ItemTrackingMode;
}

export interface StockBatch {
  id: string;
  itemId: string;
  branchId: string;
  batchNo: string;
  expiry: string;
  qty: number;
  cost: number;
}

export interface InvoiceLine {
  itemId: string | null;
  qty: number;
  price: number;
  discType: 'pct' | 'amt';
  discVal: number;
  stockId?: string;
  batchNo?: string;
  expiry?: string;
  cost?: number;
}

export interface Invoice {
  id: string;
  no: string;
  date: string;
  customerId: string;
  branchId: string;
  note?: string;
  lines: InvoiceLine[];
  orderDiscType: 'pct' | 'amt';
  orderDiscVal: number;
  sub: number;
  discAmt: number;
  tax: number;
  total: number;
}

export interface DeliveryLine {
  itemId: string;
  qty: number;
  batchNo?: string;
  expiry?: string;
  cost?: number;
}

export interface Delivery {
  id: string;
  no: string;
  date: string;
  invoiceId?: string;
  returnSlipId?: string;
  customerId: string;
  branchId: string;
  note?: string;
  lines: DeliveryLine[];
}

export interface ReturnSlipLine {
  itemId: string | null;
  qty: number;
  batchNo?: string;
  expiry?: string;
}

export interface ReturnSlip {
  id: string;
  no: string;
  date: string;
  customerId: string;
  branchId: string;
  note?: string;
  returnInvoiceId: string | null;
  lines: ReturnSlipLine[];
}

export interface ReturnInvoiceLine {
  itemId: string;
  qty: number;
  price: number;
}

export interface ReturnInvoice {
  id: string;
  no: string;
  date: string;
  customerId: string;
  branchId: string;
  returnSlipId: string;
  note?: string;
  lines: ReturnInvoiceLine[];
  total: number;
}

export interface IntakeLine {
  itemId: string;
  qty: number;
  cost: number;
  code?: string;
}

export interface Intake {
  id: string;
  no: string;
  date: string;
  providerId: string;
  branchId: string;
  note?: string;
  total: number;
  lines: IntakeLine[];
}

export interface ArrivalLine {
  itemId: string;
  qty: number;
  cost: number;
  batchNo: string;
  expiry: string;
  rem?: number;
}

export interface Arrival {
  id: string;
  no: string;
  date: string;
  intakeId: string;
  branchId: string;
  note?: string;
  lines: ArrivalLine[];
}

export interface PaymentAllocation {
  type: 'invoice' | 'intake' | 'opening';
  docId: string;
  amount: number;
}

export interface Payment {
  id: string;
  no: string;
  date: string;
  customerId: string;
  amount: number;
  disc: number;
  method: string;
  note?: string;
  dir: 'in' | 'out';
  branchId?: string;
  accountId?: string | null;
  allocs: PaymentAllocation[];
}

export interface CheckPayout {
  id: string;
  date: string;
  amount: number;
  note?: string;
  accountId?: string;
}

export type CheckStatus = 'received' | 'deposited' | 'cleared' | 'bounced' | 'overdue';

export interface CheckDoc {
  id: string;
  no: string;
  customerId: string;
  checkNo: string;
  bank: string;
  amount: number;
  status: CheckStatus;
  receivedDate: string;
  dueDate: string;
  note?: string;
  payouts: CheckPayout[];
  clearedAccountId?: string;
  clearedDate?: string;
}

export interface TransferLine {
  itemId: string;
  batchNo?: string;
  expiry?: string;
  qty: number;
  cost: number;
  stockId?: string | null;
}

export interface Transfer {
  id: string;
  no: string;
  date: string;
  receivedDate?: string;
  fromBranchId: string;
  toBranchId: string;
  status: 'transit' | 'completed' | 'cancelled';
  note?: string;
  lines: TransferLine[];
}

export interface DisposalLine {
  stockId?: string | null;
  itemId: string | null;
  batchNo?: string;
  qty: number;
  cost: number;
  reason: string;
}

export interface Disposal {
  id: string;
  no: string;
  date: string;
  branchId: string;
  status: 'pending' | 'approved' | 'rejected';
  loss?: number;
  note?: string;
  lines: DisposalLine[];
}

export interface BarterGiveLine {
  itemId: string | null;
  qty: number;
  price?: number;
  cost: number;
  batchNo?: string;
  expiry?: string;
}

export interface BarterRecvLine {
  itemId: string | null;
  qty: number;
  price?: number;
  cost: number;
  batchNo?: string;
  expiry?: string;
}

export interface Barter {
  id: string;
  no: string;
  date: string;
  partnerId: string;
  branchId: string;
  note?: string;
  giveLines: BarterGiveLine[];
  recvLines: BarterRecvLine[];
  giveValue: number;
  recvValue: number;
  loss: number;
}

export interface StockAdjust {
  id: string;
  date: string;
  branchId: string;
  itemId: string;
  batchNo?: string;
  expiry?: string;
  qty: number;
  cost: number;
  reason: string;
  user?: string;
}

export interface MoneyAccount {
  id: string;
  name: string;
  type: 'cashbox' | 'bank' | 'cheques';
  branchId: string | null;
  opening: number;
  note?: string;
}

export interface MoneyMove {
  id: string;
  no: string;
  date: string;
  acceptedDate?: string;
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  note?: string;
  status: 'transit' | 'done' | 'cancelled';
}

export interface Expense {
  id: string;
  no: string;
  date: string;
  category: string;
  accountId: string;
  amount: number;
  note?: string;
}

export interface AuditLog {
  id: string;
  ts: number;
  user: string;
  action: string;
  details: string;
}

export interface DatabaseSchema {
  settings: Settings;
  branches: Branch[];
  users: User[];
  customers: Customer[];
  items: Item[];
  accounts: MoneyAccount[];
  invoices: Invoice[];
  deliveries: Delivery[];
  returnSlips: ReturnSlip[];
  returnInvoices: ReturnInvoice[];
  intakes: Intake[];
  arrivals: Arrival[];
  payments: Payment[];
  checks: CheckDoc[];
  transfers: Transfer[];
  disposals: Disposal[];
  barters: Barter[];
  adjusts: StockAdjust[];
  moneyMoves: MoneyMove[];
  expenses: Expense[];
  stocks: StockBatch[];
  audit: AuditLog[];
  counters: Record<string, Record<string, number>>;
}
