import React, { useState } from 'react';
import { useIMS } from '../../context/IMSContext';
import { fmt, fmtDate, r2 } from '../../utils/formatters';
import {
  retInvTotal,
  deliverPct,
  returnSlipRemaining,
  returnSlipFulfillPct,
  deliveredOf,
  creditedOf,
} from '../../utils/calculations';
import { printDocument } from '../../utils/printService';
import { Plus, Printer, Edit2, Trash2, Link, Send } from 'lucide-react';
import type { ReturnSlip, ReturnInvoice } from '../../types';

interface ReturnsViewProps {
  onNewReturnSlip: () => void;
  onEditReturnSlip: (slip: ReturnSlip) => void;
  onAttachCreditNote: (slip: ReturnSlip) => void;
  onNewDeliveryForReturnSlip: (slip: ReturnSlip) => void;
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({
  onNewReturnSlip,
  onEditReturnSlip,
  onAttachCreditNote,
  onNewDeliveryForReturnSlip,
}) => {
  const { db, deleteReturnSlip, deleteReturnInvoice, sessionUser, t, canDelete, canEdit } = useIMS();
  const isDirectSale = db.settings.directSaleMode === true;
  const [slipFilter, setSlipFilter] = useState('');
  const [creditFilter, setCreditFilter] = useState('');

  const myReturnSlips = ((): ReturnSlip[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.returnSlips;
    return db.returnSlips.filter((s) => (sessionUser.branchIds || []).includes(s.branchId));
  })().slice().reverse();

  const myReturnInvoices = ((): ReturnInvoice[] => {
    if (!sessionUser || sessionUser.role === 'admin') return db.returnInvoices;
    return db.returnInvoices.filter((r) => (sessionUser.branchIds || []).includes(r.branchId));
  })().slice().reverse();

  const customerName = (id: string) => (db.customers.find((c) => c.id === id) || {}).name || '—';
  const itemName = (id: string) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const returnInvoiceById = (id?: string | null) =>
    id ? db.returnInvoices.find((x) => x.id === id) || null : null;
  const returnSlipById = (id?: string | null) =>
    id ? db.returnSlips.find((x) => x.id === id) || null : null;

  const sq = slipFilter.trim().toLowerCase();
  const filteredReturnSlips = sq
    ? myReturnSlips.filter((s) => {
        const no = (s.no || '').toLowerCase();
        const cust = customerName(s.customerId).toLowerCase();
        const date = (s.date || '').toLowerCase();
        const note = (s.note || '').toLowerCase();
        const crNo = returnInvoiceById(s.returnInvoiceId)?.no?.toLowerCase() || '';
        const hasItem = s.lines.some(
          (l) =>
            itemName(l.itemId || '').toLowerCase().includes(sq) ||
            (l.batchNo || '').toLowerCase().includes(sq)
        );
        return (
          no.includes(sq) ||
          cust.includes(sq) ||
          date.includes(sq) ||
          note.includes(sq) ||
          crNo.includes(sq) ||
          hasItem
        );
      })
    : myReturnSlips;

  const cq = creditFilter.trim().toLowerCase();
  const filteredReturnInvoices = cq
    ? myReturnInvoices.filter((r) => {
        const no = (r.no || '').toLowerCase();
        const cust = customerName(r.customerId).toLowerCase();
        const date = (r.date || '').toLowerCase();
        const note = (r.note || '').toLowerCase();
        const slipNo = returnSlipById(r.returnSlipId)?.no?.toLowerCase() || '';
        const hasItem = r.lines.some((l) =>
          itemName(l.itemId || '').toLowerCase().includes(cq)
        );
        return (
          no.includes(cq) ||
          cust.includes(cq) ||
          date.includes(cq) ||
          note.includes(cq) ||
          slipNo.includes(cq) ||
          hasItem
        );
      })
    : myReturnInvoices;

  return (
    <div className="space-y-4">
      {/* Return Slips */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
              <span>{t('Return Slips')}</span>
              <span className="text-xs font-normal text-slate-400 hidden sm:inline">
                {t('items physically back in stock')}
              </span>
            </h2>
          </div>
          <input
            type="text"
            value={slipFilter}
            onChange={(e) => setSlipFilter(e.target.value)}
            placeholder={t('Search slips / customer / item')}
            className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-full sm:w-64 bg-white"
          />
          <button
            type="button"
            onClick={onNewReturnSlip}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-1 shadow-md shadow-blue-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t('New Return Slip')}
          </button>
        </div>

        {/* Mobile Return Slips List */}
        <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
          {filteredReturnSlips.map((r) => {
            const matchingCreditNotes = (db.returnInvoices || []).filter((cr) => cr.returnSlipId === r.id);
            const matchingDels = (db.deliveries || []).filter((d) => d.returnSlipId === r.id);
            const totalRemaining = returnSlipRemaining(db, r);
            const isFullySettled = totalRemaining <= 0.005;
            const fulfillPct = returnSlipFulfillPct(db, r);
            const isFulfilled = fulfillPct >= 99.9;
            const delCount = r2(
              (r.lines || []).reduce(
                (a, l) => a + (l.itemId ? deliveredOf(db, r.id, l.itemId, null) : 0),
                0
              )
            );
            const crCount = r2(
              (r.lines || []).reduce(
                (a, l) => a + (l.itemId ? creditedOf(db, r.id, l.itemId, null) : 0),
                0
              )
            );

            return (
              <div key={r.id} className="p-3.5 space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900">{r.no}</span>
                      <span className="text-xs text-slate-500">{fmtDate(r.date)}</span>
                    </div>
                    <div className="font-semibold text-sm text-slate-900 mt-0.5">
                      {customerName(r.customerId)}
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isFullySettled || isFulfilled
                          ? 'bg-emerald-100 text-emerald-700'
                          : fulfillPct > 0
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {isFullySettled && delCount === 0 && crCount > 0 ? t('Credited') : `${fulfillPct}%`}
                    </span>
                    {(delCount > 0 || crCount > 0) && (
                      <span className="text-[10px] text-slate-400 mt-0.5">
                        {!isDirectSale && delCount > 0 ? `${delCount} ${t('del')}` : ''}
                        {!isDirectSale && delCount > 0 && crCount > 0 ? ' • ' : ''}
                        {crCount > 0 ? `${crCount} ${t('cr')}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-xs text-slate-600 bg-slate-50 rounded-lg px-2.5 py-2 break-words">
                  {r.lines.map((l) => `${itemName(l.itemId || '')} ×${l.qty}`).join(', ')}
                </div>

                <div className="text-xs">
                  <span className="text-slate-400 mr-1.5">{t('Credit Note')}:</span>
                  {matchingCreditNotes.length > 0 ? (
                    <span className="text-emerald-700 font-mono font-semibold">
                      {matchingCreditNotes.map((c) => c.no).join(', ')}
                      {!isFullySettled && (
                        <span className="ml-1.5 text-[10px] font-sans text-amber-600">
                          ({totalRemaining} {t('remaining')})
                        </span>
                      )}
                    </span>
                  ) : isFullySettled ? (
                    <span className="text-slate-600 font-medium">
                      {isDirectSale ? t('Settled') : t('Replaced by Delivery')}
                    </span>
                  ) : (
                    <span className="text-amber-600 font-medium">{t('not attached   balance unchanged')}</span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                  {!isDirectSale && !isFullySettled && (
                    <button
                      type="button"
                      onClick={() => onNewDeliveryForReturnSlip(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3 h-3" />
                      {t('Deliver')}
                    </button>
                  )}
                  {!isDirectSale && matchingDels.length > 0 && (
                    <button
                      type="button"
                      onClick={() => printDocument('delivery', matchingDels[matchingDels.length - 1], db)}
                      title={t('Print Latest Delivery Slip')}
                      className="px-2.5 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Slip')}
                    </button>
                  )}
                  {!isFullySettled && (
                    <button
                      type="button"
                      onClick={() => onAttachCreditNote(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Link className="w-3 h-3" />
                      {t('Attach Credit Note')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => printDocument('returnslip', r, db)}
                    className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Printer className="w-3 h-3" />
                    {t('Print')}
                  </button>
                  {canEdit('returns') && (
                    <button
                      type="button"
                      onClick={() => onEditReturnSlip(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      {t('Edit')}
                    </button>
                  )}
                  {canDelete('returns') && (
                    <button
                      type="button"
                      onClick={() => deleteReturnSlip(r)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      {t('Del')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {filteredReturnSlips.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              {t('No return slips recorded.')}
            </div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('No')}</th>
                <th className="text-left px-3 py-2.5">{t('Date')}</th>
                <th className="text-left px-3 py-2.5">{t('Customer')}</th>
                <th className="text-left px-3 py-2.5">{t('Lines')}</th>
                <th className="text-left px-3 py-2.5">{t('Credit Note')}</th>
                <th className="text-center px-3 py-2.5">{t('Fulfilment')}</th>
                <th className="text-right px-4 py-2.5">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReturnSlips.map((r) => {
                const matchingCreditNotes = (db.returnInvoices || []).filter((cr) => cr.returnSlipId === r.id);
                const matchingDels = (db.deliveries || []).filter((d) => d.returnSlipId === r.id);
                const totalRemaining = returnSlipRemaining(db, r);
                const isFullySettled = totalRemaining <= 0.005;
                const fulfillPct = returnSlipFulfillPct(db, r);
                const isFulfilled = fulfillPct >= 99.9;
                const delCount = r2(
                  (r.lines || []).reduce(
                    (a, l) => a + (l.itemId ? deliveredOf(db, r.id, l.itemId, null) : 0),
                    0
                  )
                );
                const crCount = r2(
                  (r.lines || []).reduce(
                    (a, l) => a + (l.itemId ? creditedOf(db, r.id, l.itemId, null) : 0),
                    0
                  )
                );

                return (
                  <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                      {r.no}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(r.date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {customerName(r.customerId)}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {r.lines.map((l) => `${itemName(l.itemId || '')} ×${l.qty}`).join(', ')}
                    </td>
                    <td className="px-3 py-2.5 text-xs">
                      {matchingCreditNotes.length > 0 ? (
                        <div className="flex flex-col">
                          <span className="text-emerald-700 font-mono font-semibold">
                            {matchingCreditNotes.map((c) => c.no).join(', ')}
                          </span>
                          {!isFullySettled && (
                            <span className="text-[10px] text-amber-600 font-medium">
                              {totalRemaining} {t('remaining')}
                            </span>
                          )}
                        </div>
                      ) : isFullySettled ? (
                        <span className="text-slate-500 font-medium bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                          {isDirectSale ? t('Settled') : t('Replaced by Delivery')}
                        </span>
                      ) : (
                        <span className="text-amber-600 font-medium">
                          {t('not attached   balance unchanged')}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <div className="flex flex-col items-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            isFullySettled || isFulfilled
                              ? 'bg-emerald-100 text-emerald-700'
                              : fulfillPct > 0
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                          title={!isDirectSale ? `${delCount} ${t('del')}, ${crCount} ${t('cr')}` : `${crCount} ${t('cr')}`}
                        >
                          {isFullySettled && delCount === 0 && crCount > 0
                            ? t('Credited')
                            : `${fulfillPct}%`}
                        </span>
                        {((!isDirectSale && delCount > 0) || crCount > 0) && (
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            {!isDirectSale && delCount > 0 ? `${delCount} ${t('del')}` : ''}
                            {!isDirectSale && delCount > 0 && crCount > 0 ? ' • ' : ''}
                            {crCount > 0 ? `${crCount} ${t('cr')}` : ''}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                      {!isDirectSale && !isFullySettled && (
                        <button
                          type="button"
                          onClick={() => onNewDeliveryForReturnSlip(r)}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          {t('Deliver')}
                        </button>
                      )}
                      {!isDirectSale && matchingDels.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            printDocument('delivery', matchingDels[matchingDels.length - 1], db);
                          }}
                          title={t('Print Latest Delivery Slip')}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Printer className="w-3 h-3" />
                          {t('Slip')}
                        </button>
                      )}
                      {!isFullySettled && (
                        <button
                          type="button"
                          onClick={() => onAttachCreditNote(r)}
                          className="text-emerald-700 hover:text-emerald-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Link className="w-3 h-3" />
                          {t('Attach Credit Note')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => printDocument('returnslip', r, db)}
                        className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        {t('Print')}
                      </button>
                      {canEdit('returns') && (
                        <button
                          type="button"
                          onClick={() => onEditReturnSlip(r)}
                          className="text-slate-600 hover:text-slate-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                          {t('Edit')}
                        </button>
                      )}
                      {canDelete('returns') && (
                        <button
                          type="button"
                          onClick={() => deleteReturnSlip(r)}
                          className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                        >
                          {t('Del')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {filteredReturnSlips.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                    {t('No return slips recorded.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credit Notes */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex-1 min-w-[200px]">
            <h2 className="font-bold text-base md:text-lg text-slate-900 flex items-baseline gap-2">
              <span>{t('Credit Notes')}</span>
              <span className="text-xs font-normal text-slate-400 hidden sm:inline">
                {t('reduces the customer receivable balance')}
              </span>
            </h2>
          </div>
          <input
            type="text"
            value={creditFilter}
            onChange={(e) => setCreditFilter(e.target.value)}
            placeholder={t('Search credit notes / customer')}
            className="border border-slate-300 rounded-xl px-3 py-1.5 text-xs sm:text-sm w-full sm:w-64 bg-white"
          />
        </div>

        {/* Mobile Credit Notes List */}
        <div className="md:hidden border border-slate-200 rounded-xl divide-y divide-slate-200 overflow-hidden bg-white">
          {filteredReturnInvoices.map((r) => (
            <div key={r.id} className="p-3.5 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{r.no}</span>
                    <span className="text-xs text-slate-500">{fmtDate(r.date)}</span>
                  </div>
                  <div className="font-semibold text-sm text-slate-900 mt-0.5">
                    {customerName(r.customerId)}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {t('From Slip')}: <span className="font-mono">{returnSlipById(r.returnSlipId)?.no || '—'}</span>
                  </div>
                </div>
                <div className="font-bold text-sm text-emerald-700 tabular-nums shrink-0">
                  - {fmt(retInvTotal(r))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
                <button
                  type="button"
                  onClick={() => printDocument('returninvoice', r, db)}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Printer className="w-3 h-3" />
                  {t('Print')}
                </button>
                {canDelete('returns') && (
                  <button
                    type="button"
                    onClick={() => deleteReturnInvoice(r)}
                    className="px-2.5 py-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                    {t('Del')}
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredReturnInvoices.length === 0 && (
            <div className="p-8 text-center text-slate-400 text-sm">
              {t('No credit notes recorded.')}
            </div>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="text-[11px] text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-3 py-2.5">{t('No')}</th>
                <th className="text-left px-3 py-2.5">{t('Date')}</th>
                <th className="text-left px-3 py-2.5">{t('Customer')}</th>
                <th className="text-left px-3 py-2.5">{t('From Slip')}</th>
                <th className="text-center px-3 py-2.5">{t('Credit')}</th>
                <th className="text-right px-4 py-2.5">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredReturnInvoices.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-xs font-semibold text-slate-900">
                    {r.no}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-slate-500">{fmtDate(r.date)}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {customerName(r.customerId)}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                    {returnSlipById(r.returnSlipId)?.no || '—'}
                  </td>
                  <td className="text-center py-2.5 font-bold text-emerald-700">
                    - {fmt(retInvTotal(r))}
                  </td>
                  <td className="px-4 py-2.5 text-right whitespace-nowrap text-xs space-x-2">
                    <button
                      type="button"
                      onClick={() => printDocument('returninvoice', r, db)}
                      className="text-blue-600 hover:text-blue-800 font-semibold hover:underline inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      <Printer className="w-3 h-3" />
                      {t('Print')}
                    </button>
                    {canDelete('returns') && (
                      <button
                        type="button"
                        onClick={() => deleteReturnInvoice(r)}
                        className="text-rose-600 hover:text-rose-800 font-semibold hover:underline cursor-pointer"
                      >
                        {t('Del')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {filteredReturnInvoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400 text-sm">
                    {t('No credit notes recorded.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
