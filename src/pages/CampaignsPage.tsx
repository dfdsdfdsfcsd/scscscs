import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, todayISO } from '@/lib/utils';
import {
  Plus, Search, Trash2, Megaphone, TrendingUp, TrendingDown,
  Wallet, BarChart3, Target, Users, ShoppingCart, Camera,
  AlertCircle, CheckCircle, ChevronDown, ChevronRight, Edit3, Clock,
} from 'lucide-react';
import type {
  Campaign, Budget, ServiceOrder, FinancialEntry, FinancialExpense,
  Client, Appointment,
} from '@/lib/types';

const campaignStatusLabels: Record<string, string> = {
  ativa: 'Ativa', pausada: 'Pausada', encerrada: 'Encerrada',
};
const campaignStatusBadge: Record<string, string> = {
  ativa: 'badge-success', pausada: 'badge-warning', encerrada: 'badge-neutral',
};

type TabType = 'list' | 'commercial' | 'financial';

export function CampaignsPage() {
  const [tab, setTab] = useState<TabType>('list');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Campaign | null>(null);
  const [expandedCampaign, setExpandedCampaign] = useState<string | null>(null);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');

  // Data for results tabs
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);

  const [form, setForm] = useState({
    name: '', category: '', start_date: todayISO(), end_date: '',
    status: 'ativa', description: '', goal_revenue: 0, goal_orders: 0,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: campData }, { data: budgetData }, { data: orderData }, { data: entryData }, { data: expData }, { data: clientData }, { data: apptData }] = await Promise.all([
      supabase.from('campaigns').select('*').order('created_at', { ascending: false }),
      supabase.from('budgets').select('*'),
      supabase.from('service_orders').select('*'),
      supabase.from('financial_entries').select('*'),
      supabase.from('financial_expenses').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('appointments').select('*'),
    ]);
    setCampaigns((campData as Campaign[]) ?? []);
    setBudgets((budgetData as Budget[]) ?? []);
    setOrders((orderData as ServiceOrder[]) ?? []);
    setEntries((entryData as FinancialEntry[]) ?? []);
    setExpenses((expData as FinancialExpense[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setAppointments((apptData as Appointment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = campaigns.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.category?.toLowerCase().includes(q) ?? false);
  });

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', category: '', start_date: todayISO(), end_date: '', status: 'ativa', description: '', goal_revenue: 0, goal_orders: 0 });
    setModalOpen(true);
  };

  const openEdit = (c: Campaign) => {
    setEditingId(c.id);
    setForm({
      name: c.name, category: c.category ?? '', start_date: c.start_date ?? todayISO(),
      end_date: c.end_date ?? '', status: c.status, description: c.description ?? '',
      goal_revenue: c.goal_revenue ?? 0, goal_orders: c.goal_orders ?? 0,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast('Informe o nome da campanha', 'warning'); return; }
    const payload = {
      name: form.name, category: form.category || null,
      start_date: form.start_date || null, end_date: form.end_date || null,
      status: form.status, description: form.description || null,
      goal_revenue: form.goal_revenue > 0 ? form.goal_revenue : null,
      goal_orders: form.goal_orders > 0 ? form.goal_orders : null,
      updated_at: new Date().toISOString(),
    };
    if (editingId) {
      const { error } = await supabase.from('campaigns').update(payload).eq('id', editingId);
      if (error) { toast('Erro ao atualizar campanha', 'error'); return; }
      toast('Campanha atualizada', 'success');
    } else {
      const { error } = await supabase.from('campaigns').insert(payload);
      if (error) { toast('Erro ao criar campanha', 'error'); return; }
      toast('Campanha criada', 'success');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('campaigns').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir campanha', 'error'); return; }
    toast('Campanha excluída', 'success');
    setDeleteTarget(null);
    load();
  };

  // Campaign-scoped data
  const scopedBudgets = selectedCampaignId ? budgets.filter((b) => b.campaign_id === selectedCampaignId) : budgets;
  const scopedOrders = selectedCampaignId
    ? orders.filter((o) => o.campaign_id === selectedCampaignId || (selectedCampaignId && o.campaign === campaigns.find((c) => c.id === selectedCampaignId)?.name))
    : orders;
  const scopedExpenses = selectedCampaignId ? expenses.filter((e) => e.campaign_id === selectedCampaignId) : expenses;

  // For financial entries: link through budget_id
  const scopedBudgetIds = new Set(scopedBudgets.map((b) => b.id));
  const scopedEntries = selectedCampaignId ? entries.filter((e) => e.budget_id && scopedBudgetIds.has(e.budget_id)) : entries;

  // === 10.2 Commercial Result ===
  // Unique clients from budgets (not double-counted with orders)
  const campaignClientIds = new Set(scopedBudgets.map((b) => b.client_id));
  const campaignClients = clients.filter((c) => campaignClientIds.has(c.id));

  // Sessions (appointments linked to campaign clients in the campaign period)
  const campaignAppointments = selectedCampaignId
    ? appointments.filter((a) => campaignClientIds.has(a.client_id ?? '') && a.status === 'concluido')
    : appointments.filter((a) => a.status === 'concluido');

  // Contracted revenue (from budgets total, not from orders — avoids double counting)
  const contractedRevenue = scopedBudgets.reduce((s, b) => s + b.total, 0);
  const contractedDiscounts = scopedBudgets.reduce((s, b) => s + (b.general_discount ?? 0), 0);
  const netContracted = contractedRevenue;

  // Receipts (from financial entries linked to these budgets)
  const totalReceived = scopedEntries.reduce((s, e) => s + e.paid_amount, 0);
  const totalDiscounts = scopedEntries.reduce((s, e) => s + (e.discount_amount ?? 0), 0);
  const totalRefunds = scopedEntries.reduce((s, e) => s + (e.refund_amount ?? 0), 0);
  const balanceToReceive = scopedEntries.reduce((s, e) => s + (e.total_amount - e.paid_amount - (e.discount_amount ?? 0)), 0);

  // Orders count (from orders linked to campaign — distinct from budgets)
  const orderCount = scopedOrders.length;
  const budgetCount = scopedBudgets.length;

  // === 10.3 Financial Result ===
  // Investment committed = total expenses (parent expenses only, not installments to avoid duplication)
  const parentExpenses = scopedExpenses.filter((e) => !e.parent_expense_id);
  const investmentCommitted = parentExpenses.reduce((s, e) => s + e.amount, 0);
  const expensesPaid = scopedExpenses.reduce((s, e) => s + e.paid_amount, 0);
  const balanceToPay = scopedExpenses.reduce((s, e) => s + (e.amount - e.paid_amount), 0);

  // Result estimated = contracted revenue - investment committed
  const estimatedResult = netContracted - investmentCommitted;
  // Result by cash = actual receipts - actual payments
  const cashResult = totalReceived - expensesPaid;
  // Recovery percentage = receipts / investment
  const recoveryPct = investmentCommitted > 0 ? Math.round((totalReceived / investmentCommitted) * 100) : 0;
  // Missing value to break even
  const missingToBreakEven = Math.max(0, investmentCommitted - totalReceived);
  // Break-even point: when receipts = expenses
  const breakEvenReached = totalReceived >= investmentCommitted;

  // Indicators: red/yellow/green
  const indicatorColor = !breakEvenReached && recoveryPct < 50 ? 'red' : !breakEvenReached || balanceToPay > 0 ? 'yellow' : 'green';
  const indicatorBg = { red: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800', yellow: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800', green: 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' }[indicatorColor];
  const indicatorText = { red: 'text-red-600 dark:text-red-400', yellow: 'text-amber-600 dark:text-amber-400', green: 'text-emerald-600 dark:text-emerald-400' }[indicatorColor];
  const indicatorLabel = { red: 'Investimento não recuperado', yellow: 'Equilíbrio próximo ou pendências relevantes', green: 'Resultado de caixa positivo' }[indicatorColor];

  const tabs: { id: TabType; label: string; icon: typeof Megaphone }[] = [
    { id: 'list', label: 'Campanhas', icon: Megaphone },
    { id: 'commercial', label: 'Resultado comercial', icon: BarChart3 },
    { id: 'financial', label: 'Resultado financeiro', icon: Wallet },
  ];

  return (
    <div>
      <PageHeader
        title="Campanhas e rentabilidade"
        subtitle="Gerencie campanhas e analise resultados comercial e financeiro"
        actions={tab === 'list' ? <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova campanha</button> : undefined}
      />

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'list' && (
        <>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input className="input pl-10" placeholder="Buscar campanha..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<Megaphone className="h-12 w-12" />} title="Nenhuma campanha" description="Crie campanhas para acompanhar rentabilidade comercial e financeira." action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova campanha</button>} />
          ) : (
            <div className="space-y-3">
              {filtered.map((c) => {
                const cBudgets = budgets.filter((b) => b.campaign_id === c.id);
                const cOrders = orders.filter((o) => o.campaign_id === c.id || o.campaign === c.name);
                const cRevenue = cBudgets.reduce((s, b) => s + b.total, 0);
                const isExpanded = expandedCampaign === c.id;
                return (
                  <div key={c.id} className="card overflow-hidden">
                    <div className="flex items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => setExpandedCampaign(isExpanded ? null : c.id)}>
                      <div className="px-4 py-4 flex items-center gap-3 flex-1">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{c.name}</p>
                            {c.category && <span className="badge badge-info text-xs">{c.category}</span>}
                            <span className={`badge ${campaignStatusBadge[c.status] ?? 'badge-neutral'} text-xs`}>{campaignStatusLabels[c.status] ?? c.status}</span>
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {c.start_date && `Início ${formatDate(c.start_date)}`}
                            {c.end_date && ` · Fim ${formatDate(c.end_date)}`}
                            {` · ${cBudgets.length} orçamento(s) · ${cOrders.length} pedido(s)`}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Faturamento</p>
                          <p className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(cRevenue)}</p>
                        </div>
                        <button onClick={(e) => { e.stopPropagation(); openEdit(c); }} className="btn-ghost"><Edit3 className="h-4 w-4" /></button>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(c); }} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-700 p-4 bg-slate-50 dark:bg-slate-800/30 space-y-3">
                        {c.description && <p className="text-sm text-slate-600 dark:text-slate-300">{c.description}</p>}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div><p className="text-xs text-slate-400">Orçamentos</p><p className="font-medium">{cBudgets.length}</p></div>
                          <div><p className="text-xs text-slate-400">Pedidos</p><p className="font-medium">{cOrders.length}</p></div>
                          {c.goal_revenue && <div><p className="text-xs text-slate-400">Meta de faturamento</p><p className="font-medium">{formatCurrency(c.goal_revenue)}</p></div>}
                          {c.goal_orders && <div><p className="text-xs text-slate-400">Meta de pedidos</p><p className="font-medium">{c.goal_orders}</p></div>}
                        </div>
                        {c.goal_revenue && cRevenue > 0 && (
                          <div>
                            <div className="flex justify-between text-xs mb-1"><span className="text-slate-400">Progresso da meta</span><span className="font-medium">{Math.round((cRevenue / c.goal_revenue) * 100)}%</span></div>
                            <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"><div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${Math.min(100, (cRevenue / c.goal_revenue) * 100)}%` }} /></div>
                          </div>
                        )}
                        <div className="flex gap-2">
                          <button onClick={() => { setSelectedCampaignId(c.id); setTab('commercial'); }} className="btn-secondary text-xs"><BarChart3 className="h-3 w-3" /> Ver resultado comercial</button>
                          <button onClick={() => { setSelectedCampaignId(c.id); setTab('financial'); }} className="btn-secondary text-xs"><Wallet className="h-3 w-3" /> Ver resultado financeiro</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'commercial' && (
        <div className="space-y-6">
          {/* Campaign selector */}
          <div className="card p-4 flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Campanha:</label>
            <select className="input sm:w-64" value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
              <option value="">Todas as campanhas</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {selectedCampaignId && (() => {
              const c = campaigns.find((c) => c.id === selectedCampaignId);
              return c ? <span className={`badge ${campaignStatusBadge[c.status]}`}>{c.name}</span> : null;
            })()}
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5"><div className="flex items-center gap-2"><Users className="h-5 w-5 text-slate-400" /><p className="text-sm text-slate-400">Clientes</p></div><p className="text-2xl font-bold mt-1 text-slate-900 dark:text-slate-100">{campaignClients.length}</p></div>
            <div className="card p-5"><div className="flex items-center gap-2"><ShoppingCart className="h-5 w-5 text-slate-400" /><p className="text-sm text-slate-400">Pedidos</p></div><p className="text-2xl font-bold mt-1 text-slate-900 dark:text-slate-100">{orderCount}</p></div>
            <div className="card p-5"><div className="flex items-center gap-2"><Camera className="h-5 w-5 text-slate-400" /><p className="text-sm text-slate-400">Sessões realizadas</p></div><p className="text-2xl font-bold mt-1 text-slate-900 dark:text-slate-100">{campaignAppointments.length}</p></div>
            <div className="card p-5"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-500" /><p className="text-sm text-slate-400">Faturamento contratado</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(netContracted)}</p></div>
          </div>

          {/* Commercial detail */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Resultado comercial detalhado</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between"><span className="text-slate-500">Orçamentos aprovados:</span><span className="font-medium">{budgetCount}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Pedidos vinculados:</span><span className="font-medium">{orderCount}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Faturamento contratado (orçamentos):</span><span className="font-medium text-emerald-600">{formatCurrency(netContracted)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Descontos concedidos:</span><span className="font-medium text-amber-600">{formatCurrency(totalDiscounts)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Reembolsos:</span><span className="font-medium text-red-500">{formatCurrency(totalRefunds)}</span></div>
              <div className="flex justify-between"><span className="text-slate-500">Recebimentos efetivos:</span><span className="font-medium text-emerald-600">{formatCurrency(totalReceived)}</span></div>
              <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="font-semibold">Saldo a receber:</span><span className="font-bold text-amber-600">{formatCurrency(balanceToReceive)}</span></div>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-xs text-slate-400">
              O faturamento contratado é calculado a partir dos orçamentos vinculados à campanha. Os pedidos não são somados ao faturamento para evitar dupla contagem — um orçamento e seu pedido representam uma mesma venda.
            </div>
          </div>

          {/* Clients list */}
          {campaignClients.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-slate-400" /> Clientes da campanha</h3>
              <div className="space-y-2">
                {campaignClients.map((c) => {
                  const cBudgets = scopedBudgets.filter((b) => b.client_id === c.id);
                  const cOrders = scopedOrders.filter((o) => o.client_id === c.id);
                  return (
                    <div key={c.id} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                      <div><p className="font-medium text-slate-900 dark:text-slate-100">{c.full_name}</p><p className="text-xs text-slate-400">{cBudgets.length} orçamento(s) · {cOrders.length} pedido(s)</p></div>
                      <span className="font-medium text-emerald-600">{formatCurrency(cBudgets.reduce((s, b) => s + b.total, 0))}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'financial' && (
        <div className="space-y-6">
          {/* Campaign selector */}
          <div className="card p-4 flex items-center gap-4 flex-wrap">
            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">Campanha:</label>
            <select className="input sm:w-64" value={selectedCampaignId} onChange={(e) => setSelectedCampaignId(e.target.value)}>
              <option value="">Todas as campanhas</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Indicator */}
          <div className={`card p-5 border-2 ${indicatorBg}`}>
            <div className="flex items-center gap-3">
              {indicatorColor === 'red' && <AlertCircle className="h-6 w-6 text-red-500" />}
              {indicatorColor === 'yellow' && <AlertCircle className="h-6 w-6 text-amber-500" />}
              {indicatorColor === 'green' && <CheckCircle className="h-6 w-6 text-emerald-500" />}
              <div>
                <p className={`font-semibold ${indicatorText}`}>{indicatorLabel}</p>
                <p className="text-sm text-slate-400 mt-0.5">Recuperação: {recoveryPct}% · {breakEvenReached ? 'Ponto de equilíbrio atingido' : `Faltam ${formatCurrency(missingToBreakEven)} para equilibrar`}</p>
              </div>
            </div>
          </div>

          {/* Financial metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5"><div className="flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /><p className="text-sm text-slate-400">Investimento comprometido</p></div><p className="text-2xl font-bold mt-1 text-red-500">{formatCurrency(investmentCommitted)}</p></div>
            <div className="card p-5"><div className="flex items-center gap-2"><Wallet className="h-5 w-5 text-emerald-500" /><p className="text-sm text-slate-400">Despesas pagas</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(expensesPaid)}</p></div>
            <div className="card p-5"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /><p className="text-sm text-slate-400">Saldo a pagar</p></div><p className="text-2xl font-bold mt-1 text-amber-600">{formatCurrency(balanceToPay)}</p></div>
            <div className="card p-5"><div className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-500" /><p className="text-sm text-slate-400">Recebimentos efetivos</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(totalReceived)}</p></div>
          </div>

          {/* Result analysis */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-600" /> Resultado estimado</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Faturamento contratado:</span><span className="font-medium text-emerald-600">{formatCurrency(netContracted)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Investimento comprometido:</span><span className="font-medium text-red-500">{formatCurrency(investmentCommitted)}</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="font-semibold">Resultado estimado:</span><span className={`font-bold ${estimatedResult >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(estimatedResult)}</span></div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Resultado estimado = faturamento contratado - investimento comprometido. Não inclui outros custos operacionais.</p>
            </div>
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><Wallet className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Resultado pelo caixa</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Recebimentos efetivos:</span><span className="font-medium text-emerald-600">{formatCurrency(totalReceived)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Despesas pagas:</span><span className="font-medium text-red-500">{formatCurrency(expensesPaid)}</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="font-semibold">Resultado pelo caixa:</span><span className={`font-bold ${cashResult >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(cashResult)}</span></div>
              </div>
              <p className="text-xs text-slate-400 mt-3">Resultado pelo caixa = recebimentos efetivos - despesas pagas. Reflete o dinheiro que efetivamente entrou e saiu.</p>
            </div>
          </div>

          {/* Recovery and break-even */}
          <div className="card p-6">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><Target className="h-5 w-5 text-amber-500" /> Recuperação do investimento</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-500">Percentual recuperado</span>
                  <span className={`font-bold ${recoveryPct >= 100 ? 'text-emerald-600' : recoveryPct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{recoveryPct}%</span>
                </div>
                <div className="h-4 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${recoveryPct >= 100 ? 'bg-emerald-500' : recoveryPct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${Math.min(100, recoveryPct)}%` }} />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400">Investimento</p><p className="font-bold text-red-500 mt-1">{formatCurrency(investmentCommitted)}</p></div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400">Recuperado</p><p className="font-bold text-emerald-600 mt-1">{formatCurrency(totalReceived)}</p></div>
                <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400">Faltante</p><p className={`font-bold mt-1 ${missingToBreakEven > 0 ? 'text-red-500' : 'text-emerald-600'}`}>{formatCurrency(missingToBreakEven)}</p></div>
              </div>
              {investmentCommitted > 0 && (
                <p className="text-xs text-slate-400">Ponto de equilíbrio: {breakEvenReached ? 'atingido' : `faltam ${formatCurrency(missingToBreakEven)} em recebimentos para cobrir o investimento de ${formatCurrency(investmentCommitted)}`}.</p>
              )}
            </div>
          </div>

          {/* Expenses detail */}
          {parentExpenses.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /> Despesas da campanha</h3>
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="pb-2">Descrição</th><th className="pb-2 text-center">Parcelas</th><th className="pb-2 text-right">Total</th><th className="pb-2 text-right">Pago</th><th className="pb-2 text-right">Saldo</th></tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {parentExpenses.map((e) => {
                    const installments = scopedExpenses.filter((ex) => ex.parent_expense_id === e.id || ex.id === e.id);
                    const totalPaid = installments.reduce((s, inst) => s + inst.paid_amount, 0);
                    const totalAmount = e.amount;
                    return (
                      <tr key={e.id}>
                        <td className="py-2"><p className="font-medium">{e.description}</p><p className="text-xs text-slate-400">{e.category}{e.supplier && ` · ${e.supplier}`}{e.card_name && ` · ${e.card_name}`}</p></td>
                        <td className="py-2 text-center text-xs text-slate-400">{e.total_installments > 1 ? `${e.total_installments}x` : '—'}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(totalAmount)}</td>
                        <td className="py-2 text-right text-emerald-600">{formatCurrency(totalPaid)}</td>
                        <td className="py-2 text-right text-amber-600">{formatCurrency(totalAmount - totalPaid)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-slate-400 mt-3">O valor total representa o investimento completo, independentemente do número de parcelas. Uma compra de {formatCurrency(parentExpenses[0]?.amount ?? 0)} em 4x contabiliza {formatCurrency(parentExpenses[0]?.amount ?? 0)} e não o dobro.</p>
            </div>
          )}
        </div>
      )}

      {/* Campaign modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar campanha' : 'Nova campanha'} size="md">
        <div className="space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Categoria</label><input className="input" placeholder="Ex: Natal, Casamentos, Ensaio externo" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div><label className="label">Status</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(campaignStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Data de início</label><input type="date" className="input" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="label">Data de fim (opcional)</label><input type="date" className="input" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} /></div>
          </div>
          <div><label className="label">Descrição</label><textarea className="input min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Meta de faturamento (R$)</label><input type="number" step="0.01" className="input" value={form.goal_revenue} onChange={(e) => setForm({ ...form, goal_revenue: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Meta de pedidos</label><input type="number" className="input" value={form.goal_orders} onChange={(e) => setForm({ ...form, goal_orders: parseInt(e.target.value) || 0 })} /></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleSave} className="btn-primary">{editingId ? 'Salvar' : 'Criar campanha'}</button></div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir campanha" message={`Confirma a exclusão da campanha "${deleteTarget?.name}"? Os orçamentos e pedidos vinculados não serão excluídos.`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
