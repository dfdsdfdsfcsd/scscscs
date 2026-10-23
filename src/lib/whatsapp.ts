export interface ElectronAPI {
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
}

function getApi(): ElectronAPI | null {
  const api = (window as unknown as { electronAPI?: ElectronAPI }).electronAPI;
  if (!api || !api.openExternal) return null;
  return api;
}

export function isWhatsAppAvailable(): boolean {
  return !!getApi();
}

/**
 * Normalizes a Brazilian phone number to international format without + or non-digits.
 * Handles formats like: (11) 99999-9999, 11 999999999, +55 11 999999999, etc.
 * Returns null if the number is invalid.
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.startsWith('55') && digits.length >= 12) {
    // Already has country code
  } else if (digits.length === 11 || digits.length === 10) {
    digits = '55' + digits;
  } else if (digits.length === 12 && digits.startsWith('0')) {
    digits = '55' + digits.substring(1);
  } else if (digits.length === 13 && digits.startsWith('00')) {
    digits = '55' + digits.substring(2);
  } else {
    return null;
  }
  if (digits.length < 12 || digits.length > 13) return null;
  return digits;
}

export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  const normalized = normalizePhone(phone);
  if (!normalized) return phone;
  const dd = normalized.substring(2, 4);
  const rest = normalized.substring(4);
  if (rest.length === 9) {
    return `+55 (${dd}) ${rest.substring(0, 5)}-${rest.substring(5)}`;
  } else if (rest.length === 8) {
    return `+55 (${dd}) ${rest.substring(0, 4)}-${rest.substring(4)}`;
  }
  return `+${normalized}`;
}

/**
 * Builds a wa.me URL with the given phone number and pre-filled message.
 */
export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  const base = normalized ? `https://wa.me/${normalized}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

/**
 * Opens WhatsApp via Electron's safe shell.openExternal (desktop) or window.open (browser fallback).
 * Returns success/error result.
 */
export async function openWhatsApp(url: string): Promise<{ success: boolean; error?: string }> {
  const api = getApi();
  if (api) {
    return api.openExternal(url);
  }
  // Browser fallback — open in a new tab
  try {
    window.open(url, '_blank');
    return { success: true };
  } catch {
    return { success: false, error: 'Não foi possível abrir o WhatsApp.' };
  }
}

/**
 * Builds a professional WhatsApp message for a Service Order.
 * Only includes fields that have values.
 */
export function buildWhatsAppMessage(opts: {
  clientName: string;
  studioName: string;
  orderCode: string;
  orderTitle: string;
  dueDate?: string | null;
  formattedDueDate?: string | null;
  orderDate?: string | null;
  formattedOrderDate?: string | null;
}): string {
  const lines: string[] = [
    `Olá, ${opts.clientName}!`,
    '',
    `Aqui é do ${opts.studioName}.`,
    '',
    `Sua Ordem de Serviço nº ${opts.orderCode} foi registrada com sucesso.`,
    '',
    `Descrição do serviço: ${opts.orderTitle}.`,
  ];

  if (opts.formattedOrderDate) {
    lines.push(`Data do pedido: ${opts.formattedOrderDate}.`);
  }

  if (opts.formattedDueDate) {
    lines.push(`Previsão de entrega: ${opts.formattedDueDate}.`);
  }

  lines.push('', 'Estamos à disposição para esclarecer qualquer dúvida.');

  return lines.join('\n');
}
