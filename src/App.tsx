import React, { useState, useEffect } from 'react';
import { IMSProvider, useIMS } from './context/IMSContext';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { LoginView } from './components/layout/LoginView';
import { ErrorBanner } from './components/layout/ErrorBanner';
import { Toast } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Views
import { DashboardView } from './components/views/DashboardView';
import { AlertsView } from './components/views/AlertsView';
import { InvoicesView } from './components/views/InvoicesView';
import { DeliveriesView } from './components/views/DeliveriesView';
import { ReturnsView } from './components/views/ReturnsView';
import { BuyingGoodsView } from './components/views/BuyingGoodsView';
import { PaymentBookView } from './components/views/PaymentBookView';
import { MoneyView } from './components/views/MoneyView';
import { BarterView } from './components/views/BarterView';
import { ChecksView } from './components/views/ChecksView';
import { InventoryView } from './components/views/InventoryView';
import { TransfersView } from './components/views/TransfersView';
import { DisposalsView } from './components/views/DisposalsView';
import { CustomersView } from './components/views/CustomersView';
import { LedgerView } from './components/views/LedgerView';
import { ReportsView } from './components/views/ReportsView';
import { AccountingView } from './components/views/AccountingView';
import { DataView } from './components/views/DataView';
import { UsersView } from './components/views/UsersView';
import { BranchesView } from './components/views/BranchesView';
import { SettingsView } from './components/views/SettingsView';

// Modals
import { InvoiceModal } from './components/modals/InvoiceModal';
import { DeliveryModal } from './components/modals/DeliveryModal';
import { ReturnSlipModal } from './components/modals/ReturnSlipModal';
import { CreditNoteModal } from './components/modals/CreditNoteModal';
import { BuyingReceiptModal } from './components/modals/BuyingReceiptModal';
import { ArrivalNoteModal } from './components/modals/ArrivalNoteModal';
import { PaymentModal } from './components/modals/PaymentModal';
import { MoneyMoveModal } from './components/modals/MoneyMoveModal';
import { ExpenseModal } from './components/modals/ExpenseModal';
import { AccountModal } from './components/modals/AccountModal';
import { CheckModal } from './components/modals/CheckModal';
import { CheckPayoutModal } from './components/modals/CheckPayoutModal';
import { BarterModal } from './components/modals/BarterModal';
import { TransferModal } from './components/modals/TransferModal';
import { DisposalModal } from './components/modals/DisposalModal';
import { ItemModal } from './components/modals/ItemModal';
import { CustomerModal } from './components/modals/CustomerModal';
import { StockAdjustModal } from './components/modals/StockAdjustModal';
import { BatchesModal } from './components/modals/BatchesModal';
import { UserModal } from './components/modals/UserModal';
import { BranchModal } from './components/modals/BranchModal';
import { ImportMappingModal } from './components/modals/ImportMappingModal';
import { ImportReportModal } from './components/modals/ImportReportModal';

// Constants & Types
import {
  blankInvoice,
  blankDelivery,
  blankReturn,
  blankRetInv,
  blankIntake,
  blankBarter,
  blankCheck,
  blankTransfer,
  blankDisposal,
  blankItem,
  blankCustomer,
  blankUser,
  blankBranch,
  blankAccount,
} from './data/constants';
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
} from './types';
import { invBalance, intakeBalance, returnSlipItemRemaining } from './utils/calculations';

