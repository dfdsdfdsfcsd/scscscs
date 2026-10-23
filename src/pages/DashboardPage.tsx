import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { EmptyState } from '@/components/EmptyState';
import { formatCurrency, formatDate, daysUntil, getMonthBounds, todayISO, isSameMonth, buildWhatsAppUrl, fillTemplate } from '@/lib/utils';
import {
  Users,
  Calendar,
  Cake,
  FileText,
  Wallet,
  TrendingUp,
  TrendingDown,
  Plus,
  Receipt,
  CheckCircle,
  Clock,
  ShieldCheck,
  ShieldAlert,
  ClipboardList,
  Package,
  AlertTriangle,
  Megaphone,
  ArrowRight,
} from 'lucide-react';
import type { Page } from '@/components/Sidebar';
import type { Client, Appointment, Budget, CashRegister, CashTransaction, FinancialEntry, FinancialExpense, ImageAuthorization, MessageTemplate, ServiceOrder, Campaign, InventoryItem, CrmTask } from '@/lib/types';

interface DashboardProps {
  onNavigate: (page: Page) => void;
}

export function DashboardPage({ onNavigate }: DashboardProps) {
  const { settings } = useSettings();
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [cashRegisters, setCashRegisters] = useState<CashRegister[]>([]);
  const [cashTx, setCashTx] = useState<CashTransaction[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [auths, setAuths] = useState<ImageAuthorization[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [crmTasks, setCrmTasks] = useState<CrmTask[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const [c, a, b, cr, fe, exp, authRes, tplRes, ordRes, campRes, invRes, crmRes] = await Promise.all([
      supabase.from('clients').select('*'),
      supabase.from('appointments').select('*'),
      supabase.from('budgets').select('*'),
      supabase.from('cash_registers').select('*'),
      supabase.from('financial_entries').select('*'),
      supabase.from('financial_expenses').select('*'),
      supabase.from('image_authorizations').select('*'),
      supabase.from('message_templates').select('*'),
      supabase.from('service_orders').select('*'),
      supabase.from('campaigns').select('*'),
      supabase.from('inventory_items').select('*').eq('active', true),
      supabase.from('crm_tasks').select('*'),
    ]);
    setClients((c.data as Client[]) ?? []);
    setAppointments((a.data as Appointment[]) ?? []);
    setBudgets((b.data as Budget[]) ?? []);
    setRegisters((cr.data as CashRegister[]) ?? []);
    setEntries((fe.data as FinancialEntry[]) ?? []);
    setExpenses((exp.data as FinancialExpense[]) ?? []);
    setAuths((authRes.data as ImageAuthorization[]) ?? []);
    setTemplates((tplRes.data as MessageTemplate[]) ?? []);
    setOrders((ordRes.data as ServiceOrder[]) ?? []);
    setCampaigns((campRes.data as Campaign[]) ?? []);
    setInventoryItems((invRes.data as InventoryItem[]) ?? []);
    setCrmTasks((crmRes.data as CrmTask[]) ?? []);
    setLoading(false);
  }, []);

  const setRegisters = (regs: CashRegister[]) => {
    setCashRegisters(regs);
    const open = regs.find((r) => r.status === 'aberto');
    if (open) {
      supabase.from('cash_transactions').select('*').eq('cash_register_id', open.id).then(({ data }) => setCashTx((data as CashTransaction[]) ?? []));
    } else {
      setCashTx([]);
    }
  };

  useEffect(() => { load(); }, [load]);

  const today = todayISO();
  const newClientsThisMonth = clients.filter((c) => isSameMonth(c.created_at));
  const birthdaysToday = clients.filter((c) => c.birth_date && c.birth_date.slice(5) === today.slice(5));
  const birthdaysSoon = clients.filter((c) => {
    if (!c.birth_date) return false;
    const d = daysUntil(`${new Date().getFullYear()}-${c.birth_date.slice(5)}`);
    return d > 0 && d <= 7;
  });
  const upcomingAppts = appointments.filter((a) => a.appointment_date >= today && a.status !== 'cancelado' && a.status !== 'concluido').sort((a, b) => a.appointment_date.localeCompare(b.appointment_date)).slice(0, 5);
  const pendingBudgets = budgets.filter((b) => b.status === 'rascunho' || b.status === 'enviado' || b.status === 'aguardando');
  const approvedBudgets = budgets.filter((b) => b.status === 'aprovado');
  const openCash = cashRegisters.find((r) => r.status === 'aberto');
  const cashIn = cashTx.filter((t) => t.type === 'entrada').reduce((s, t) => s + t.amount, 0);
  const cashOut = cashTx.filter((t) => t.type === 'saida').reduce((s, t) => s + t.amount, 0);
  const cashBalance = (openCash?.opening_balance ?? 0) + cashIn - cashOut;

  const { start, end } = getMonthBounds();
  const monthEntries = entries.filter((e) => e.due_date >= start && e.due_date <= end && e.status === 'pago');
  const monthRevenue = monthEntries.reduce((s, e) => s + e.paid_amount, 0);
  const monthExpensesPaid = expenses.filter((e) => e.due_date >= start && e.due_date <= end && e.status === 'pago').reduce((s, e) => s + e.paid_amount, 0);
  const monthResult = monthRevenue - monthExpensesPaid;
  const totalReceivable = entries.filter((e) => e.status !== 'pago').reduce((s, e) => s + (e.total_amount - e.paid_amount), 0);
  const totalPayable = expenses.filter((e) => e.status !== 'pago').reduce((s, e) => s + (e.amount - e.paid_amount), 0);

  // === Priority indicators ===
  const advance = settings.alert_advance_days ?? 7;
  const todayAppts = appointments.filter((a) => a.appointment_date === today && a.status !== 'cancelado' && a.status !== 'concluido');
  const upcomingDeliveries = orders.filter((o) => o.due_date && o.status !== 'concluido' && o.status !== 'entregue' && o.status !== 'cancelado' && daysUntil(o.due_date) >= 0 && daysUntil(o.due_date) <= advance);
  const lateOrders = orders.filter((o) => o.due_date && o.status !== 'concluido' && o.status !== 'entregue' && o.status !== 'cancelado' && daysUntil(o.due_date) < 0);
  const awaitingBudgets = budgets.filter((b) => b.status === 'enviado' || b.status === 'aguardando');
  const overdueEntries = entries.filter((e) => e.status !== 'pago' && daysUntil(e.due_date) < 0);
  const nearDueExpenses = expenses.filter((e) => e.status !== 'pago') .filter((e) => { const d = daysUntil(e.due_date); return d >= 0 && d <= advance; });
  const unattendedOpportunities = crmTasks.filter((t) => t.type === 'oportunidade' && t.status === 'pendente');
  const lowStock = inventoryItems.filter((i) => i.current_stock <= i.min_stock);
  const campaignsBelowRoi = campaigns.filter((c) => {
    if (c.status !== 'ativa') return false;
    const cBudgets = budgets.filter((b) => b.campaign_id === c.id);
    const cRevenue = cBudgets.reduce((s, b) => s + b.total, 0);
    const cExpense = expenses.filter((e) => e.campaign_id === c.id).reduce((s, e) => s + e.amount, 0);
    return cExpense > 0 && cRevenue < cExpense;
  });

  const priorities = [
    { label: 'Compromissos de hoje', count: todayAppts.length, icon: Calendar, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20', page: 'agenda' as Page, detail: todayAppts[0] ? `${todayAppts[0].title} às ${todayAppts[0].start_time}` : 'Nenhum compromisso' },
    { label: 'Entregas previstas', count: upcomingDeliveries.length, icon: ClipboardList, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20', page: 'orders' as Page, detail: upcomingDeliveries[0] ? `${upcomingDeliveries[0].code} — ${formatDate(upcomingDeliveries[0].due_date)}` : 'Nenhuma nos próximos dias' },
    { label: 'Pedidos atrasados', count: lateOrders.length, icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/20', page: 'orders' as Page, detail: lateOrders[0] ? `${lateOrders[0].code} venceu há ${Math.abs(daysUntil(lateOrders[0].due_date!))} dia(s)` : 'Nenhum atrasado' },
    { label: 'Orçamentos aguardando retorno', count: awaitingBudgets.length, icon: FileText, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', page: 'budgets' as Page, detail: awaitingBudgets.length > 0 ? `${awaitingBudgets.length} orçamento(s) enviado(s)` : 'Nenhum aguardando' },
    { label: 'Parcelas vencidas', count: overdueEntries.length, icon: TrendingDown, color: 'text-red-600 bg-red-50 dark:bg-red-900/20', page: 'financial' as Page, detail: overdueEntries.length > 0 ? `${formatCurrency(overdueEntries.reduce((s, e) => s + (e.total_amount - e.paid_amount), 0))} a receber` : 'Nenhuma vencida' },
    { label: 'Despesas próximas do vencimento', count: nearDueExpenses.length, icon: Wallet, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', page: 'financial' as Page, detail: nearDueExpenses.length > 0 ? `${formatCurrency(nearDueExpenses.reduce((s, e) => s + (e.amount - e.paid_amount), 0))} a pagar` : 'Nenhuma próxima' },
    { label: 'Oportunidades sem acompanhamento', count: unattendedOpportunities.length, icon: Users, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20', page: 'crm' as Page, detail: unattendedOpportunities.length > 0 ? `${unattendedOpportunities.length} oportunidade(s) pendente(s)` : 'Nenhuma pendente' },
    { label: 'Materiais abaixo do mínimo', count: lowStock.length, icon: Package, color: 'text-red-600 bg-red-50 dark:bg-red-900/20', page: 'inventory' as Page, detail: lowStock[0] ? `${lowStock[0].name}: ${lowStock[0].current_stock} ${lowStock[0].unit}` : 'Estoque em ordem' },
    { label: 'Campanhas sem retorno do investimento', count: campaignsBelowRoi.length, icon: Megaphone, color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20', page: 'campaigns' as Page, detail: campaignsBelowRoi[0] ? `${campaignsBelowRoi[0].name}` : 'Todas com retorno positivo' },
  ];
  const activePriorities = priorities.filter((p) => p.count > 0);

  if (loading) return <div className="py-20 text-center text-slate-400">Carregando painel...</div>;

  const stats = [
    { label: 'Clientes cadastrados', value: String(clients.length), sub: `+${newClientsThisMonth.length} este mês`, icon: Users, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20', page: 'clients' as Page },
    { label: 'Aniversariantes hoje', value: String(birthdaysToday.length), sub: birthdaysSoon.length > 0 ? `${birthdaysSoon.length} nos próximos 7 dias` : 'Nenhum nos próximos dias', icon: Cake, color: 'text-pink-600 bg-pink-50 dark:bg-pink-900/20', page: 'alerts' as Page },
    { label: 'Orçamentos pendentes', value: String(pendingBudgets.length), sub: `${approvedBudgets.length} aprovados`, icon: FileText, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', page: 'budgets' as Page },
    { label: 'Próximos compromissos', value: String(upcomingAppts.length), sub: upcomingAppts[0] ? `${formatDate(upcomingAppts[0].appointment_date)}` : 'Nenhum agendado', icon: Calendar, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20', page: 'agenda' as Page },
    { label: 'Saldo do caixa', value: formatCurrency(openCash ? cashBalance : 0), sub: openCash ? 'Caixa aberto' : 'Caixa fechado', icon: Wallet, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20', page: 'cash' as Page },
    { label: 'Valores a receber', value: formatCurrency(totalReceivable), sub: 'Contas em aberto', icon: TrendingUp, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', page: 'financial' as Page },
    { label: 'Contas a pagar', value: formatCurrency(totalPayable), sub: 'Despesas pendentes', icon: TrendingDown, color: 'text-red-500 bg-red-50 dark:bg-red-900/20', page: 'financial' as Page },
    { label: 'Resultado do mês', value: formatCurrency(monthResult), sub: `${formatCurrency(monthRevenue)} receitas · ${formatCurrency(monthExpensesPaid)} despesas`, icon: Receipt, color: monthResult >= 0 ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20', page: 'financial' as Page },
  ];

  const shortcuts = [
    { label: 'Cadastrar cliente', icon: Users, page: 'clients' as Page },
    { label: 'Gerar orçamento', icon: FileText, page: 'budgets' as Page },
    { label: 'Abrir caixa', icon: Wallet, page: 'cash' as Page },
    { label: 'Nova autorização', icon: ShieldCheck, page: 'authorizations' as Page },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Painel inicial</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Visão geral do estúdio em {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
      </div>

      {/* Shortcuts */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {shortcuts.map((s) => { const Icon = s.icon; return (
          <button key={s.label} onClick={() => onNavigate(s.page)} className="card p-4 flex items-center gap-3 hover:shadow-md transition-all hover:scale-[1.02]">
            <div className="h-10 w-10 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}><Icon className="h-5 w-5" /></div>
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300 text-left">{s.label}</span>
          </button>
        ); })}
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((s) => { const Icon = s.icon; return (
          <button key={s.label} onClick={() => onNavigate(s.page)} className="card p-5 text-left hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${s.color}`}><Icon className="h-5 w-5" /></div>
            </div>
            <p className="text-sm text-slate-400">{s.label}</p>
            <p className="text-xl font-bold text-slate-900 dark:text-slate-100 mt-1">{s.value}</p>
            <p className="text-xs text-slate-400 mt-1">{s.sub}</p>
          </button>
        ); })}
      </div>

      {/* Priority panel */}
      {activePriorities.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /> Painel de prioridades</h3>
            <span className="text-xs text-slate-400">{activePriorities.length} item(s) precisando de atenção</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {activePriorities.map((p) => { const Icon = p.icon; return (
              <button key={p.label} onClick={() => onNavigate(p.page)} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:border-slate-300 dark:hover:border-slate-600 transition-all text-left group">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${p.color}`}><Icon className="h-5 w-5" /></div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{p.label}</p>
                    <span className="ml-auto text-lg font-bold text-slate-900 dark:text-slate-100 flex-shrink-0">{p.count}</span>
                  </div>
                  <p className="text-xs text-slate-400 truncate mt-0.5">{p.detail}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
              </button>
            ); })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming appointments */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Calendar className="h-4 w-4" /> Próximos compromissos</h3>
            <button onClick={() => onNavigate('agenda')} className="text-xs text-slate-400 hover:text-slate-600">Ver todos</button>
          </div>
          {upcomingAppts.length === 0 ? (
            <EmptyState icon={<Calendar className="h-8 w-8" />} title="Sem compromissos" />
          ) : (
            <div className="space-y-3">
              {upcomingAppts.map((a) => { const client = clients.find((c) => c.id === a.client_id); return (
                <div key={a.id} className="flex items-center gap-3 text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>{new Date(a.appointment_date + 'T00:00:00').getDate()}</div>
                  <div className="flex-1 min-w-0"><p className="font-medium text-slate-900 dark:text-slate-100 truncate">{a.title}</p><p className="text-xs text-slate-400">{a.start_time} · {client?.full_name ?? 'Sem cliente'}</p></div>
                </div>
              ); })}
            </div>
          )}
        </div>

        {/* Birthdays */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Cake className="h-4 w-4" /> Aniversariantes próximos</h3>
            <button onClick={() => onNavigate('alerts')} className="text-xs text-slate-400 hover:text-slate-600">Ver todos</button>
          </div>
          {birthdaysToday.length === 0 && birthdaysSoon.length === 0 ? (
            <EmptyState icon={<Cake className="h-8 w-8" />} title="Nenhum aniversário próximo" />
          ) : (
            <div className="space-y-2">
              {birthdaysToday.map((c) => (
                <div key={c.id} className="flex items-center gap-3 text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                  <div className="h-9 w-9 rounded-full bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center text-pink-600 text-xs font-bold flex-shrink-0">{c.full_name.charAt(0)}</div>
                  <div className="flex-1"><p className="font-medium text-slate-900 dark:text-slate-100">{c.full_name}</p><p className="text-xs text-pink-500">Aniversário hoje!</p></div>
                  {c.whatsapp ?? c.phone ? <button onClick={(e) => { e.stopPropagation(); const phone = c.whatsapp ?? c.phone ?? ''; const tpl = templates.find((t) => t.category === 'aniversario'); const fallback = 'Olá, {NOME}! Tudo bem? A equipe {NOME_ESTUDIO} deseja a você um aniversário cheio de alegria, saúde e momentos especiais. Agradecemos por fazer parte da nossa história!'; window.open(buildWhatsAppUrl(phone, fillTemplate(tpl?.content ?? fallback, { NOME: c.full_name, NOME_ESTUDIO: settings.studio_name })), '_blank'); }} className="btn-ghost text-green-600 text-xs">WhatsApp</button> : null}
                </div>
              ))}
              {birthdaysSoon.filter((c) => !birthdaysToday.includes(c)).slice(0, 5).map((c) => {
                const d = daysUntil(`${new Date().getFullYear()}-${c.birth_date!.slice(5)}`);
                return (
                  <div key={c.id} className="flex items-center gap-3 text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                    <div className="h-9 w-9 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500 text-xs font-bold flex-shrink-0">{c.full_name.charAt(0)}</div>
                    <div className="flex-1"><p className="font-medium text-slate-900 dark:text-slate-100">{c.full_name}</p><p className="text-xs text-slate-400">Em {d} dia(s) · {formatDate(c.birth_date)}</p></div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent budgets */}
      <div className="card p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><FileText className="h-4 w-4" /> Orçamentos recentes</h3>
          <button onClick={() => onNavigate('budgets')} className="text-xs text-slate-400 hover:text-slate-600">Ver todos</button>
        </div>
        {budgets.length === 0 ? (
          <EmptyState icon={<FileText className="h-8 w-8" />} title="Nenhum orçamento" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="py-2">Código</th><th className="py-2">Cliente</th><th className="py-2 hidden sm:table-cell">Data</th><th className="py-2 text-right">Total</th><th className="py-2">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {budgets.slice(0, 5).map((b) => { const client = clients.find((c) => c.id === b.client_id); return (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => onNavigate('budgets')}>
                    <td className="py-2 font-mono text-xs text-slate-400">{b.code}</td>
                    <td className="py-2 font-medium text-slate-900 dark:text-slate-100">{client?.full_name ?? '—'}</td>
                    <td className="py-2 text-slate-500 hidden sm:table-cell">{formatDate(b.created_at)}</td>
                    <td className="py-2 text-right font-medium" style={{ color: 'var(--color-primary)' }}>{formatCurrency(b.total)}</td>
                    <td className="py-2"><span className={`badge ${b.status === 'aprovado' ? 'badge-success' : b.status === 'recusado' || b.status === 'cancelado' ? 'badge-danger' : 'badge-warning'}`}>{b.status}</span></td>
                  </tr>
                ); })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Image authorizations */}
      <div className="card p-5 mt-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Autorizações de uso de imagem</h3>
          <button onClick={() => onNavigate('authorizations')} className="text-xs text-slate-400 hover:text-slate-600">Ver todas</button>
        </div>
        {(() => {
          const activeAuths = auths.filter((a) => a.status === 'autorizado' && !(a.end_date && new Date(a.end_date) < new Date()));
          const expiredAuths = auths.filter((a) => a.status === 'expirado' || (a.status === 'autorizado' && a.end_date && new Date(a.end_date) < new Date()));
          const revokedAuths = auths.filter((a) => a.status === 'revogado');
          const pendingAuths = auths.filter((a) => a.status === 'rascunho' || a.status === 'aguardando_assinatura');
          if (auths.length === 0) return <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="Nenhuma autorização registrada" />;
          const cards = [
            { label: 'Ativas', value: activeAuths.length, icon: ShieldCheck, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
            { label: 'Pendentes', value: pendingAuths.length, icon: Clock, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
            { label: 'Vencidas', value: expiredAuths.length, icon: ShieldAlert, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
            { label: 'Revogadas', value: revokedAuths.length, icon: ShieldAlert, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
          ];
          return (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {cards.map((c) => { const Icon = c.icon; return (
                <button key={c.label} onClick={() => onNavigate('authorizations')} className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left">
                  <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${c.color}`}><Icon className="h-4 w-4" /></div>
                  <div><p className="text-lg font-bold text-slate-900 dark:text-slate-100">{c.value}</p><p className="text-xs text-slate-400">{c.label}</p></div>
                </button>
              ); })}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
