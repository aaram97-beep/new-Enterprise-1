import type { DatabaseSchema } from '../types';
import { esc, fmt, fmtDate, todayStr, r2 } from './formatters';
import {
  invoiceTotal,
  paidOfInvoice,
  invBalance,
  deliverPct,
  lineNet,
  deliveredOf,
  retInvTotal,
  intakeTotal,
  paidToIntake,
  intakeBalance,
  custBalance,
  custDiscountTotal,
} from './calculations';
import { getGlobalTrackFlags } from './tracking';
import { tx } from './translations';

export function prHead(db: DatabaseSchema, title: string, doc: { no?: string; date?: string }) {
  const s = db.settings;
  return `
    <div class="head">
      <div>
        ${s.logo ? `<img class="logo" src="${s.logo}" alt="logo">` : ''}
        <div class="brand">${esc(s.companyName)}</div>
        <div class="muted">${esc(s.address)}${s.phone ? '<br>' + esc(s.phone) : ''}</div>
      </div>
      <div class="doc-title-box">
        <h1>${esc(title)}</h1>
        <div class="muted">${esc(doc.no || '')}</div>
        <div class="muted">${esc(doc.date || '')}</div>
      </div>
    </div>
  `;
}

export function prCustomerBox(db: DatabaseSchema, id: string, label = 'Customer') {
  const c = db.customers.find((x) => x.id === id);
  return `
    <div class="box">
      <div class="lbl">${esc(label)}</div>
      <b>${esc(c ? c.name : '—')}</b>
      <div>${esc(c ? c.phone || '' : '')}</div>
      <div>${esc(c ? c.address || '' : '')}</div>
    </div>
  `;
}

export function prFoot(db: DatabaseSchema, text: string) {
  const s = db.settings;
  return `
    <div class="foot">
      ${esc(text || '')}${s.currency ? ' • Amounts in ' + esc(s.currency) : ''}
    </div>
  `;
}