function MainApp() {
  const {
    session,
    sessionUser,
    view,
    setView,
    db,
    sidebarCollapsed,
    setSidebarCollapsed,
    canAdjustInventory,
    toastMsg,
    t,
  } = useIMS();
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag !== 'input' && activeTag !== 'textarea') {
          e.preventDefault();
          setSidebarCollapsed((prev) => !prev);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setSidebarCollapsed]);

  // Modal states
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice>(blankInvoice());

  const [deliveryModalOpen, setDeliveryModalOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<Delivery>(blankDelivery());

  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [editingReturnSlip, setEditingReturnSlip] = useState<ReturnSlip>(blankReturn());

  const [creditNoteModalOpen, setCreditNoteModalOpen] = useState(false);
  const [editingCreditNote, setEditingCreditNote] = useState<ReturnInvoice>(blankRetInv());

  const [intakeModalOpen, setIntakeModalOpen] = useState(false);
  const [editingIntake, setEditingIntake] = useState<Intake>(blankIntake());

  const [arrivalModalOpen, setArrivalModalOpen] = useState(false);
  const [selectedIntakeIdForArrival, setSelectedIntakeIdForArrival] = useState<string>('');
  const [editingArrival, setEditingArrival] = useState<Arrival | null>(null);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentModalConfig, setPaymentModalConfig] = useState<{
    customerId: string | null;
    dir: 'in' | 'out';
    amount: number;
    note: string;
    locked: boolean;
  }>({
    customerId: null,
    dir: 'in',
    amount: 0,
    note: '',
    locked: false,
  });

  const [moneyMoveModalOpen, setMoneyMoveModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);

  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<MoneyAccount>(blankAccount());

  const [checkModalOpen, setCheckModalOpen] = useState(false);
  const [editingCheck, setEditingCheck] = useState<CheckDoc>(blankCheck());

  const [payoutModalOpen, setPayoutModalOpen] = useState(false);
  const [selectedCheckForPayout, setSelectedCheckForPayout] = useState<CheckDoc | null>(null);

  const [barterModalOpen, setBarterModalOpen] = useState(false);
  const [editingBarter, setEditingBarter] = useState<Barter>(blankBarter());

  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [editingTransfer, setEditingTransfer] = useState<Transfer>(blankTransfer());

  const [disposalModalOpen, setDisposalModalOpen] = useState(false);
  const [editingDisposal, setEditingDisposal] = useState<Disposal>(blankDisposal());

  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Item>(blankItem());

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer>(blankCustomer());

  const [stockAdjustModalOpen, setStockAdjustModalOpen] = useState(false);

  const [batchesModalOpen, setBatchesModalOpen] = useState(false);
  const [selectedItemIdForBatches, setSelectedItemIdForBatches] = useState<string | null>(null);

  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User>(blankUser());

  const [branchModalOpen, setBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch>(blankBranch());

  // Import Modals
  const [importMapModalOpen, setImportMapModalOpen] = useState(false);
  const [importMapConfig, setImportMapConfig] = useState<{
    kind: string;
    fileName: string;
    headers: string[];
    rows: string[][];
    fields: any[];
    initialMap: Record<string, string>;
  }>({
    kind: '',
    fileName: '',
    headers: [],
    rows: [],
    fields: [],
    initialMap: {},
  });

  const [importReportModalOpen, setImportReportModalOpen] = useState(false);
  const [importReportConfig, setImportReportConfig] = useState<{
    kind: string;
    skippedRows: string[];
  }>({
    kind: '',
    skippedRows: [],
  });

  // Targeted Customer Ledger View selection
  const [targetLedgerCustomerId, setTargetLedgerCustomerId] = useState<string | null>(null);

  // Sync RTL / LTR document direction with language setting
  useEffect(() => {
    document.documentElement.dir = db.settings.lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = db.settings.lang || 'en';
  }, [db.settings.lang]);

  // Ensure unauthenticated users always stay on root and never leave modals open
  useEffect(() => {
    if (!session || !sessionUser || !sessionUser.active) {
      setInvoiceModalOpen(false);
      setDeliveryModalOpen(false);
      setReturnModalOpen(false);
      setCreditNoteModalOpen(false);
      setIntakeModalOpen(false);
      setArrivalModalOpen(false);
      setPaymentModalOpen(false);
      setMoneyMoveModalOpen(false);
      setExpenseModalOpen(false);
      setAccountModalOpen(false);
      setCheckModalOpen(false);
      setPayoutModalOpen(false);
      setBarterModalOpen(false);
      setTransferModalOpen(false);
      setDisposalModalOpen(false);
      setItemModalOpen(false);
      setCustomerModalOpen(false);
      setStockAdjustModalOpen(false);
      setBatchesModalOpen(false);
      setUserModalOpen(false);
      setBranchModalOpen(false);
      setImportMapModalOpen(false);
      setImportReportModalOpen(false);
    }
  }, [session, sessionUser]);

  if (!session || !sessionUser || !sessionUser.active) {
    return (
      <>
        <LoginView />
        <Toast />
      </>
    );
  }

  // Handlers for cross-view actions
  const openPaymentForCustomer = (cust: Customer) => {
    setPaymentModalConfig({
      customerId: cust.id,
      dir: 'in',
      amount: 0,
      note: '',
      locked: true,
    });
    setPaymentModalOpen(true);
  };

  const openLedgerForCustomer = (customerId: string) => {
    setTargetLedgerCustomerId(customerId);
    setView('ledger');
  };

  const openPaymentForInvoice = (inv: Invoice) => {
    setPaymentModalConfig({
      customerId: inv.customerId,
      dir: 'in',
      amount: invBalance(db, inv),
      note: `For ${inv.no}`,
      locked: true,
    });
    setPaymentModalOpen(true);
  };

  const openPaymentForIntake = (intake: Intake) => {
    setPaymentModalConfig({
      customerId: intake.providerId,
      dir: 'out',
      amount: intakeBalance(db, intake),
      note: `For ${intake.no}`,
      locked: true,
    });
    setPaymentModalOpen(true);
  };

  const openDeliveryForInvoice = (inv: Invoice) => {
    setEditingDelivery({
      ...blankDelivery(),
      invoiceId: inv.id,
      returnSlipId: '',
      customerId: inv.customerId,
      branchId: inv.branchId,
    });
    setDeliveryModalOpen(true);
  };

  const openDeliveryForReturnSlip = (slip: ReturnSlip) => {
    setEditingDelivery({
      ...blankDelivery(),
      invoiceId: '',
      returnSlipId: slip.id,
      customerId: slip.customerId,
      branchId: slip.branchId,
    });
    setDeliveryModalOpen(true);
  };

  const openAttachCreditNote = (slip: ReturnSlip) => {
    const activeLines = slip.lines
      .filter((l) => l.itemId)
      .map((l) => {
        const remaining = returnSlipItemRemaining(db, slip.id, l.itemId!, +l.qty || 0);
        return {
          itemId: l.itemId!,
          qty: remaining,
          price: (db.items.find((i) => i.id === l.itemId) || {}).price || 0,
        };
      })
      .filter((l) => l.qty > 0.005);

    setEditingCreditNote({
      ...blankRetInv(),
      returnSlipId: slip.id,
      customerId: slip.customerId,
      branchId: slip.branchId,
      lines:
        activeLines.length > 0
          ? activeLines
          : slip.lines.map((l) => ({
              itemId: l.itemId!,
              qty: 0,
              price: (db.items.find((i) => i.id === l.itemId) || {}).price || 0,
            })),
    });
    setCreditNoteModalOpen(true);
  };

  const handleStartImport = (
    kind: string,
    fileName: string,
    headers: string[],
    rows: string[][],
    fields: any[],
    initialMap: Record<string, string>
  ) => {
    setImportMapConfig({
      kind,
      fileName,
      headers,
      rows,
      fields,
      initialMap,
    });
    setImportMapModalOpen(true);
  };

  return (
    <div className="min-h-screen flex bg-slate-100 dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 antialiased font-sans transition-colors duration-200">
      {/* Sidebar Navigation */}
      <Sidebar
        drawerOpen={drawerOpen}
        setDrawerOpen={setDrawerOpen}
        sidebarCollapsed={sidebarCollapsed}
      />

      {/* Main Body */}
      <div className="flex-1 min-w-0 flex flex-col">
        <ErrorBanner />
        <Header
          onOpenDrawer={() => setDrawerOpen(true)}
          sidebarCollapsed={sidebarCollapsed}
          setSidebarCollapsed={setSidebarCollapsed}
        />

        <main className="p-2 sm:p-3 md:p-6 flex-1 max-w-full">
          {view === 'dash' && (
            <DashboardView
              onOpenPayment={openPaymentForCustomer}
              onOpenLedger={openLedgerForCustomer}
            />
          )}
          {view === 'alerts' && <AlertsView />}
          {view === 'invoices' && (
            <InvoicesView
              onNewInvoice={() => {
                setEditingInvoice(blankInvoice());
                setInvoiceModalOpen(true);
              }}
              onEditInvoice={(inv) => {
                setEditingInvoice(inv);
                setInvoiceModalOpen(true);
              }}
              onNewDelivery={openDeliveryForInvoice}
              onPayInvoice={openPaymentForInvoice}
            />
          )}
          {view === 'deliveries' && (
            <DeliveriesView
              onNewDeliveryForInvoice={openDeliveryForInvoice}
              onNewDeliveryForReturnSlip={openDeliveryForReturnSlip}
              onEditDelivery={(del) => {
                setEditingDelivery(del);
                setDeliveryModalOpen(true);
              }}
            />
          )}
          {view === 'returns' && (
            <ReturnsView
              onNewReturnSlip={() => {
                setEditingReturnSlip(blankReturn());
                setReturnModalOpen(true);
              }}
              onEditReturnSlip={(slip) => {
                setEditingReturnSlip(slip);
                setReturnModalOpen(true);
              }}
              onAttachCreditNote={openAttachCreditNote}
              onNewDeliveryForReturnSlip={openDeliveryForReturnSlip}
            />
          )}
          {view === 'intake' && (
            <BuyingGoodsView
              onNewIntake={() => {
                setEditingIntake(blankIntake());
                setIntakeModalOpen(true);
              }}
              onEditIntake={(intake) => {
                setEditingIntake(intake);
                setIntakeModalOpen(true);
              }}
              onNewArrival={(intake) => {
                setEditingArrival(null);
                setSelectedIntakeIdForArrival(intake.id);
                setArrivalModalOpen(true);
              }}
              onDirectNewArrival={() => {
                setEditingArrival(null);
                setSelectedIntakeIdForArrival('');
                setArrivalModalOpen(true);
              }}
              onEditArrival={(arrival) => {
                setEditingArrival(arrival);
                setSelectedIntakeIdForArrival(arrival.intakeId || '');
                setArrivalModalOpen(true);
              }}
              onPayIntake={openPaymentForIntake}
            />
          )}
          {view === 'paybook' && (
            <PaymentBookView
              onNewPayment={() => {
                setPaymentModalConfig({
                  customerId: null,
                  dir: 'in',
                  amount: 0,
                  note: '',
                  locked: false,
                });
                setPaymentModalOpen(true);
              }}
              onOpenLedger={openLedgerForCustomer}
            />
          )}
          {view === 'money' && (
            <MoneyView
              onNewAccount={() => {
                setEditingAccount(blankAccount());
                setAccountModalOpen(true);
              }}
              onEditAccount={(acc) => {
                setEditingAccount(acc);
                setAccountModalOpen(true);
              }}
              onNewMove={() => setMoneyMoveModalOpen(true)}
              onNewExpense={() => setExpenseModalOpen(true)}
            />
          )}
          {view === 'barter' && (
            <BarterView
              onNewBarter={() => {
                setEditingBarter(blankBarter());
                setBarterModalOpen(true);
              }}
            />
          )}
          {view === 'checks' && (
            <ChecksView
              onNewCheck={() => {
                setEditingCheck(blankCheck());
                setCheckModalOpen(true);
              }}
              onOpenPayout={(chk) => {
                setSelectedCheckForPayout(chk);
                setPayoutModalOpen(true);
              }}
            />
          )}
          {view === 'inventory' && (
            <InventoryView
              onNewItem={() => {
                setEditingItem(blankItem());
                setItemModalOpen(true);
              }}
              onEditItem={(item) => {
                setEditingItem(item);
                setItemModalOpen(true);
              }}
              onOpenAdjust={() => {
                if (!canAdjustInventory()) {
                  toastMsg(t('Permission denied: You do not have permission to adjust inventory stock.'), 'error');
                  return;
                }
                setStockAdjustModalOpen(true);
              }}
              onOpenBatches={(item) => {
                setSelectedItemIdForBatches(item.id);
                setBatchesModalOpen(true);
              }}
            />
          )}
          {view === 'transfers' && (
            <TransfersView
              onNewTransfer={() => {
                setEditingTransfer(blankTransfer());
                setTransferModalOpen(true);
              }}
            />
          )}
          {view === 'disposals' && (
            <DisposalsView
              onNewDisposal={() => {
                setEditingDisposal(blankDisposal());
                setDisposalModalOpen(true);
              }}
            />
          )}
          {view === 'customers' && (
            <CustomersView
              onNewCustomer={() => {
                setEditingCustomer(blankCustomer());
                setCustomerModalOpen(true);
              }}
              onEditCustomer={(cust) => {
                setEditingCustomer(cust);
                setCustomerModalOpen(true);
              }}
              onOpenLedger={openLedgerForCustomer}
            />
          )}
          {view === 'ledger' && (
            <LedgerView initialCustomerId={targetLedgerCustomerId} />
          )}
          {view === 'reports' && <ReportsView />}
          {view === 'accounts' && <AccountingView />}
          {view === 'data' && (
            <DataView onStartImport={handleStartImport} />
          )}
          {view === 'users' && (
            <UsersView
              onNewUser={() => {
                setEditingUser(blankUser());
                setUserModalOpen(true);
              }}
              onEditUser={(user) => {
                setEditingUser(user);
                setUserModalOpen(true);
              }}
            />
          )}
          {view === 'branches' && (
            <BranchesView
              onNewBranch={() => {
                setEditingBranch(blankBranch());
                setBranchModalOpen(true);
              }}
              onEditBranch={(branch) => {
                setEditingBranch(branch);
                setBranchModalOpen(true);
              }}
            />
          )}
          {view === 'settings' && <SettingsView />}
        </main>
      </div>

      {/* Global Modals */}
      <InvoiceModal
        isOpen={invoiceModalOpen}
        onClose={() => setInvoiceModalOpen(false)}
        invoice={editingInvoice}
      />
      <DeliveryModal
        isOpen={deliveryModalOpen}
        onClose={() => setDeliveryModalOpen(false)}
        delivery={editingDelivery}
      />
      <ReturnSlipModal
        isOpen={returnModalOpen}
        onClose={() => setReturnModalOpen(false)}
        returnSlip={editingReturnSlip}
      />
      <CreditNoteModal
        isOpen={creditNoteModalOpen}
        onClose={() => setCreditNoteModalOpen(false)}
        creditNote={editingCreditNote}
      />
      <BuyingReceiptModal
        isOpen={intakeModalOpen}
        onClose={() => setIntakeModalOpen(false)}
        intake={editingIntake}
      />
      <ArrivalNoteModal
        isOpen={arrivalModalOpen}
        onClose={() => {
          setArrivalModalOpen(false);
          setEditingArrival(null);
        }}
        intakeId={selectedIntakeIdForArrival}
        arrival={editingArrival}
      />
      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        initialCustomer={paymentModalConfig.customerId}
        initialDirection={paymentModalConfig.dir}
        initialAmount={paymentModalConfig.amount}
        initialNote={paymentModalConfig.note}
        lockedCustomer={paymentModalConfig.locked}
      />
      <MoneyMoveModal
        isOpen={moneyMoveModalOpen}
        onClose={() => setMoneyMoveModalOpen(false)}
      />
      <ExpenseModal
        isOpen={expenseModalOpen}
        onClose={() => setExpenseModalOpen(false)}
      />
      <AccountModal
        isOpen={accountModalOpen}
        onClose={() => setAccountModalOpen(false)}
        account={editingAccount}
      />
      <CheckModal
        isOpen={checkModalOpen}
        onClose={() => setCheckModalOpen(false)}
        check={editingCheck}
      />
      <CheckPayoutModal
        isOpen={payoutModalOpen}
        onClose={() => setPayoutModalOpen(false)}
        check={selectedCheckForPayout}
      />
      <BarterModal
        isOpen={barterModalOpen}
        onClose={() => setBarterModalOpen(false)}
        barter={editingBarter}
      />
      <TransferModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        transfer={editingTransfer}
      />
      <DisposalModal
        isOpen={disposalModalOpen}
        onClose={() => setDisposalModalOpen(false)}
        disposal={editingDisposal}
      />
      <ItemModal
        isOpen={itemModalOpen}
        onClose={() => setItemModalOpen(false)}
        item={editingItem}
      />
      <CustomerModal
        isOpen={customerModalOpen}
        onClose={() => setCustomerModalOpen(false)}
        customer={editingCustomer}
      />
      <StockAdjustModal
        isOpen={stockAdjustModalOpen}
        onClose={() => setStockAdjustModalOpen(false)}
      />
      <BatchesModal
        isOpen={batchesModalOpen}
        onClose={() => setBatchesModalOpen(false)}
        itemId={selectedItemIdForBatches}
      />
      <UserModal
        isOpen={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        user={editingUser}
      />
      <BranchModal
        isOpen={branchModalOpen}
        onClose={() => setBranchModalOpen(false)}
        branch={editingBranch}
      />
      <ImportMappingModal
        isOpen={importMapModalOpen}
        onClose={() => setImportMapModalOpen(false)}
        kind={importMapConfig.kind}
        fileName={importMapConfig.fileName}
        headers={importMapConfig.headers}
        rows={importMapConfig.rows}
        fields={importMapConfig.fields}
        initialMap={importMapConfig.initialMap}
        onShowReport={(kind, skippedRows) => {
          setImportReportConfig({ kind, skippedRows });
          setImportReportModalOpen(true);
        }}
      />
      <ImportReportModal
        isOpen={importReportModalOpen}
        onClose={() => setImportReportModalOpen(false)}
        kind={importReportConfig.kind}
        skippedRows={importReportConfig.skippedRows}
      />
      <Toast />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <IMSProvider>
        <MainApp />
      </IMSProvider>
    </ErrorBoundary>
  );
}
