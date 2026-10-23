import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, daysUntil, buildWhatsAppUrl, fillTemplate, todayISO } from '@/lib/utils';
import { Bell, Cake, Calendar, FileText, Clock, TriangleAlert as AlertTriangle, TrendingDown, MessageCircle, X, Package } from 'lucide-react';
import type { Client, Appointment, Budget, FinancialEntry, FinancialExpense, ClientPhotoFolder, ImageAuthorization, MessageTemplate, InventoryItem } from '@/lib/types';

interface AlertItem {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  severity: 'info' | 'warning' | 'danger';
  client?: Client;
}

export function AlertsPage() {
  const { settings } = useSettings();
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [revokedFolders, setRevokedFolders] = useState<ClientPhotoFolder[]>([]);
  const [expiredAuths, setExpiredAuths] = useState<ImageAuthorization[]>([]);
  const [revokedAuths, setRevokedAuths] = useState<ImageAuthorization[]>([]);
  const [whatsappClient, setWhatsappClient] = useState<Client | null>(null);
  const [whatsappAlertType, setWhatsappAlertType] = useState<string>('');
  const [messageText, setMessageText] = useState('');
  const [filter, setFilter] = useState('all');
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [clientsRes, apptsRes, budgetsRes, entriesRes, expensesRes, dismissedRes, foldersRes, expiredAuthRes, revokedAuthRes, allAuthRes, inventoryRes] = await Promise.all([
      supabase.from('clients').select('*').eq('status', 'ativo'),
      supabase.from('appointments').select('*'),
      supabase.from('budgets').select('*'),
      supabase.from('financial_entries').select('*'),
      supabase.from('financial_expenses').select('*'),
      supabase.from('alert_dismissals').select('*'),
      supabase.from('client_photo_folders').select('*').eq('authorization_status', 'revogada'),
      supabase.from('image_authorizations').select('*').eq('status', 'expirado'),
      supabase.from('image_authorizations').select('*').eq('status', 'revogado'),
      supabase.from('image_authorizations').select('*'),
      supabase.from('inventory_items').select('*').eq('active', true),
    ]);
    setLoading(false);
    setClients((clientsRes.data as Client[]) ?? []);
    setAppointments((apptsRes.data as Appointment[]) ?? []);
    setBudgets((budgetsRes.data as Budget[]) ?? []);
    setEntries((entriesRes.data as FinancialEntry[]) ?? []);
    setExpenses((expensesRes.data as FinancialExpense[]) ?? []);
    setDismissed(((dismissedRes.data as { alert_key: string }[]) ?? []).map((d) => d.alert_key));
    setRevokedFolders((foldersRes.data as ClientPhotoFolder[]) ?? []);
    setExpiredAuths((expiredAuthRes.data as ImageAuthorization[]) ?? []);
    setRevokedAuths((revokedAuthRes.data as ImageAuthorization[]) ?? []);
    setInventoryItems((inventoryRes.data as InventoryItem[]) ?? []);
    const expiredAuto = ((allAuthRes.data as ImageAuthorization[]) ?? []).filter(
      (a) => a.status === 'autorizado' && a.end_date && new Date(a.end_date) < new Date()
    );
    setExpiredAuths((prev) => [...prev, ...expiredAuto]);
    const { data: tplData } = await supabase.from('message_templates').select('*');
    setTemplates((tplData as MessageTemplate[]) ?? []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const alerts: AlertItem[] = [];
  const today = todayISO();
  const advance = settings.alert_advance_days || 7;

  clients.forEach((c) => {
    if (!c.birth_date) return;
    const yearStr = new Date().getFullYear();
    const bdayThisYear = `${yearStr}-${c.birth_date.slice(5)}`;
    const d = daysUntil(bdayThisYear);
    if (d === 0) alerts.push({ id: `bday-today-${c.id}`, type: 'aniversario', title: `Aniversário de ${c.full_name} hoje!`, description: `Ligue ou envie uma mensagem de feliz aniversário.`, date: bdayThisYear, severity: 'info', client: c });
    else if (d > 0 && d <= advance) alerts.push({ id: `bday-${c.id}`, type: 'aniversario', title: `Aniversário de ${c.full_name} em ${d} dia(s)`, description: `Data: ${formatDate(bdayThisYear)}`, date: bdayThisYear, severity: 'info', client: c });
  });

  appointments.filter((a) => a.status === 'agendado' || a.status === 'confirmado').forEach((a) => {
    const d = daysUntil(a.appointment_date);
    if (d >= 0 && d <= advance) {
      const client = clients.find((c) => c.id === a.client_id);
      alerts.push({ id: `appt-${a.id}`, type: 'agendamento', title: `Agendamento: ${a.title} ${d === 0 ? 'hoje' : `em ${d} dia(s)`}`, description: `${formatDate(a.appointment_date)} às ${a.start_time}${client ? ` — ${client.full_name}` : ''}`, date: a.appointment_date, severity: d === 0 ? 'danger' : 'warning', client });
    }
  });

  budgets.filter((b) => b.status === 'enviado' || b.status === 'aguardando').forEach((b) => {
    if (b.valid_until) {
      const d = daysUntil(b.valid_until);
      if (d >= 0 && d <= advance) {
        const client = clients.find((c) => c.id === b.client_id);
        alerts.push({ id: `budget-exp-${b.id}`, type: 'orcamento', title: `Orçamento ${b.code} expira ${d === 0 ? 'hoje' : `em ${d} dia(s)`}`, description: `Cliente: ${client?.full_name ?? '—'}`, date: b.valid_until, severity: d === 0 ? 'danger' : 'warning', client });
      }
    }
  });

  entries.filter((e) => e.status !== 'pago').forEach((e) => {
    const d = daysUntil(e.due_date);
    if (d < 0) {
      const client = clients.find((c) => c.id === e.client_id);
      alerts.push({ id: `entry-overdue-${e.id}`, type: 'financeiro', title: `Pagamento atrasado: ${e.description}`, description: `Venceu em ${formatDate(e.due_date)} — ${formatCurrency(e.total_amount - e.paid_amount)}${client ? ` (${client.full_name})` : ''}`, date: e.due_date, severity: 'danger', client });
    } else if (d <= advance) {
      const client = clients.find((c) => c.id === e.client_id);
      alerts.push({ id: `entry-${e.id}`, type: 'financeiro', title: `Recebimento previsto ${d === 0 ? 'hoje' : `em ${d} dia(s)`}: ${e.description}`, description: `${formatDate(e.due_date)} — ${formatCurrency(e.total_amount - e.paid_amount)}`, date: e.due_date, severity: 'warning', client });
    }
  });

  expenses.filter((e) => e.status !== 'pago').forEach((e) => {
    const d = daysUntil(e.due_date);
    if (d < 0) alerts.push({ id: `exp-overdue-${e.id}`, type: 'financeiro', title: `Conta atrasada: ${e.description}`, description: `Venceu em ${formatDate(e.due_date)} — ${formatCurrency(e.amount - e.paid_amount)}`, date: e.due_date, severity: 'danger' });
    else if (d <= advance) alerts.push({ id: `exp-${e.id}`, type: 'financeiro', title: `Vencimento ${d === 0 ? 'hoje' : `em ${d} dia(s)`}: ${e.description}`, description: `${formatDate(e.due_date)} — ${formatCurrency(e.amount - e.paid_amount)}`, date: e.due_date, severity: 'warning' });
  });

  revokedFolders.forEach((f) => {
    const client = clients.find((c) => c.id === f.client_id);
    alerts.push({ id: `folder-revoked-${f.id}`, type: 'autorizacao', title: `Autorização revogada — ${client?.full_name ?? 'Cliente'}`, description: `Pasta: ${f.folder_path}. Revise o uso futuro das imagens.`, date: f.updated_at ?? f.created_at, severity: 'danger', client });
  });

  expiredAuths.forEach((a) => {
    const client = clients.find((c) => c.id === a.client_id);
    alerts.push({ id: `auth-expired-${a.id}`, type: 'autorizacao', title: `Autorização expirada — ${client?.full_name ?? 'Cliente'} (${a.doc_number})`, description: `Vencida em ${formatDate(a.end_date)}. Verifique a situação antes de publicar imagens.`, date: a.end_date ?? a.updated_at, severity: 'danger', client });
  });

  revokedAuths.forEach((a) => {
    const client = clients.find((c) => c.id === a.client_id);
    alerts.push({ id: `auth-revoked-${a.id}`, type: 'autorizacao', title: `Autorização revogada — ${client?.full_name ?? 'Cliente'} (${a.doc_number})`, description: `Termo revogado. Revise o uso futuro das imagens associadas.`, date: a.updated_at, severity: 'danger', client });
  });

  inventoryItems.filter((i) => i.current_stock <= i.min_stock).forEach((i) => {
    alerts.push({ id: `stock-low-${i.id}`, type: 'estoque', title: `Estoque baixo: ${i.name}`, description: `Saldo atual: ${i.current_stock} ${i.unit} — mínimo: ${i.min_stock} ${i.unit}`, date: today, severity: 'warning' });
  });

  const visibleAlerts = alerts.filter((a) => !dismissed.includes(a.id));
  const filteredAlerts = filter === 'all' ? visibleAlerts : visibleAlerts.filter((a) => a.type === filter);

  const dismiss = async (id: string, type: string) => {
    await supabase.from('alert_dismissals').insert({ alert_key: id, alert_type: type });
    setDismissed([...dismissed, id]);
  };

  const sendWhatsapp = (c: Client, alertType: string) => {
    setWhatsappClient(c);
    setWhatsappAlertType(alertType);
    const tpl = templates.find((t) => t.category === alertType);
    const fallback: Record<string, string> = {
      aniversario: 'Olá, {NOME}! Tudo bem? A equipe {NOME_ESTUDIO} deseja a você um aniversário cheio de alegria, saúde e momentos especiais. Agradecemos por fazer parte da nossa história! Um abraço de toda a equipe.',
      agendamento: 'Olá, {NOME}! Lembrete da equipe {NOME_ESTUDIO}: seu compromisso está próximo. Estamos te esperando!',
      orcamento: 'Olá, {NOME}! Tudo bem? A equipe {NOME_ESTUDIO} entrou em contato sobre o seu orçamento. Qualquer dúvida, estamos à disposição.',
      financeiro: 'Olá, {NOME}! Tudo bem? A equipe {NOME_ESTUDIO} entrou em contato sobre um pagamento pendente. Por favor, entre em contato para regularizar.',
      autorizacao: 'Olá, {NOME}! Tudo bem? A equipe {NOME_ESTUDIO} precisa conversar sobre a autorização de uso de imagem. Por favor, entre em contato.',
    };
    const text = tpl?.content ?? fallback[alertType] ?? fallback.aniversario;
    setMessageText(fillTemplate(text, { NOME: c.full_name, NOME_ESTUDIO: settings.studio_name }));
  };

  const confirmWhatsapp = () => {
    if (!whatsappClient) return;
    const phone = whatsappClient.whatsapp ?? whatsappClient.phone ?? '';
    if (!phone) { toast('Cliente sem telefone cadastrado', 'warning'); return; }
    window.open(buildWhatsAppUrl(phone, messageText), '_blank');
    supabase.from('client_history').insert({ client_id: whatsappClient.id, event_type: 'mensagem', description: `Mensagem enviada via alerta (${whatsappAlertType})` });
    toast('WhatsApp aberto. Confirme o envio no aplicativo.', 'info');
    setWhatsappClient(null);
  };

  const filterOptions = [
    { id: 'all', label: 'Todos', count: visibleAlerts.length },
    { id: 'aniversario', label: 'Aniversários', count: visibleAlerts.filter((a) => a.type === 'aniversario').length },
    { id: 'agendamento', label: 'Agendamentos', count: visibleAlerts.filter((a) => a.type === 'agendamento').length },
    { id: 'orcamento', label: 'Orçamentos', count: visibleAlerts.filter((a) => a.type === 'orcamento').length },
    { id: 'financeiro', label: 'Financeiro', count: visibleAlerts.filter((a) => a.type === 'financeiro').length },
    { id: 'autorizacao', label: 'Autorizações', count: visibleAlerts.filter((a) => a.type === 'autorizacao').length },
    { id: 'estoque', label: 'Estoque', count: visibleAlerts.filter((a) => a.type === 'estoque').length },
  ];

  const iconFor = (type: string) => {
    if (type === 'aniversario') return Cake;
    if (type === 'agendamento') return Calendar;
    if (type === 'orcamento') return FileText;
    if (type === 'autorizacao') return AlertTriangle;
    if (type === 'estoque') return Package;
    return TrendingDown;
  };

  return (
    <div>
      <PageHeader title="Central de alertas" subtitle={`${visibleAlerts.length} alerta(s) ativo(s)`} />

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando alertas...</div>
      ) : (
      <>
      <div className="flex gap-2 mb-4 flex-wrap">
        {filterOptions.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} className={`btn-ghost text-sm ${filter === f.id ? 'bg-slate-100 dark:bg-slate-700' : ''}`}>
            {f.label} <span className="badge badge-neutral ml-1">{f.count}</span>
          </button>
        ))}
      </div>

      {filteredAlerts.length === 0 ? (
        <EmptyState icon={<Bell className="h-12 w-12" />} title="Nenhum alerta ativo" description="Você está em dia! Os alertas aparecerão aqui quando houver aniversários, agendamentos ou vencimentos próximos." />
      ) : (
        <div className="space-y-3">
          {filteredAlerts.sort((a, b) => a.date.localeCompare(b.date)).map((a) => {
            const Icon = iconFor(a.type);
            const color = a.severity === 'danger' ? 'text-red-500 bg-red-50 dark:bg-red-900/20' : a.severity === 'warning' ? 'text-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'text-sky-500 bg-sky-50 dark:bg-sky-900/20';
            return (
              <div key={a.id} className="card p-4 flex items-center gap-4">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}><Icon className="h-5 w-5" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{a.title}</p>
                  <p className="text-sm text-slate-400">{a.description}</p>
                </div>
                {a.client && (a.client.whatsapp ?? a.client.phone) && <button onClick={() => sendWhatsapp(a.client!, a.type)} className="btn-secondary text-green-600 text-xs"><MessageCircle className="h-4 w-4" /> WhatsApp</button>}
                <button onClick={() => dismiss(a.id, a.type)} className="btn-ghost"><X className="h-4 w-4" /></button>
              </div>
            );
          })}
        </div>
      )}

      {whatsappClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setWhatsappClient(null)} />
          <div className="relative w-full max-w-md rounded-2xl bg-white dark:bg-slate-800 shadow-2xl p-6">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-4">Mensagem via WhatsApp</h3>
            <p className="text-sm text-slate-500 mb-3">Para: {whatsappClient.full_name}</p>
            <textarea className="input min-h-[120px] mb-4" value={messageText} onChange={(e) => setMessageText(e.target.value)} />
            <div className="flex justify-end gap-3">
              <button onClick={() => navigator.clipboard.writeText(messageText)} className="btn-secondary">Copiar</button>
              <button onClick={confirmWhatsapp} className="btn-primary" style={{ backgroundColor: '#16a34a' }}><MessageCircle className="h-4 w-4" /> Abrir WhatsApp</button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
