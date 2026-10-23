import { jsPDF } from 'jspdf';
import { supabase } from '@/lib/supabase';
import type { PrintSettings } from './printUtils';

interface PdfDocumentInput {
  title: string;
  body: string;
  header?: string | null;
  footer?: string | null;
  settings?: PrintSettings | null;
  signatures?: Array<{ label: string; dataUrl: string; name?: string }>;
}

export function generateDocumentPDF(input: PdfDocumentInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const pageW = 210;
  const pageH = 297;
  const margin = 18;
  const contentW = pageW - margin * 2;
  let y = margin;

  const addLogo = () => {
    if (input.settings?.logo_url) {
      try {
        doc.addImage(input.settings.logo_url, 'PNG', margin, y, 30, 20, undefined, 'FAST');
      } catch {
        // logo may be a URL that jsPDF can't fetch directly; skip gracefully
      }
    }
  };

  const addHeader = () => {
    addLogo();
    if (input.settings) {
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(input.settings.fantasy_name || input.settings.studio_name || '', margin + 35, y + 8);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      let hy = y + 13;
      if (input.settings.tax_id) { doc.text(`CNPJ/CPF: ${input.settings.tax_id}`, margin + 35, hy); hy += 4; }
      if (input.settings.address) {
        const addrLines = doc.splitTextToSize(input.settings.address, contentW - 35);
        doc.text(addrLines, margin + 35, hy);
        hy += addrLines.length * 4;
      }
      if (input.settings.phone) { doc.text(`Tel: ${input.settings.phone}`, margin + 35, hy); hy += 4; }
      if (input.settings.email) { doc.text(input.settings.email, margin + 35, hy); }
    }
    y += 28;
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 8;
  };

  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - 25) {
      doc.addPage();
      y = margin;
    }
  };

  const addBodyText = (text: string) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(text, contentW);
    for (const line of lines) {
      ensureSpace(5);
      doc.text(line, margin, y);
      y += 5;
    }
  };

  const addSignatures = (sigs: Array<{ label: string; dataUrl: string; name?: string }>) => {
    y += 15;
    const sigH = 25;

    for (let i = 0; i < sigs.length; i++) {
      if (i % 2 === 0 && i > 0) y += sigH + 12;
      ensureSpace(sigH + 15);
      const colW = (contentW - 10) / 2;
      const x = margin + (i % 2) * (colW + 10);
      const sigY = y;

      try {
        doc.addImage(sigs[i].dataUrl, 'PNG', x, sigY, colW - 5, sigH, undefined, 'FAST');
      } catch {
        // if image fails, draw a line instead
      }
      doc.setDrawColor(51, 65, 85);
      doc.line(x, sigY + sigH, x + colW - 5, sigY + sigH);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(sigs[i].label, x, sigY + sigH + 5);
      if (sigs[i].name) {
        doc.setFont('helvetica', 'bold');
        doc.text(sigs[i].name ?? '', x, sigY + sigH + 10);
        doc.setFont('helvetica', 'normal');
      }
    }
    y += sigH + 20;
  };

  addHeader();

  if (input.header) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    addBodyText(input.header);
    y += 4;
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  const titleLines = doc.splitTextToSize(input.title, contentW);
  titleLines.forEach((line: string) => {
    ensureSpace(7);
    doc.text(line, margin, y);
    y += 7;
  });
  y += 5;

  if (input.body) {
    addBodyText(input.body);
  }

  if (input.signatures && input.signatures.length > 0) {
    addSignatures(input.signatures);
  }

  // Footer on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(148, 163, 184);
    doc.text(`Documento gerado em ${new Date().toLocaleString('pt-BR')}`, margin, pageH - 8);
    doc.text(`Pagina ${i} de ${pageCount}`, pageW - margin - 20, pageH - 8);
    if (input.footer) {
      doc.setFontSize(8);
      const footerLines = doc.splitTextToSize(input.footer, contentW);
      let fy = pageH - 14;
      footerLines.forEach((line: string) => {
        doc.text(line, pageW / 2, fy, { align: 'center' });
        fy -= 4;
      });
    }
    doc.setTextColor(30, 41, 59);
  }

  return doc.output('blob');
}

export function downloadPDF(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function uploadDocumentToStorage(
  supabaseUrl: string,
  bucket: string,
  path: string,
  blob: Blob
): Promise<{ path: string; publicUrl: string } | null> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: 'application/pdf', upsert: true });
  if (error) return null;
  const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${data.path}`;
  return { path: data.path, publicUrl };
}