export function getStandalonePrintHtml(bodyHtml: string, title = 'Enterprise IMS Document', lang = 'en'): string {
  const dir = lang === 'ar' ? 'rtl' : 'ltr';
  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page { margin: 12mm 15mm; size: A4 portrait; }
    *, *::before, *::after { box-sizing: border-box; }
    body { font-family: 'Inter', 'Cairo', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11.5px; line-height: 1.45; color: #0f172a; background: #fff; margin: 0; padding: 20px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .pr-a4 { width: 100%; max-width: 100%; margin: 0 auto; box-sizing: border-box; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
    .head > div { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }
    .brand { font-size: 20px; font-weight: 800; letter-spacing: -0.3px; color: #0f172a; line-height: 1.2; }
    .muted { color: #64748b; font-size: 11px; line-height: 1.4; margin-top: 3px; }
    .doc-title-box { text-align: end; flex-shrink: 0; max-width: 45%; }
    h1 { font-size: 20px; font-weight: 800; letter-spacing: 0.5px; text-transform: uppercase; color: #0f172a; margin: 0 0 4px 0; line-height: 1.2; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; margin-bottom: 12px; font-size: 11.5px; }
    th { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 8px; text-align: start; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #334155; white-space: nowrap; overflow-wrap: normal; word-break: normal; }
    td { border: 1px solid #cbd5e1; padding: 4px 8px; vertical-align: middle; color: #1e293b; overflow-wrap: break-word; word-break: normal; }
    .nowrap { white-space: nowrap; }
    .num { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .pr-table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    @media screen and (max-width: 640px) {
      body { padding: 12px; }
      th, td { padding: 4px 6px; font-size: 11px; }
      .meta { flex-direction: column; gap: 10px; }
      .head { gap: 10px; }
      .doc-title-box { max-width: 55%; }
    }
    @media print {
      .pr-table-wrap { overflow: visible; }
    }
    .tot-container { display: flex; justify-content: flex-end; margin-top: 8px; margin-bottom: 16px; }
    [dir="rtl"] .tot-container { justify-content: flex-start; }
    table.tot { width: auto; min-width: 260px; max-width: 100%; margin: 0; border: none; }
    table.tot td { border: none; padding: 2px 8px; font-size: 11.5px; }
    table.tot .tot-label { text-align: start; color: #475569; font-weight: 500; }
    table.tot .grand td { border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; font-weight: 800; font-size: 13.5px; color: #0f172a; padding-top: 4px; padding-bottom: 4px; }
    .meta { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; margin-bottom: 16px; }
    .meta .box, .box { min-width: 0; overflow-wrap: break-word; word-break: normal; }
    .meta .box { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; background: #f8fafc; font-size: 11.5px; line-height: 1.5; }
    .meta .box .lbl { font-size: 10px; text-transform: uppercase; color: #64748b; letter-spacing: 0.8px; font-weight: 700; margin-bottom: 4px; }
    .foot { margin-top: 24px; font-size: 10.5px; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; page-break-inside: avoid; overflow-wrap: break-word; }
    .sign { margin-top: 32px; display: flex; justify-content: space-between; gap: 32px; font-size: 11px; page-break-inside: avoid; }
    .sign div { flex: 1; max-width: 220px; border-top: 1px solid #475569; padding-top: 6px; text-align: center; color: #334155; font-weight: 500; }
    .logo { max-height: 60px; max-width: 180px; margin-bottom: 6px; object-fit: contain; }
    table.report-table th, table.report-table td { border: 1px solid #cbd5e1; padding: 4px 8px; vertical-align: middle; }
    table.report-table tr.section-header td { background: #f1f5f9; font-weight: 700; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
    table.report-table tr.subtotal td { background: #f8fafc; font-weight: 700; border-top: 1.5px solid #94a3b8; }
    table.report-table tr.grand td { background: #f1f5f9; border-top: 2px solid #0f172a; border-bottom: 2px solid #0f172a; font-weight: 800; font-size: 13px; }
    th.current-del-col, td.current-del-col { background-color: #e0f2fe !important; color: #0369a1 !important; font-weight: 700; border-left: 1.5px solid #0284c7 !important; border-right: 1.5px solid #0284c7 !important; }
    th.current-del-col { border-top: 1.5px solid #0284c7 !important; background-color: #bae6fd !important; }
    tr:last-child td.current-del-col { border-bottom: 1.5px solid #0284c7 !important; }
    table.progressive-del-table { width: 100% !important; max-width: 100% !important; table-layout: auto !important; box-sizing: border-box !important; }
    th.col-vertical { height: auto; min-height: 95px; width: 1%; min-width: 42px; vertical-align: bottom !important; text-align: center !important; padding: 6px 4px !important; white-space: normal; }
    th.th-items { vertical-align: bottom !important; text-align: start !important; padding: 8px 8px !important; font-size: 10.5px; font-weight: 700; width: auto; min-width: 120px; white-space: normal; }
    .rot-90 { writing-mode: vertical-rl; text-orientation: mixed; white-space: normal; overflow-wrap: anywhere; word-break: break-word; display: inline-block; font-size: 9px; font-weight: 700; line-height: 1.25; letter-spacing: 0.2px; text-align: start; }
  </style>
</head>
<body>
  <div class="pr-a4" dir="${dir}">
    ${bodyHtml}
  </div>
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() {
        try { window.print(); } catch(e) {}
      }, 250);
    });
  </script>
</body>
</html>`;
}

export function triggerNativePrint(htmlContent?: string, lang = 'en') {
  // Method 1: Try printing via an isolated hidden iframe (often allowed where parent iframe is restricted)
  try {
    let printIframe = document.getElementById('ims-print-iframe') as HTMLIFrameElement;
    if (!printIframe) {
      printIframe = document.createElement('iframe');
      printIframe.id = 'ims-print-iframe';
      printIframe.style.position = 'fixed';
      printIframe.style.right = '0';
      printIframe.style.bottom = '0';
      printIframe.style.width = '0';
      printIframe.style.height = '0';
      printIframe.style.border = '0';
      document.body.appendChild(printIframe);
    }
    const doc = printIframe.contentDocument || printIframe.contentWindow?.document;
    if (doc) {
      const content = htmlContent || document.getElementById('print-root')?.innerHTML || '';
      doc.open();
      doc.write(getStandalonePrintHtml(content, 'Print Document', lang));
      doc.close();
      setTimeout(() => {
        try {
          printIframe.contentWindow?.focus();
          printIframe.contentWindow?.print();
        } catch {
          window.print();
        }
      }, 150);
      return;
    }
  } catch {
    // ignore and fallback
  }

  // Method 2: Fallback to standard window.print()
  try {
    window.print();
  } catch {
    // ignore
  }
}

export function openInNewTabAndPrint(htmlContent: string, title = 'Document', lang = 'en') {
  const fullHtml = getStandalonePrintHtml(htmlContent, title, lang);
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadPrintHtml(htmlContent: string, filename = 'document.html', title = 'Document', lang = 'en') {
  const fullHtml = getStandalonePrintHtml(htmlContent, title, lang);
  const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function printHtml(html: string, title = 'Document', docRef = '', lang = 'en') {
  // 1. Update native #print-root
  const root = document.getElementById('print-root');
  if (root) {
    root.innerHTML = `<div class="pr-a4">${html}</div>`;
  }

  // 2. Open directly in a new tab for print
  if (typeof window !== 'undefined') {
    openInNewTabAndPrint(html, title, lang);
  }
}

export function generateDocumentHtml(type: string, doc: any, db: DatabaseSchema): { html: string; docTitle: string; docRef: string } {
  const lang = db.settings.lang || 'en';
  const itemName = (id: string | null) => (db.items.find((i) => i.id === id) || {}).name || '—';
  const branchName = (id: string | null) => (db.branches.find((b) => b.id === id) || {}).name || '—';

  let html = '';
  let docTitle = 'Document';
  const docRef = doc?.no || '';
  if (type === 'invoice') {
    docTitle = 'Invoice';
    const inv = doc;
    const isDirectSale = db.settings.directSaleMode === true;
    const delivered = isDirectSale ? 100 : deliverPct(db, inv);
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Discount</th><th class="num">Net</th></tr></thead><tbody>`;
    inv.lines.forEach((l: any) => {
      const d = l.discType === 'pct' ? `${r2(l.discVal)}%` : fmt(l.discVal);
      t += `<tr><td>${esc(itemName(l.itemId))}</td><td class="num">${l.qty}</td><td class="num">${fmt(l.price)}</td><td class="num">${d}</td><td class="num">${fmt(lineNet(l))}</td></tr>`;
    });
    t += `</tbody></table></div>`;
    let tot = `
    <div class="tot-container">
      <table class="tot">
        <tr><td class="tot-label">Subtotal</td><td class="num">${fmt(inv.sub)}</td></tr>`;
    if (r2(inv.discAmt) > 0) {
      tot += `<tr><td class="tot-label">Order discount (${inv.orderDiscType === 'pct' ? r2(inv.orderDiscVal) + '%' : 'fixed'})</td><td class="num">- ${fmt(inv.discAmt)}</td></tr>`;
    }
    if (r2(inv.tax) > 0) {
      tot += `<tr><td class="tot-label">Tax</td><td class="num">${fmt(inv.tax)}</td></tr>`;
    }
    tot += `<tr class="grand"><td class="tot-label">TOTAL</td><td class="num">${fmt(inv.total)}</td></tr>`;
    tot += `<tr><td class="tot-label muted">Paid</td><td class="num muted">${fmt(paidOfInvoice(db, inv))}</td></tr>`;
    tot += `<tr><td class="tot-label"><b>Balance Due</b></td><td class="num"><b>${fmt(invBalance(db, inv))}</b></td></tr>`;
    if (!isDirectSale) {
      tot += `<tr><td class="tot-label muted">Delivered</td><td class="num muted">${delivered}%</td></tr>`;
    }
    tot += `
      </table>
    </div>`;

    html =
      prHead(db, 'Invoice', inv) +
      `<div class="meta">${prCustomerBox(db, inv.customerId)}` +
      `<div class="box"><div class="lbl">Details</div>Branch: ${esc(branchName(inv.branchId))}` +
      `<div>Lines: ${inv.lines.length}</div>${!isDirectSale ? `<div>Delivered: ${delivered}%</div>` : ''}</div></div>` +
      t +
      tot +
      (inv.note ? `<div class="box" style="margin-top:10px;margin-bottom:12px;font-size:11px;background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;"><b>Note:</b> ${esc(inv.note)}</div>` : '') +
      `<div class="sign"><div>Customer signature</div><div>Authorized signature</div></div>` +
      prFoot(
        db,
        isDirectSale
          ? 'Invoice • stock deducted on invoice.'
          : 'Invoice • payment due in full whether goods are delivered or not.'
      );
  } else if (type === 'delivery') {
    docTitle = 'Delivery Slip';
    const d = doc;
    const inv = d.invoiceId ? db.invoices.find((x) => x.id === d.invoiceId) : null;
    const retSlip = d.returnSlipId ? db.returnSlips.find((x) => x.id === d.returnSlipId) : null;
    const sourceDoc = inv || retSlip;
    const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>${tx('Item', lang)}</th>${trackLot ? `<th>${tx('Batch', lang)}</th>` : ''}${trackExpiry ? `<th>${tx('Expiry', lang)}</th>` : ''}<th class="num">${tx('Qty', lang)}</th></tr></thead><tbody>`;
    d.lines.forEach((l: any) => {
      t += `<tr><td>${esc(itemName(l.itemId))}</td>${trackLot ? `<td class="nowrap">${esc(l.batchNo || '—')}</td>` : ''}${trackExpiry ? `<td class="nowrap">${esc(l.expiry ? fmtDate(l.expiry) : '—')}</td>` : ''}<td class="num font-semibold">${l.qty}</td></tr>`;
    });
    t += `</tbody></table></div>`;

    // Progressive Fulfillment Table matching user specifications:
    // Shows returned list when attached to a return slip, or invoiced list when attached to an invoice.
    const existingDeliveries = (db.deliveries || []).filter(
      (x) =>
        (inv && x.invoiceId === inv.id && x.id !== d.id) ||
        (retSlip && x.returnSlipId === retSlip.id && x.id !== d.id)
    );
    const allDeliveries = [...existingDeliveries, d];
    allDeliveries.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.no || '').localeCompare(b.no || ''));
    const displayedDeliveries = allDeliveries;

    // Distinct items from source document (and any in this delivery)
    const sourceItems: { itemId: string; sourceQty: number }[] = [];
    if (sourceDoc) {
      sourceDoc.lines.forEach((l: any) => {
        if (!l.itemId) return;
        const found = sourceItems.find((x) => x.itemId === l.itemId);
        if (found) {
          found.sourceQty = r2(found.sourceQty + (+l.qty || 0));
        } else {
          sourceItems.push({ itemId: l.itemId, sourceQty: r2(+l.qty || 0) });
        }
      });
    }
    (d.lines || []).forEach((l: any) => {
      if (!l.itemId) return;
      if (!sourceItems.some((x) => x.itemId === l.itemId)) {
        sourceItems.push({ itemId: l.itemId, sourceQty: 0 });
      }
    });

    // Helper to format slip reference without branch information
    const cleanDelNo = (no: string | undefined | null) => {
      if (!no) return '';
      const withoutBranch = no.replace(/-BR\d+-/i, '-').replace(/-B\d+-/i, '-');
      return withoutBranch.replace(/^DEL-/, '#');
    };

    const cleanCrNo = (no: string | undefined | null) => {
      if (!no) return '';
      const withoutBranch = no.replace(/-BR\d+-/i, '-').replace(/-B\d+-/i, '-');
      return withoutBranch.replace(/^RIN-/, 'CR#');
    };

    const attachedCreditNotes = retSlip
      ? (db.returnInvoices || [])
          .filter((cr) => cr.returnSlipId === retSlip.id)
          .sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.no || '').localeCompare(b.no || ''))
      : [];

    let rem = '';
    if (sourceDoc && sourceItems.length > 0) {
      const remTableTitle = retSlip
        ? `${tx('Remaining to fulfil return slip', lang)} ${esc(retSlip.no || '')}`
        : `${tx('Remaining to fulfil invoice', lang)} ${esc((inv || {}).no || '')}`;
      const qtyColLabel = retSlip ? tx('Returned amount', lang) : tx('Invoiced amount', lang);

      rem = `
        <div style="font-weight:700;font-size:11px;color:#334155;text-transform:uppercase;letter-spacing:0.5px;margin-top:20px;margin-bottom:6px;">
          ${remTableTitle}
        </div>
        <div class="pr-table-wrap">
        <table class="report-table progressive-del-table" style="margin-top:4px;margin-bottom:12px;table-layout:auto;width:100%;max-width:100%;box-sizing:border-box;">
          <thead>
            <tr>
              <th class="th-items" style="vertical-align:bottom;text-align:start;padding:8px 8px;font-size:10.5px;font-weight:700;min-width:120px;">${tx('Items', lang)}</th>
              <th class="num col-vertical" style="width:1%;min-width:42px;padding:6px 4px;"><span class="rot-90 font-bold">${qtyColLabel}</span></th>
              ${displayedDeliveries
                .map((del) => {
                  const isCurrent = del.id === d.id;
                  const delRef = cleanDelNo(del.no);
                  const formattedDate = fmtDate(del.date);

                  if (isCurrent) {
                    return `<th class="num col-vertical current-del-col" style="width:1%;min-width:42px;padding:6px 4px;background:#bae6fd;color:#0369a1;border:1.5px solid #0284c7;">
                      <span class="rot-90 font-bold" style="color:#0369a1;">${delRef ? `${delRef} ` : ''}${tx('This Slip', lang)}<br>${formattedDate}</span>
                    </th>`;
                  }
                  return `<th class="num col-vertical" style="width:1%;min-width:42px;padding:6px 4px;background:#f8fafc;color:#334155;">
                    <span class="rot-90">${delRef ? `${delRef}<br>` : ''}${formattedDate}</span>
                  </th>`;
                })
                .join('')}
              ${attachedCreditNotes
                .map((cr) => {
                  const crRef = cleanCrNo(cr.no);
                  const formattedDate = fmtDate(cr.date);
                  return `<th class="num col-vertical" style="width:1%;min-width:42px;padding:6px 4px;background:#ecfdf5;color:#047857;border-inline:1px solid #a7f3d0;">
                    <span class="rot-90 font-bold" style="color:#047857;">${crRef ? `${crRef} ` : ''}(${tx('Credit', lang)})<br>${formattedDate}</span>
                  </th>`;
                })
                .join('')}
              <th class="num col-vertical" style="width:1%;min-width:42px;padding:6px 4px;background:#f1f5f9;color:#0f172a;"><span class="rot-90 font-bold">${tx('Remaining amount', lang)}</span></th>
            </tr>
          </thead>
          <tbody>
      `;

      sourceItems.forEach((it) => {
        rem += `<tr>
          <td style="font-weight:500;padding:2.5px 8px;">${esc(itemName(it.itemId))}</td>
          <td class="num font-semibold" style="padding:2.5px 4px;">${it.sourceQty}</td>`;

        let totalDeliveredAcrossAll = 0;
        displayedDeliveries.forEach((del) => {
          const qtyInThisDel = (del.lines || [])
            .filter((l: any) => l.itemId === it.itemId)
            .reduce((sum: number, l: any) => sum + (+l.qty || 0), 0);
          totalDeliveredAcrossAll = r2(totalDeliveredAcrossAll + qtyInThisDel);
          const isCurrent = del.id === d.id;

          if (isCurrent) {
            rem += `<td class="num current-del-col" style="background:#e0f2fe;color:#0369a1;border-inline:1.5px solid #0284c7;font-weight:700;padding:2.5px 4px;">${qtyInThisDel > 0 ? qtyInThisDel : '0'}</td>`;
          } else {
            rem += `<td class="num font-medium" style="color:#334155;padding:2.5px 4px;">${qtyInThisDel > 0 ? qtyInThisDel : '0'}</td>`;
          }
        });

        let totalCreditedAcrossAll = 0;
        attachedCreditNotes.forEach((cr) => {
          const qtyInThisCr = (cr.lines || [])
            .filter((l: any) => l.itemId === it.itemId)
            .reduce((sum: number, l: any) => sum + (+l.qty || 0), 0);
          totalCreditedAcrossAll = r2(totalCreditedAcrossAll + qtyInThisCr);
          rem += `<td class="num font-semibold" style="color:#047857;background:#f0fdf4;padding:2.5px 4px;">${qtyInThisCr > 0 ? `-${qtyInThisCr}` : '0'}</td>`;
        });

        const remaining = Math.max(0, r2(it.sourceQty - totalDeliveredAcrossAll - totalCreditedAcrossAll));
        const remCell = remaining <= 0.005 ? '0' : remaining;
        const remStyle = remaining <= 0.005 ? 'color:#15803d;font-weight:600;' : 'color:#b91c1c;font-weight:700;';
        rem += `<td class="num font-bold" style="${remStyle}padding:2.5px 4px;">${remCell}</td></tr>`;
      });

      rem += `</tbody></table></div>`;
    }

    const docBoxLabel = retSlip ? 'Return Slip' : 'Invoice';
    const docBoxNo = retSlip ? retSlip.no : (inv || {}).no || '—';

    html =
      prHead(db, 'Delivery Slip', d) +
      `<div class="meta">${prCustomerBox(db, d.customerId)}` +
      `<div class="box"><div class="lbl">${docBoxLabel}</div><b>${esc(docBoxNo)}</b>` +
      `<div>Branch: ${esc(branchName(d.branchId))}</div><div>Stock deducted on dispatch.</div>${d.note ? '<div><b>Note:</b> ' + esc(d.note) + '</div>' : ''}</div></div>` +
      t +
      rem +
      (d.note ? `<div class="box" style="margin-top:10px;margin-bottom:12px;font-size:11px;background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;"><b>Note:</b> ${esc(d.note)}</div>` : '') +
      `<div class="sign"><div>Received by (customer)</div><div>Dispatched by</div></div>` +
      prFoot(
        db,
        retSlip
          ? 'Goods dispatched as replacement for returned items. Remaining items stay owed to the customer.'
          : 'Goods received in good condition. Remaining items stay owed to the customer.'
      );
  } else if (type === 'returnslip') {
    docTitle = 'Return Slip';
    const r = doc;
    const { trackLot } = getGlobalTrackFlags(db.settings);
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>${tx('Item', lang)}</th>${trackLot ? `<th>${tx('Batch', lang)}</th>` : ''}<th class="num">${tx('Qty', lang)}</th></tr></thead><tbody>`;
    r.lines.forEach((l: any) => {
      t += `<tr><td>${esc(itemName(l.itemId))}</td>${trackLot ? `<td class="nowrap">${esc(l.batchNo || '—')}</td>` : ''}<td class="num">${l.qty}</td></tr>`;
    });
    t += `</tbody></table></div>`;

    html =
      prHead(db, 'Return Slip', r) +
      `<div class="meta">${prCustomerBox(db, r.customerId)}` +
      `<div class="box"><div class="lbl">Status</div>Branch: ${esc(branchName(r.branchId))}` +
      `<div>${
        r.returnInvoiceId
          ? 'Settled via credit note ' + esc((db.returnInvoices.find((x) => x.id === r.returnInvoiceId) || {}).no || '')
          : 'Awaiting credit note • balance unchanged'
      }</div></div></div>` +
      t +
      (r.note ? `<p><b>Note:</b> ${esc(r.note)}</p>` : '') +
      `<div class="sign"><div>Returned by (customer)</div><div>Warehouse received</div></div>` +
      prFoot(db, 'Items physically returned to stock.');
  } else if (type === 'returninvoice') {
    docTitle = 'Credit Note';
    const r = doc;
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit Price</th><th class="num">Credit</th></tr></thead><tbody>`;
    r.lines.forEach((l: any) => {
      t += `<tr><td>${esc(itemName(l.itemId))}</td><td class="num">${l.qty}</td><td class="num">${fmt(l.price)}</td><td class="num">${fmt(r2((+l.qty || 0) * (+l.price || 0)))}</td></tr>`;
    });
    t += `</tbody></table></div>`;
    let tot = `
    <div class="tot-container">
      <table class="tot">
        <tr class="grand"><td class="tot-label">TOTAL CREDIT</td><td class="num">- ${fmt(retInvTotal(r))}</td></tr>
      </table>
    </div>`;

    html =
      prHead(db, 'Credit Note', r) +
      `<div class="meta">${prCustomerBox(db, r.customerId)}` +
      `<div class="box"><div class="lbl">From slip</div><b>${esc((db.returnSlips.find((x) => x.id === r.returnSlipId) || {}).no || '—')}</b><div>Balance reduced by ${fmt(retInvTotal(r))}</div>${r.note ? '<div><b>Note:</b> ' + esc(r.note) + '</div>' : ''}</div></div>` +
      t +
      tot +
      (r.note ? `<div class="box" style="margin-top:10px;margin-bottom:12px;font-size:11px;background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;"><b>Note:</b> ${esc(r.note)}</div>` : '') +
      `<div class="sign"><div>Customer</div><div>Authorized</div></div>` +
      prFoot(db, 'Credit note against the customer receivable.');
  } else if (type === 'intake') {
    docTitle = 'Buying Receipt';
    const p = doc;
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Total</th></tr></thead><tbody>`;
    p.lines.forEach((l: any) => {
      t += `<tr><td>${esc(itemName(l.itemId))}</td><td class="num">${l.qty}</td><td class="num">${fmt(l.cost)}</td><td class="num">${fmt(r2((+l.qty || 0) * (+l.cost || 0)))}</td></tr>`;
    });
    t += `</tbody></table></div>`;
    let tot = `
    <div class="tot-container">
      <table class="tot">
        <tr><td class="tot-label">TOTAL</td><td class="num">${fmt(intakeTotal(p))}</td></tr>
        <tr><td class="tot-label muted">Paid</td><td class="num muted">${fmt(paidToIntake(db, p))}</td></tr>
        <tr class="grand"><td class="tot-label">BALANCE OWED</td><td class="num">${fmt(intakeBalance(db, p))}</td></tr>
      </table>
    </div>`;

    html =
      prHead(db, 'Buying Receipt', p) +
      `<div class="meta">${prCustomerBox(db, p.providerId, 'Provider')}` +
      `<div class="box"><div class="lbl">Destination branch</div><b>${esc(branchName(p.branchId))}</b><div>Goods on the way until arrival</div>${p.note ? '<div>' + esc(p.note) + '</div>' : ''}</div></div>` +
      t +
      tot +
      `<div class="sign"><div>Provider signature</div><div>Authorized by us</div></div>` +
      prFoot(db, 'Buying receipt • payable owed to provider; goods enter stock on arrival.');
  } else if (type === 'arrival') {
    docTitle = 'Arrival Note';
    const a = doc;
    const p = db.intakes.find((x) => x.id === a.intakeId) || {};
    const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>${tx('Item', lang)}</th>${trackLot ? `<th>${tx('Lot no', lang)}</th>` : ''}${trackExpiry ? `<th>${tx('Expiry', lang)}</th>` : ''}<th class="num">${tx('Qty', lang)}</th><th class="num">${tx('Unit Cost', lang)}</th><th class="num">${tx('Total', lang)}</th></tr></thead><tbody>`;
    a.lines.forEach((l: any) => {
      t += `<tr><td>${esc(itemName(l.itemId))}</td>${trackLot ? `<td class="nowrap">${esc(l.batchNo || '—')}</td>` : ''}${trackExpiry ? `<td class="nowrap">${esc(l.expiry ? fmtDate(l.expiry) : '—')}</td>` : ''}<td class="num">${l.qty}</td><td class="num">${fmt(l.cost)}</td><td class="num">${fmt(r2((+l.qty || 0) * (+l.cost || 0)))}</td></tr>`;
    });
    t += `</tbody></table></div>`;

    html =
      prHead(db, 'Arrival Note', a) +
      `<div class="meta">${(p as any).providerId ? prCustomerBox(db, (p as any).providerId, 'Provider') : `<div class="box"><div class="lbl">${tx('Source', lang)}</div><b>${tx('Direct / Branch Arrival', lang)}</b><div>${tx('Warehouse intake', lang)}</div></div>`}` +
      `<div class="box"><div class="lbl">${(p as any).no ? 'Buying receipt' : tx('Source Document', lang)}</div><b>${esc((p as any).no || tx('Direct Arrival', lang))}</b><div>Received into ${esc(branchName(a.branchId))}</div>${a.note ? '<div>' + esc(a.note) + '</div>' : ''}</div></div>` +
      t +
      `<div class="sign"><div>Warehouse received</div><div>Checked by</div></div>` +
      prFoot(db, (p as any).no ? 'Goods received into stock against buying receipt.' : 'Goods received directly into branch warehouse stock.');
  } else if (type === 'barter') {
    docTitle = 'Barter Exchange';
    const b = doc;
    let g = `<div class="pr-table-wrap"><table><thead><tr><th>We Gave</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Value</th></tr></thead><tbody>`;
    b.giveLines.forEach((l: any) => {
      const unitPrice = +(l.price ?? l.cost) || 0;
      g += `<tr><td>${esc(itemName(l.itemId))}</td><td class="num">${l.qty}</td><td class="num">${fmt(unitPrice)}</td><td class="num">${fmt(r2((+l.qty || 0) * unitPrice))}</td></tr>`;
    });
    g += `<tr class="grand"><td colspan="3"><b>Gave total</b></td><td class="num"><b>${fmt(b.giveValue)}</b></td></tr></tbody></table></div>`;

    let rc = `<div class="pr-table-wrap"><table><thead><tr><th>We Received</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Value</th></tr></thead><tbody>`;
    b.recvLines.forEach((l: any) => {
      const unitPrice = +(l.price ?? l.cost) || 0;
      rc += `<tr><td>${esc(itemName(l.itemId))}</td><td class="num">${l.qty}</td><td class="num">${fmt(unitPrice)}</td><td class="num">${fmt(r2((+l.qty || 0) * unitPrice))}</td></tr>`;
    });
    rc += `<tr class="grand"><td colspan="3"><b>Received total</b></td><td class="num"><b>${fmt(b.recvValue)}</b></td></tr></tbody></table></div>`;

    html =
      prHead(db, 'Barter Exchange', b) +
      `<div class="meta">${prCustomerBox(db, b.partnerId, 'Exchange Partner')}` +
      `<div class="box"><div class="lbl">Settlement</div>Branch: ${esc(branchName(b.branchId))}` +
      `<div>Customer balance: unchanged (0 impact)</div>` +
      `<div>Exchange result: ${b.loss > 0.005 ? 'write-off ' + fmt(b.loss) : 'balanced'}</div>${b.note ? '<div><b>Note:</b> ' + esc(b.note) + '</div>' : ''}</div></div>` +
      g +
      rc +
      (b.note ? `<div class="box" style="margin-top:10px;margin-bottom:12px;font-size:11px;background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;"><b>Note:</b> ${esc(b.note)}</div>` : '') +
      `<div class="sign"><div>Partner signature</div><div>Authorized</div></div>` +
      prFoot(db, 'Item-for-item exchange at agreed prices.');
  } else if (type === 'transfer') {
    docTitle = 'Stock Transfer';
    const tr = doc;
    const { trackLot, trackExpiry } = getGlobalTrackFlags(db.settings);
    let t = `<div class="pr-table-wrap"><table><thead><tr><th>${tx('Item', lang)}</th>${trackLot ? `<th>${tx('Batch', lang)}</th>` : ''}${trackExpiry ? `<th>${tx('Expiry', lang)}</th>` : ''}<th class="num">${tx('Qty', lang)}</th></tr></thead><tbody>`;
    tr.lines.forEach((l: any) => {
      t += `<tr><td>${esc(itemName(l.itemId))}</td>${trackLot ? `<td class="nowrap">${esc(l.batchNo || '—')}</td>` : ''}${trackExpiry ? `<td class="nowrap">${esc(l.expiry ? fmtDate(l.expiry) : '—')}</td>` : ''}<td class="num">${l.qty}</td></tr>`;
    });
    t += `</tbody></table></div>`;

    html =
      prHead(db, 'Stock Transfer Voucher', tr) +
      `<div class="meta"><div class="box"><div class="lbl">From</div><b>${esc(branchName(tr.fromBranchId))}</b><div>Stock deducted at dispatch</div></div>` +
      `<div class="box"><div class="lbl">To</div><b>${esc(branchName(tr.toBranchId))}</b><div>Status: ${esc(tr.status)}</div>${tr.note ? '<div><b>Note:</b> ' + esc(tr.note) + '</div>' : ''}</div></div>` +
      t +
      (tr.note ? `<div class="box" style="margin-top:10px;margin-bottom:12px;font-size:11px;background:#f8fafc;border:1px solid #cbd5e1;padding:8px 12px;border-radius:6px;"><b>Note:</b> ${esc(tr.note)}</div>` : '') +
      `<div class="sign"><div>Dispatched by</div><div>Received by</div></div>` +
      prFoot(db, 'Inter-branch stock transfer • confirm receipt on arrival.');
  }

  return { html, docTitle: `${docTitle} ${docRef}`.trim(), docRef };
}

export function printDocument(type: string, doc: any, db: DatabaseSchema) {
  const res = generateDocumentHtml(type, doc, db);
  const lang = db.settings.lang || 'en';
  printHtml(res.html, res.docTitle, res.docRef, lang);
  return res;
}

export function buildStatementHtml(db: DatabaseSchema, customerId: string, rows: any[]): { html: string; title: string; ref: string } | null {
  const c = db.customers.find((x) => x.id === customerId);
  if (!c) return null;

  let t = `<div class="pr-table-wrap"><table><thead><tr><th class="nowrap">Date</th><th class="nowrap">Type</th><th class="nowrap">Ref</th><th>Details</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>`;
  rows.forEach((r) => {
    t += `<tr><td class="nowrap">${esc(r.date || '')}</td><td class="nowrap">${esc(r.type)}</td><td class="nowrap">${esc(r.no)}</td><td style="min-width:140px;">${esc(r.details)}</td><td class="num">${r.debit > 0 ? fmt(r.debit) : ''}</td><td class="num">${r.credit > 0 ? fmt(r.credit) : ''}</td><td class="num">${fmt(r.bal)}</td></tr>`;
  });
  t += `</tbody></table></div>`;
  const tot = `
  <div class="tot-container">
    <table class="tot">
      <tr class="grand"><td class="tot-label">TOTAL OWED</td><td class="num">${fmt(custBalance(db, c))}</td></tr>
    </table>
  </div>`;

  const head = prHead(db, 'Account Statement', { no: '', date: todayStr() });
  const html =
    head +
    `<div class="meta">${prCustomerBox(db, c.id)}` +
    `<div class="box"><div class="lbl">Summary</div><div>Opening balance: ${fmt(c.openingBalance || 0)}</div>` +
    `<div>Settlement discounts credited: ${fmt(custDiscountTotal(db, c.id))}</div></div></div>` +
    t +
    tot +
    prFoot(db, 'Customer / provider account statement.');

  return {
    html,
    title: `Account Statement - ${c.name}`,
    ref: `Statement-${c.name}`,
  };
}

export function printStatement(db: DatabaseSchema, customerId: string, rows: any[]) {
  const res = buildStatementHtml(db, customerId, rows);
  if (!res) return;
  const lang = db.settings.lang || 'en';
  printHtml(res.html, res.title, res.ref, lang);
}
