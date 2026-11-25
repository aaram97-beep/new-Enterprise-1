import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, diffDays, todayStr } from '../../utils/formatters';
import { custBalance } from '../../utils/calculations';
import { exportCSV } from '../../utils/exportImport';
import { Plus, Download, ArrowUpRight, Edit2, Trash2 } from 'lucide-react';
import type { Customer } from '../../types';

interface CustomersViewProps {
  onNewCustomer: () => void;
  onEditCustomer: (cust: Customer) => void;
  onOpenLedger: (customerId: string) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  onNewCustomer,
  onEditCustomer,
  onOpenLedger,
}) => {
  const { db, saveCustomer, deleteCustomer, audit, t, canDelete, canEdit, canAccess } = useIMS();
  const canLedger = canAccess('ledger');
  const [search, setSearch] = useState('');
  const today = todayStr();

  const q = search.trim().toLowerCase();
  let list = db.customers;
  if (q) {
    list = list.filter((c) =>
      `${c.name} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(q)
    );
  }

  const handleProviderToggle = (c: Customer) => {
    const updated = { ...c, isProvider: !c.isProvider };
    saveCustomer(updated);
    audit(
      'Account updated',
      `${c.name}${updated.isProvider ? '   provider enabled' : '   provider disabled'}`
    );
  };

  const handleExport = () => {
    exportCSV(
      'customer-balances',
      db.customers.map((c) => {
        const pays = db.payments.filter((p) => p.customerId === c.id && p.dir !== 'out');
        const lastPay = pays.length ? pays.map((p) => p.date).sort().pop() : '';
        return {
          name: c.name,
          phone: c.phone,
          address: c.address,
          provider: c.isProvider ? 'yes' : 'no',
          openingBalance: c.openingBalance || 0,
          currentBalance: custBalance(db, c),
          lastPayment: lastPay,
          daysSinceLastPayment: lastPay ? diffDays(today, lastPay) : '',
        };
      })
    );
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-2 md:gap-3">
        <h2 className="font-bold text-base md:text-lg text-slate-900 flex-1">
          {t('Customers & Providers')}
        </h2>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search name / phone')}
          className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-full sm:w-48 bg-white"
        />
        {canEdit('customers') && (
          <button
            type="button"
            onClick={onNewCustomer}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('New Account')}
          </button>
        )}
        <button
          type="button"
          onClick={handleExport}
          title="Export CSV"
          className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs sm:text-sm flex items-center justify-center cursor-pointer shadow-md shadow-emerald-500/20"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Customers List */}
      <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
        {list.map((c) => {
          const bal = custBalance(db, c);
          return (
            <div key={c.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 break-words">{c.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.phone || '—'}</div>
                  {c.address && (
                    <div className="text-xs text-slate-400 break-words">{c.address}</div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase text-slate-400">{t('Balance')}</div>
                  <div
                    className={`font-bold text-sm tabular-nums ${
                      bal > 0.005 ? 'text-rose-600' : bal < -0.005 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {fmt(bal)}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-2.5 py-1.5">
                <span className="text-slate-600 font-medium">{t('Provider')}</span>
                <input
                  type="checkbox"
                  checked={c.isProvider}
                  disabled={!canEdit('customers')}
                  onChange={() => handleProviderToggle(c)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                />
              </div>

              {(canLedger || canEdit('customers') || canDelete('customers')) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  {canLedger && (
                    <button
                      type="button"
                      onClick={() => onOpenLedger(c.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      {t('Ledger')}
                      <ArrowUpRight className="w-3 h-3" />
                    </button>
                  )}
                  {canEdit('customers') && (
                    <button
                      type="button"
                      onClick={() => onEditCustomer(c)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {t('Edit')}
                    </button>
                  )}
                  {canDelete('customers') && (
                    <button
                      type="button"
                      onClick={() => deleteCustomer(c)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('Del')}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {list.length === 0 && (
          <div className="p-8 text-center text-slate-400 text-sm">No accounts found.</div>
        )}
      </div>

      <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-sm">
          <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-left px-3 py-2.5">{t('Name')}</th>
              <th className="text-left px-3 py-2.5">{t('Phone')}</th>
              <th className="text-left px-3 py-2.5">{t('Address')}</th>
              <th className="text-center px-3 py-2.5">{t('Provider')}</th>
              <th className="text-center px-3 py-2.5">{t('Balance')}</th>
              <th className="text-right px-4 py-2.5">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map((c) => {
              const bal = custBalance(db, c);
              return (
                <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-medium text-slate-900">{c.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{c.phone || '—'}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-500 max-w-xs truncate">
                    {c.address || '—'}
                  </td>
                  <td className="text-center py-2.5">
                    <input
                      type="checkbox"
                      checked={c.isProvider}
                      disabled={!canEdit('customers')}
                      onChange={() => handleProviderToggle(c)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>
                  <td
                    className={`text-center py-2.5 font-bold ${
                      bal > 0.005 ? 'text-rose-600' : bal < -0.005 ? 'text-amber-600' : 'text-slate-500'
                    }`}
                  >
                    {fmt(bal)}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    {canLedger && (
                      <button
                        type="button"
                        onClick={() => onOpenLedger(c.id)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        {t('Ledger')}
                        <ArrowUpRight className="w-3 h-3" />
                      </button>
                    )}
                    {canEdit('customers') && (
                      <button
                        type="button"
                        onClick={() => onEditCustomer(c)}
                        className="text-slate-600 hover:text-slate-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        {t('Edit')}
                      </button>
                    )}
                    {canDelete('customers') && (
                      <button
                        type="button"
                        onClick={() => deleteCustomer(c)}
                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Del')}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">
                  No accounts found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
