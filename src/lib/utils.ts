export function formatCurrency(value: number | null | undefined): string {
  const v = value ?? 0;
  return v.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

export function formatDate(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatTime(time: string | null | undefined): string {
  if (!time) return '—';
  const parts = time.split(':');
  if (parts.length < 2) return time;
  return `${parts[0]}h${parts[1]}`;
}

export function getMonthBounds(date = new Date()): { start: string; end: string } {
  const year = date.getFullYear();
  const month = date.getMonth();
  const start = toLocalISODate(new Date(year, month, 1));
  const end = toLocalISODate(new Date(year, month + 1, 0));
  return { start, end };
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getDayOfMonth(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d.getDate();
}

export function getMonthFromDate(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d.getMonth() + 1;
}

export function isSameMonth(dateStr: string | null, refDate = new Date()): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  return (
    !isNaN(d.getTime()) &&
    d.getMonth() === refDate.getMonth() &&
    d.getFullYear() === refDate.getFullYear()
  );
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + 'T00:00:00');
  const today = new Date();
  return (
    !isNaN(d.getTime()) &&
    d.getDate() === today.getDate() &&
    d.getMonth() === today.getMonth() &&
    d.getFullYear() === today.getFullYear()
  );
}

export function calculateGestationalWeek(dueDate: string | null): string {
  if (!dueDate) return '—';
  const due = new Date(dueDate + 'T00:00:00');
  if (isNaN(due.getTime())) return '—';
  const totalDays = 280;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const elapsedDays = totalDays - diffDays;
  if (elapsedDays <= 0) return 'Parto próximo';
  if (elapsedDays >= totalDays) return 'Pós-parto';
  const weeks = Math.floor(elapsedDays / 7);
  const days = elapsedDays % 7;
  return `${weeks}s ${days}d`;
}

export function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '').replace(/^0/, '');
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  const withCountry = normalized.length === 11 || normalized.length === 10 ? `55${normalized}` : normalized;
  return `https://wa.me/${withCountry}?text=${encodeURIComponent(message)}`;
}

export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

export function formatMonthYear(date = new Date()): string {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

export function weekdaysShort(): string[] {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
}
