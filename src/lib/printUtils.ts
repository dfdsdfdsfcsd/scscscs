import { toast } from '@/components/Toast';

export interface PrintSettings {
  studio_name: string;
  fantasy_name: string | null;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

const PRINT_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, 'Segoe UI', system-ui, BlinkMacSystemFont, sans-serif;
    color: #1e293b;
    font-size: 12px;
    line-height: 1.6;
    padding: 0;
  }
  .print-container {
    max-width: 800px;
    margin: 0 auto;
    padding: 30px 20px;
  }
  .print-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 2px solid #e2e8f0;
  }
  .print-header .logo img { max-height: 60px; }
  .print-header .company-info h1 { font-size: 18px; color: #0f172a; margin: 0; }
  .print-header .company-info p { font-size: 11px; color: #64748b; margin: 2px 0; }
  .print-header .doc-info { text-align: right; }
  .print-header .doc-info h2 { font-size: 16px; color: #0f172a; }
  .print-header .doc-info p { font-size: 11px; color: #64748b; }
  .print-section { margin-bottom: 20px; }
  .print-section h3 {
    font-size: 13px;
    color: #334155;
    margin-bottom: 10px;
    padding-bottom: 4px;
    border-bottom: 1px solid #e2e8f0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .print-info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 24px;
  }
  .print-info-grid div { font-size: 12px; }
  .print-info-grid .label { color: #64748b; font-size: 11px; display: block; }
  .print-info-grid .value { color: #1e293b; font-weight: 500; }
  table.print-table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 12px;
  }
  table.print-table th {
    background: #f1f5f9;
    padding: 8px 12px;
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    color: #475569;
    border-bottom: 2px solid #cbd5e1;
    font-weight: 600;
  }
  table.print-table td {
    padding: 8px 12px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }
  table.print-table tr:last-child td { border-bottom: none; }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .text-emerald { color: #059669; }
  .text-red { color: #dc2626; }
  .font-bold { font-weight: 700; }
  .font-semibold { font-weight: 600; }
  .print-summary {
    margin-top: 16px;
    padding: 16px;
    background: #f8fafc;
    border-radius: 8px;
  }
  .print-summary .row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }
  .print-summary .row.total {
    border-top: 2px solid #cbd5e1;
    margin-top: 8px;
    padding-top: 8px;
    font-size: 14px;
    font-weight: 700;
  }
  .print-footer {
    margin-top: 32px;
    padding-top: 16px;
    border-top: 1px solid #e2e8f0;
    text-align: center;
    font-size: 10px;
    color: #94a3b8;
  }
  .print-notes {
    margin-top: 16px;
    padding: 12px;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 8px;
    font-size: 11px;
    color: #78350f;
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .print-signature {
    margin-top: 40px;
    display: flex;
    justify-content: space-between;
  }
  .print-signature .sig-block { text-align: center; width: 45%; }
  .print-signature .sig-line {
    border-top: 1px solid #334155;
    margin-bottom: 4px;
    padding-top: 30px;
  }
  .print-signature .sig-label { font-size: 11px; color: #64748b; }
  pre.print-body {
    white-space: pre-wrap;
    word-wrap: break-word;
    overflow-wrap: break-word;
    font-family: -apple-system, 'Segoe UI', system-ui, BlinkMacSystemFont, sans-serif;
    font-size: 12px;
    line-height: 1.8;
    color: #1e293b;
  }
  @page {
    margin: 1.5cm;
    size: A4 portrait;
  }
  @media print {
    body { padding: 0; }
    .print-container { max-width: 100%; padding: 0; }
    .no-print { display: none !important; }
    h3 { break-after: avoid; }
    tr, td, th { break-inside: avoid; }
    table { break-inside: auto; }
    thead { display: table-header-group; }
  }
`;

export function buildPrintHTML(title: string, bodyContent: string, settings?: PrintSettings | null): string {
  const header = settings && (settings.studio_name || settings.fantasy_name)
    ? `<div class="print-header">
      <div class="logo">${settings.logo_url ? `<img src="${settings.logo_url}" alt="logo" />` : ''}</div>
      <div class="company-info">
        <h1>${settings.fantasy_name || settings.studio_name}</h1>
        ${settings.tax_id ? `<p>CNPJ/CPF: ${settings.tax_id}</p>` : ''}
        ${settings.address ? `<p>${settings.address}</p>` : ''}
        ${settings.phone ? `<p>Tel: ${settings.phone}</p>` : ''}
        ${settings.email ? `<p>${settings.email}</p>` : ''}
      </div>
      <div class="doc-info"><h2>${title}</h2></div>
    </div>`
    : `<div class="print-header"><div class="doc-info"><h2>${title}</h2></div></div>`;

  const footer = `<div class="print-footer">
    Documento gerado em ${new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
    &nbsp;|&nbsp; Página ${'<span class="print-page-num"></span>'}
  </div>`;

  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title><style>${PRINT_CSS}</style></head><body><div class="print-container">${header}${bodyContent}${footer}</div><script>(function(){var d=document;window.onbeforeprint=function(){d.querySelectorAll('.print-page-num').forEach(function(e){e.textContent='1';});};d.querySelectorAll('.print-page-num').forEach(function(e){e.textContent='1';});})()</script></body></html>`;
}

export function openPrintWindow(html: string) {
  const win = window.open('', '_blank');
  if (!win) {
    toast('Não foi possível abrir a pré-visualização. Verifique se o navegador permite pop-ups.', 'error');
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => {
    try { win.print(); } catch { /* user may cancel */ }
  }, 400);
}
