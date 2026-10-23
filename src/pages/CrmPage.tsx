import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, formatDateTime, todayISO, toLocalISODate, buildWhatsAppUrl, fillTemplate } from '@/lib/utils';
import { Plus, Search, Pencil, Trash2, CircleCheck as CheckCircle, Clock, TrendingUp, Calendar, FileText, Wallet, Sparkles, Wand as Wand2, Copy, FolderOpen, ShieldCheck, Phone, Target, Filter, ExternalLink, Users, ChartPie as PieChart, TriangleAlert as AlertTriangle, MessageSquare, Star, ArrowRight, Send } from 'lucide-react';
import type { CrmTask, Client, Budget, Appointment, FinancialEntry, ServiceOrder, ImageAuthorization, ClientAttachment, ClientPhotoFolder, CashTransaction, ClientHistory, MessageTemplate, Campaign, SalesFunnel, PostSaleFeedback } from '@/lib/types';
import type { Page } from '@/components/Sidebar';
import { AI_ACTIONS, callGemini, sanitizeClientData, type AiAction } from '@/lib/ai';

type TimelineEntry = {
  id: string;
  date: string;
  category: string;
  categoryLabel: string;
  description: string;
  sourceTable: string | null;
  sourceId: string | null;
  icon: typeof FileText;
  amount?: number;
};

const categoryConfig: Record<string, { label: string; icon: typeof FileText; color: string }> = {
  orcamento: { label: 'Orçamento', icon: FileText, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
  servico: { label: 'Serviço', icon: CheckCircle, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' },
  ordem: { label: 'Ordem de serviço', icon: FileText, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20' },
  compromisso: { label: 'Compromisso', icon: Calendar, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20' },
  pagamento: { label: 'Pagamento', icon: Wallet, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' },
  pendencia: { label: 'Pendência', icon: AlertTriangle, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
  entrega: { label: 'Entrega', icon: FolderOpen, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
  documento: { label: 'Documento', icon: FileText, color: 'text-slate-600 bg-slate-100 dark:bg-slate-800' },
  autorizacao: { label: 'Autorização', icon: ShieldCheck, color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20' },
  atendimento: { label: 'Atendimento', icon: Phone, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20' },
  observacao: { label: 'Observação', icon: Clock, color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  cadastro: { label: 'Cadastro', icon: Users, color: 'text-teal-600 bg-teal-50 dark:bg-teal-900/20' },
  alteracao: { label: 'Alteração', icon: Pencil, color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' },
  mensagem: { label: 'Mensagem', icon: Phone, color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20' },
  pasta_fotos: { label: 'Pasta de fotos', icon: FolderOpen, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20' },
};

const taskTypeLabels: Record<string, string> = {
  tarefa: 'Tarefa',
  oportunidade: 'Oportunidade',
  follow_up: 'Follow-up',
  atendimento: 'Atendimento',
};

const taskStatusLabels: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const taskPriorityLabels: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
};


interface CrmPageProps {
  onNavigate: (page: Page) => void;
}

export function CrmPage({ onNavigate }: CrmPageProps) {
  const { settings } = useSettings();
  const [tab, setTab] = useState<'timeline' | 'tasks' | 'funnel' | 'messages' | 'postsale' | 'reports' | 'ai'>('timeline');
  const [loading, setLoading] = useState(true);

  // Client selection
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [clientSearch, setClientSearch] = useState('');

  // Timeline
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  // Tasks
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<CrmTask | null>(null);
  const [taskForm, setTaskForm] = useState({ title: '', description: '', type: 'tarefa', status: 'pendente', priority: 'media', due_date: '', client_id: '' });
  const [deleteTask, setDeleteTask] = useState<CrmTask | null>(null);
  const [taskFilterStatus, setTaskFilterStatus] = useState('');

  // Reports
  const [reportData, setReportData] = useState<{ origin: string; clients: number; budgets: number; approved: number; revenue: number }[]>([]);
  const [reportLoading, setReportLoading] = useState(false);

  // Overdue/pending summary
  const [overdueCount, setOverdueCount] = useState(0);
  const [pendingPaymentsTotal, setPendingPaymentsTotal] = useState(0);
  const [overdueOrdersCount, setOverdueOrdersCount] = useState(0);

  // Funnel
  const [funnel, setFunnel] = useState<SalesFunnel[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [funnelModalOpen, setFunnelModalOpen] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<SalesFunnel | null>(null);
  const [funnelForm, setFunnelForm] = useState({ client_id: '', stage: 'novo_contato', origin: '', intended_service: '', campaign_id: '', responsible: '', next_action: '', next_action_date: '', estimated_value: '', notes: '' });
  const [deleteFunnel, setDeleteFunnel] = useState<SalesFunnel | null>(null);
  const [lossModalFunnel, setLossModalFunnel] = useState<SalesFunnel | null>(null);
  const [lossReason, setLossReason] = useState('');

  // Message templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', content: '', category: '' });
  const [deleteTemplate, setDeleteTemplate] = useState<MessageTemplate | null>(null);

  // Post-sale feedback
  const [feedbacks, setFeedbacks] = useState<PostSaleFeedback[]>([]);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [editingFeedback, setEditingFeedback] = useState<PostSaleFeedback | null>(null);
  const [feedbackForm, setFeedbackForm] = useState({ service_order_id: '', client_id: '', satisfaction_score: 5, observations: '', reported_problems: '', needs_followup: false, feedback_date: todayISO() });
  const [deleteFeedback, setDeleteFeedback] = useState<PostSaleFeedback | null>(null);
  const [feedbackFilter, setFeedbackFilter] = useState<'all' | 'needs_followup'>('all');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('*').order('full_name');
    setClients((data as Client[]) ?? []);
  }, []);

  const loadTasks = useCallback(async () => {
    const { data } = await supabase.from('crm_tasks').select('*').order('created_at', { ascending: false });
    setTasks((data as CrmTask[]) ?? []);
  }, []);

  const loadFunnel = useCallback(async () => {
    const { data } = await supabase.from('sales_funnel').select('*').order('created_at', { ascending: false });
    setFunnel((data as SalesFunnel[]) ?? []);
  }, []);

  const loadCampaigns = useCallback(async () => {
    const { data } = await supabase.from('campaigns').select('*').order('name');
    setCampaigns((data as Campaign[]) ?? []);
  }, []);

  const loadTemplates = useCallback(async () => {
    const { data } = await supabase.from('message_templates').select('*').order('category');
    setTemplates((data as MessageTemplate[]) ?? []);
  }, []);

  const loadFeedbacks = useCallback(async () => {
    const { data } = await supabase.from('post_sale_feedback').select('*').order('feedback_date', { ascending: false });
    setFeedbacks((data as PostSaleFeedback[]) ?? []);
  }, []);

  const loadOrders = useCallback(async () => {
    const { data } = await supabase.from('service_orders').select('*').in('status', ['concluido', 'entregue']).order('created_at', { ascending: false }).limit(100);
    setOrders((data as ServiceOrder[]) ?? []);
  }, []);

  const loadSummary = useCallback(async () => {
    const today = todayISO();
    const [overdueTasks, pendingEntries, overdueOrders] = await Promise.all([
      supabase.from('crm_tasks').select('id', { count: 'exact', head: true }).neq('status', 'concluido').neq('status', 'cancelado').lt('due_date', today),
      supabase.from('financial_entries').select('total_amount,paid_amount').neq('status', 'pago'),
      supabase.from('service_orders').select('id', { count: 'exact', head: true }).neq('status', 'concluido').neq('status', 'cancelado').lt('due_date', today),
    ]);
    setOverdueCount(overdueTasks.count ?? 0);
    const entries = (pendingEntries.data as { total_amount: number; paid_amount: number }[]) ?? [];
    setPendingPaymentsTotal(entries.reduce((s, e) => s + (e.total_amount - e.paid_amount), 0));
    setOverdueOrdersCount(overdueOrders.count ?? 0);
  }, []);

  const buildTimeline = useCallback(async (clientId: string) => {
    if (!clientId) { setTimeline([]); return; }
    setLoading(true);

    const [hist, budgets, appts, orders, entries, auths, attachs, folders, cashTx] = await Promise.all([
      supabase.from('client_history').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('budgets').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('appointments').select('*').eq('client_id', clientId).order('appointment_date', { ascending: false }),
      supabase.from('service_orders').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('financial_entries').select('*').eq('client_id', clientId).order('due_date', { ascending: false }),
      supabase.from('image_authorizations').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('client_attachments').select('*').eq('client_id', clientId).order('attached_at', { ascending: false }),
      supabase.from('client_photo_folders').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
      supabase.from('cash_transactions').select('*').eq('client_id', clientId).order('created_at', { ascending: false }),
    ]);

    const entries_list: TimelineEntry[] = [];

    // Manual history entries
    ((hist.data as (ClientHistory & { source_table?: string | null; source_id?: string | null })[]) ?? []).forEach((h) => {
      const cfg = categoryConfig[h.event_type] ?? categoryConfig.observacao;
      entries_list.push({
        id: h.id,
        date: h.created_at,
        category: h.event_type,
        categoryLabel: cfg.label,
        description: h.description,
        sourceTable: h.source_table ?? null,
        sourceId: h.source_id ?? null,
        icon: cfg.icon,
      });
    });

    // Budgets
    ((budgets.data as Budget[]) ?? []).forEach((b) => {
      entries_list.push({
        id: `budget-${b.id}`,
        date: b.created_at,
        category: 'orcamento',
        categoryLabel: 'Orçamento',
        description: `Orçamento ${b.code} — ${b.status} — Total: ${formatCurrency(b.total)}`,
        sourceTable: 'budgets',
        sourceId: b.id,
        icon: FileText,
        amount: b.total,
      });
    });

    // Appointments
    ((appts.data as Appointment[]) ?? []).forEach((a) => {
      entries_list.push({
        id: `appt-${a.id}`,
        date: `${a.appointment_date}T${a.start_time}:00`,
        category: 'compromisso',
        categoryLabel: 'Compromisso',
        description: `${a.title} — ${formatDate(a.appointment_date)} ${a.start_time} — ${a.status}`,
        sourceTable: 'appointments',
        sourceId: a.id,
        icon: Calendar,
      });
    });

    // Service orders
    ((orders.data as ServiceOrder[]) ?? []).forEach((o) => {
      entries_list.push({
        id: `order-${o.id}`,
        date: o.created_at,
        category: 'ordem',
        categoryLabel: 'Ordem de serviço',
        description: `OS ${o.code} — ${o.title} — ${o.status}`,
        sourceTable: 'service_orders',
        sourceId: o.id,
        icon: FileText,
      });
    });

    // Financial entries
    ((entries.data as FinancialEntry[]) ?? []).forEach((e) => {
      const pending = e.total_amount - e.paid_amount;
      entries_list.push({
        id: `entry-${e.id}`,
        date: e.due_date,
        category: e.status === 'pago' ? 'pagamento' : 'pendencia',
        categoryLabel: e.status === 'pago' ? 'Pagamento' : 'Pendência',
        description: `${e.description} — ${e.status === 'pago' ? `Pago: ${formatCurrency(e.paid_amount)}` : `Pendente: ${formatCurrency(pending)} (venc.: ${formatDate(e.due_date)})`}`,
        sourceTable: 'financial_entries',
        sourceId: e.id,
        icon: e.status === 'pago' ? Wallet : AlertTriangle,
        amount: pending > 0 ? pending : e.paid_amount,
      });
    });

    // Image authorizations
    ((auths.data as ImageAuthorization[]) ?? []).forEach((a) => {
      entries_list.push({
        id: `auth-${a.id}`,
        date: a.created_at,
        category: 'autorizacao',
        categoryLabel: 'Autorização',
        description: `Autorização ${a.doc_number ?? ''} — ${a.session_title ?? 'Ensaio'} — ${a.status}`,
        sourceTable: 'image_authorizations',
        sourceId: a.id,
        icon: ShieldCheck,
      });
    });

    // Attachments
    ((attachs.data as ClientAttachment[]) ?? []).forEach((a) => {
      entries_list.push({
        id: `attach-${a.id}`,
        date: a.attached_at,
        category: 'documento',
        categoryLabel: 'Documento',
        description: `Documento anexado: ${a.name} (${a.file_type ?? '—'})`,
        sourceTable: 'client_attachments',
        sourceId: a.id,
        icon: FileText,
      });
    });

    // Photo folders
    ((folders.data as ClientPhotoFolder[]) ?? []).forEach((f) => {
      entries_list.push({
        id: `folder-${f.id}`,
        date: f.created_at,
        category: 'pasta_fotos',
        categoryLabel: 'Pasta de fotos',
        description: `Pasta de fotos — autorização: ${f.authorization_status}`,
        sourceTable: 'client_photo_folders',
        sourceId: f.id,
        icon: FolderOpen,
      });
    });

    // Cash transactions
    ((cashTx.data as CashTransaction[]) ?? []).forEach((t) => {
      entries_list.push({
        id: `cash-${t.id}`,
        date: t.created_at,
        category: 'pagamento',
        categoryLabel: 'Pagamento',
        description: `${t.type === 'entrada' ? 'Recebimento' : 'Pagamento'}: ${t.description} — ${formatCurrency(t.amount)} (${t.payment_method})`,
        sourceTable: 'cash_transactions',
        sourceId: t.id,
        icon: Wallet,
        amount: t.amount,
      });
    });

    // Sort by date descending
    entries_list.sort((a, b) => b.date.localeCompare(a.date));
    setTimeline(entries_list);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadClients();
    loadTasks();
    loadSummary();
    loadFunnel();
    loadCampaigns();
    loadTemplates();
    loadFeedbacks();
    loadOrders();
  }, [loadClients, loadTasks, loadSummary, loadFunnel, loadCampaigns, loadTemplates, loadFeedbacks, loadOrders]);

  useEffect(() => {
    if (selectedClientId) buildTimeline(selectedClientId);
  }, [selectedClientId, buildTimeline]);

  const filteredTimeline = useMemo(() => {
    return timeline.filter((e) => {
      if (filterCategory && e.category !== filterCategory) return false;
      if (filterStartDate && e.date < filterStartDate) return false;
      if (filterEndDate && e.date > filterEndDate + 'T23:59:59') return false;
      return true;
    });
  }, [timeline, filterCategory, filterStartDate, filterEndDate]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (taskFilterStatus && t.status !== taskFilterStatus) return false;
      return true;
    });
  }, [tasks, taskFilterStatus]);

  const openSourceRecord = (entry: TimelineEntry) => {
    if (!entry.sourceTable) return;
    const pageMap: Record<string, Page> = {
      budgets: 'budgets',
      appointments: 'agenda',
      service_orders: 'orders',
      financial_entries: 'financial',
      image_authorizations: 'authorizations',
      client_attachments: 'clients',
      client_photo_folders: 'clients',
      cash_transactions: 'cash',
    };
    const page = pageMap[entry.sourceTable];
    if (page) onNavigate(page);
  };

  // Reports
  const loadReports = useCallback(async () => {
    setReportLoading(true);
    const [clientsData, budgetsData, entriesData] = await Promise.all([
      supabase.from('clients').select('id,origin'),
      supabase.from('budgets').select('client_id,status,total'),
      supabase.from('financial_entries').select('client_id,paid_amount,status'),
    ]);

    const clientsList = (clientsData.data as { id: string; origin: string | null }[]) ?? [];
    const budgetsList = (budgetsData.data as { client_id: string; status: string; total: number }[]) ?? [];
    const entriesList = (entriesData.data as { client_id: string; paid_amount: number; status: string }[]) ?? [];

    const originMap: Record<string, { origin: string; clients: number; budgets: number; approved: number; revenue: number }> = {};

    const getOrigin = (origin: string | null) => origin?.trim() || 'Não informado';

    clientsList.forEach((c) => {
      const o = getOrigin(c.origin);
      if (!originMap[o]) originMap[o] = { origin: o, clients: 0, budgets: 0, approved: 0, revenue: 0 };
      originMap[o].clients++;
    });

    const clientOrigin: Record<string, string> = {};
    clientsList.forEach((c) => { clientOrigin[c.id] = getOrigin(c.origin); });

    budgetsList.forEach((b) => {
      const o = clientOrigin[b.client_id] ?? 'Não informado';
      if (!originMap[o]) originMap[o] = { origin: o, clients: 0, budgets: 0, approved: 0, revenue: 0 };
      originMap[o].budgets++;
      if (b.status === 'aprovado') originMap[o].approved += 1;
    });

    entriesList.forEach((e) => {
      const o = clientOrigin[e.client_id] ?? 'Não informado';
      if (!originMap[o]) originMap[o] = { origin: o, clients: 0, budgets: 0, approved: 0, revenue: 0 };
      if (e.status === 'pago') originMap[o].revenue += e.paid_amount;
    });

    const result = Object.values(originMap).sort((a, b) => b.clients - a.clients);
    setReportData(result);
    setReportLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'reports') loadReports();
  }, [tab, loadReports]);

  const openTaskNew = () => {
    setEditingTask(null);
    setTaskForm({ title: '', description: '', type: 'tarefa', status: 'pendente', priority: 'media', due_date: '', client_id: selectedClientId });
    setTaskModalOpen(true);
  };

  const openTaskEdit = (t: CrmTask) => {
    setEditingTask(t);
    setTaskForm({ title: t.title, description: t.description ?? '', type: t.type, status: t.status, priority: t.priority, due_date: t.due_date ?? '', client_id: t.client_id ?? '' });
    setTaskModalOpen(true);
  };

  const handleTaskSave = async () => {
    if (!taskForm.title.trim()) { toast('Informe um título', 'warning'); return; }
    const payload = {
      title: taskForm.title.trim(),
      description: taskForm.description || null,
      type: taskForm.type,
      status: taskForm.status,
      priority: taskForm.priority,
      due_date: taskForm.due_date || null,
      client_id: taskForm.client_id || null,
    };
    if (editingTask) {
      const { error } = await supabase.from('crm_tasks').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingTask.id);
      if (error) { toast('Erro ao atualizar tarefa', 'error'); return; }
      toast('Tarefa atualizada', 'success');
    } else {
      const { error } = await supabase.from('crm_tasks').insert(payload);
      if (error) { toast('Erro ao criar tarefa', 'error'); return; }
      toast('Tarefa criada', 'success');
    }
    setTaskModalOpen(false);
    loadTasks();
    loadSummary();
  };

  const handleTaskDelete = async () => {
    if (!deleteTask) return;
    const { error } = await supabase.from('crm_tasks').delete().eq('id', deleteTask.id);
    if (error) { toast('Erro ao excluir tarefa', 'error'); return; }
    toast('Tarefa excluída', 'success');
    setDeleteTask(null);
    loadTasks();
    loadSummary();
  };

  const toggleTaskStatus = async (t: CrmTask) => {
    const newStatus = t.status === 'concluido' ? 'pendente' : 'concluido';
    const updates: Partial<CrmTask> = { status: newStatus, updated_at: new Date().toISOString() };
    if (newStatus === 'concluido') updates.completed_at = new Date().toISOString();
    else updates.completed_at = null;
    await supabase.from('crm_tasks').update(updates).eq('id', t.id);
    loadTasks();
    loadSummary();
  };

  const filteredClients = clients.filter((c) =>
    c.full_name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.code.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const summaryCards = [
    { label: 'Tarefas atrasadas', value: overdueCount, icon: AlertTriangle, color: 'text-red-500 bg-red-50 dark:bg-red-900/20' },
    { label: 'Pagamentos pendentes', value: formatCurrency(pendingPaymentsTotal), icon: Wallet, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20' },
    { label: 'OS atrasadas', value: overdueOrdersCount, icon: Clock, color: 'text-orange-500 bg-orange-50 dark:bg-orange-900/20' },
  ];

  const STAGES = ['novo_contato', 'atendimento', 'orcamento_enviado', 'aguardando_resposta', 'negociacao', 'contratado', 'perdido'] as const;
  const STAGE_LABELS: Record<string, string> = {
    novo_contato: 'Novo contato', atendimento: 'Atendimento', orcamento_enviado: 'Orçamento enviado',
    aguardando_resposta: 'Aguardando resposta', negociacao: 'Negociação', contratado: 'Contratado', perdido: 'Perdido',
  };
  const STAGE_COLORS: Record<string, string> = {
    novo_contato: 'border-t-sky-400', atendimento: 'border-t-cyan-400', orcamento_enviado: 'border-t-amber-400',
    aguardando_resposta: 'border-t-violet-400', negociacao: 'border-t-orange-400', contratado: 'border-t-emerald-400', perdido: 'border-t-red-400',
  };

  const openFunnelNew = () => { setEditingFunnel(null); setFunnelForm({ client_id: '', stage: 'novo_contato', origin: '', intended_service: '', campaign_id: '', responsible: '', next_action: '', next_action_date: '', estimated_value: '', notes: '' }); setFunnelModalOpen(true); };
  const openFunnelEdit = (f: SalesFunnel) => { setEditingFunnel(f); setFunnelForm({ client_id: f.client_id ?? '', stage: f.stage, origin: f.origin ?? '', intended_service: f.intended_service ?? '', campaign_id: f.campaign_id ?? '', responsible: f.responsible ?? '', next_action: f.next_action ?? '', next_action_date: f.next_action_date ?? '', estimated_value: f.estimated_value ? String(f.estimated_value) : '', notes: f.notes ?? '' }); setFunnelModalOpen(true); };
  const handleFunnelSave = async () => {
    if (!funnelForm.client_id) { toast('Selecione um cliente', 'warning'); return; }
    const payload = { client_id: funnelForm.client_id, stage: funnelForm.stage, origin: funnelForm.origin || null, intended_service: funnelForm.intended_service || null, campaign_id: funnelForm.campaign_id || null, responsible: funnelForm.responsible || null, next_action: funnelForm.next_action || null, next_action_date: funnelForm.next_action_date || null, estimated_value: Number(funnelForm.estimated_value) || 0, notes: funnelForm.notes || null };
    if (editingFunnel) { const { error } = await supabase.from('sales_funnel').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingFunnel.id); if (error) { toast('Erro ao atualizar', 'error'); return; } toast('Oportunidade atualizada', 'success'); }
    else { const { error } = await supabase.from('sales_funnel').insert(payload); if (error) { toast('Erro ao criar', 'error'); return; } toast('Oportunidade criada', 'success'); }
    setFunnelModalOpen(false); loadFunnel();
  };
  const handleFunnelDelete = async () => { if (!deleteFunnel) return; const { error } = await supabase.from('sales_funnel').delete().eq('id', deleteFunnel.id); if (error) { toast('Erro ao excluir', 'error'); return; } toast('Excluído', 'success'); setDeleteFunnel(null); loadFunnel(); };
  const moveFunnelStage = async (f: SalesFunnel, newStage: string) => {
    if (newStage === 'perdido') { setLossModalFunnel(f); setLossReason(f.loss_reason ?? ''); return; }
    const { error } = await supabase.from('sales_funnel').update({ stage: newStage, loss_reason: null, updated_at: new Date().toISOString() }).eq('id', f.id); if (error) { toast('Erro ao mover', 'error'); return; } loadFunnel();
  };
  const handleLossConfirm = async () => { if (!lossModalFunnel) return; const { error } = await supabase.from('sales_funnel').update({ stage: 'perdido', loss_reason: lossReason || 'Não informado', updated_at: new Date().toISOString() }).eq('id', lossModalFunnel.id); if (error) { toast('Erro', 'error'); return; } toast('Marcada como perdida', 'success'); setLossModalFunnel(null); loadFunnel(); };

  const openTemplateNew = () => { setEditingTemplate(null); setTemplateForm({ name: '', content: '', category: '' }); setTemplateModalOpen(true); };
  const openTemplateEdit = (t: MessageTemplate) => { setEditingTemplate(t); setTemplateForm({ name: t.name, content: t.content, category: t.category }); setTemplateModalOpen(true); };
  const handleTemplateSave = async () => {
    if (!templateForm.name.trim() || !templateForm.content.trim()) { toast('Preencha nome e conteúdo', 'warning'); return; }
    const payload = { name: templateForm.name.trim(), content: templateForm.content.trim(), category: templateForm.category || 'geral' };
    if (editingTemplate) { const { error } = await supabase.from('message_templates').update(payload).eq('id', editingTemplate.id); if (error) { toast('Erro ao atualizar', 'error'); return; } toast('Modelo atualizado', 'success'); }
    else { const { error } = await supabase.from('message_templates').insert(payload); if (error) { toast('Erro ao criar', 'error'); return; } toast('Modelo criado', 'success'); }
    setTemplateModalOpen(false); loadTemplates();
  };
  const handleTemplateDelete = async () => { if (!deleteTemplate) return; const { error } = await supabase.from('message_templates').delete().eq('id', deleteTemplate.id); if (error) { toast('Erro ao excluir', 'error'); return; } toast('Modelo excluído', 'success'); setDeleteTemplate(null); loadTemplates(); };
  const copyTemplate = (t: MessageTemplate) => {
    const client = clients.find((c) => c.id === selectedClientId);
    const filled = fillTemplate(t.content, { NOME: client?.full_name ?? 'CLIENTE', NOME_ESTUDIO: settings.studio_name ?? 'Estúdio', DATA: formatDate(todayISO()), HORA: '', VALOR: '', CODIGO: '' });
    navigator.clipboard.writeText(filled); toast('Mensagem copiada', 'success');
  };
  const sendWhatsApp = (t: MessageTemplate) => {
    const client = clients.find((c) => c.id === selectedClientId);
    const phone = client?.whatsapp ?? client?.phone ?? '';
    if (!phone) { toast('Cliente sem telefone/WhatsApp', 'warning'); return; }
    const filled = fillTemplate(t.content, { NOME: client?.full_name ?? 'CLIENTE', NOME_ESTUDIO: settings.studio_name ?? 'Estúdio', DATA: formatDate(todayISO()), HORA: '', VALOR: '', CODIGO: '' });
    window.open(buildWhatsAppUrl(phone, filled), '_blank'); toast('WhatsApp aberto — confirme o envio no aplicativo', 'info');
  };

  const openFeedbackNew = () => { setEditingFeedback(null); setFeedbackForm({ service_order_id: '', client_id: '', satisfaction_score: 5, observations: '', reported_problems: '', needs_followup: false, feedback_date: todayISO() }); setFeedbackModalOpen(true); };
  const openFeedbackEdit = (f: PostSaleFeedback) => { setEditingFeedback(f); setFeedbackForm({ service_order_id: f.service_order_id, client_id: f.client_id, satisfaction_score: f.satisfaction_score, observations: f.observations ?? '', reported_problems: f.reported_problems ?? '', needs_followup: f.needs_followup, feedback_date: f.feedback_date }); setFeedbackModalOpen(true); };
  const handleFeedbackSave = async () => {
    if (!feedbackForm.service_order_id) { toast('Selecione uma ordem de serviço', 'warning'); return; }
    const needsFollowup = feedbackForm.needs_followup || feedbackForm.satisfaction_score <= 2 || !!feedbackForm.reported_problems.trim();
    const order = orders.find((o) => o.id === feedbackForm.service_order_id);
    const payload = { service_order_id: feedbackForm.service_order_id, client_id: order?.client_id ?? feedbackForm.client_id, satisfaction_score: feedbackForm.satisfaction_score, observations: feedbackForm.observations || null, reported_problems: feedbackForm.reported_problems || null, needs_followup: needsFollowup, followup_done: editingFeedback?.followup_done ?? false, feedback_date: feedbackForm.feedback_date };
    if (editingFeedback) { const { error } = await supabase.from('post_sale_feedback').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingFeedback.id); if (error) { toast('Erro ao atualizar', 'error'); return; } toast('Feedback atualizado', 'success'); }
    else { const { error } = await supabase.from('post_sale_feedback').insert(payload); if (error) { toast('Erro ao registrar', 'error'); return; } toast('Feedback registrado', 'success'); }
    setFeedbackModalOpen(false); loadFeedbacks();
  };
  const handleFeedbackDelete = async () => { if (!deleteFeedback) return; const { error } = await supabase.from('post_sale_feedback').delete().eq('id', deleteFeedback.id); if (error) { toast('Erro ao excluir', 'error'); return; } toast('Feedback excluído', 'success'); setDeleteFeedback(null); loadFeedbacks(); };
  const toggleFollowupDone = async (f: PostSaleFeedback) => { const { error } = await supabase.from('post_sale_feedback').update({ followup_done: !f.followup_done, updated_at: new Date().toISOString() }).eq('id', f.id); if (error) { toast('Erro', 'error'); return; } loadFeedbacks(); };

  const tabs = [
    { id: 'timeline' as const, label: 'Linha do tempo', icon: Clock },
    { id: 'tasks' as const, label: 'Tarefas', icon: Target },
    { id: 'funnel' as const, label: 'Funil de vendas', icon: TrendingUp },
    { id: 'messages' as const, label: 'Mensagens', icon: MessageSquare },
    { id: 'postsale' as const, label: 'Pós-venda', icon: Star },
    { id: 'reports' as const, label: 'Relatórios', icon: PieChart },
    { id: 'ai' as const, label: 'Assistente IA', icon: Sparkles },
  ];

  return (
    <div>
      <PageHeader title="CRM e histórico" subtitle="Acompanhe atendimentos, vendas, oportunidades, pagamentos e trabalhos atrasados" />

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {summaryCards.map((s) => { const Icon = s.icon; return (
          <div key={s.label} className="card p-5">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 ${s.color}`}><Icon className="h-5 w-5" /></div>
              <div>
                <p className="text-sm text-slate-400">{s.label}</p>
                <p className="text-xl font-bold text-slate-900 dark:text-slate-100">{s.value}</p>
              </div>
            </div>
          </div>
        ); })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`}
            style={tab === t.id ? { borderColor: 'var(--color-primary)' } : { borderColor: 'transparent' }}>
            <Icon className="h-4 w-4" /> {t.label}
          </button>
        ); })}
      </div>

      {/* Timeline tab */}
      {tab === 'timeline' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="label">Cliente</label>
                <select className="input" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                  <option value="">Selecione um cliente...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.full_name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
                  <option value="">Todas</option>
                  {Object.entries(categoryConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Período</label>
                <div className="flex gap-2">
                  <input type="date" className="input text-sm" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)} />
                  <input type="date" className="input text-sm" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)} />
                </div>
              </div>
            </div>
          </div>

          {!selectedClientId ? (
            <EmptyState icon={<Users className="h-12 w-12" />} title="Selecione um cliente" description="Escolha um cliente para visualizar sua linha do tempo completa." />
          ) : loading ? (
            <div className="py-20 text-center text-slate-400">Carregando linha do tempo...</div>
          ) : filteredTimeline.length === 0 ? (
            <EmptyState icon={<Clock className="h-12 w-12" />} title="Nenhum registro encontrado" description="Não há registros para os filtros selecionados." />
          ) : (
            <div className="card p-6">
              <p className="text-sm text-slate-400 mb-4">{filteredTimeline.length} registro(s) encontrado(s)</p>
              <div className="space-y-1">
                {filteredTimeline.map((entry) => { const Icon = entry.icon; return (
                  <div key={entry.id} className="flex gap-3 group">
                    <div className="flex flex-col items-center">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${categoryConfig[entry.category]?.color ?? 'text-slate-500 bg-slate-100'}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="w-px flex-1 bg-slate-200 dark:bg-slate-700" />
                    </div>
                    <div className="pb-5 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm text-slate-900 dark:text-slate-100">{entry.description}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{formatDateTime(entry.date)} · {entry.categoryLabel}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {entry.amount !== undefined && entry.amount > 0 && (
                            <span className="text-xs font-medium text-slate-500">{formatCurrency(entry.amount)}</span>
                          )}
                          {entry.sourceTable && (
                            <button onClick={() => openSourceRecord(entry)} className="btn-ghost text-xs opacity-0 group-hover:opacity-100 transition-opacity" title="Abrir registro">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ); })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tasks tab */}
      {tab === 'tasks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <select className="input sm:w-48" value={taskFilterStatus} onChange={(e) => setTaskFilterStatus(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="pendente">Pendentes</option>
              <option value="em_andamento">Em andamento</option>
              <option value="concluido">Concluídos</option>
              <option value="cancelado">Cancelados</option>
            </select>
            <button onClick={openTaskNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova tarefa</button>
          </div>

          {filteredTasks.length === 0 ? (
            <EmptyState icon={<Target className="h-12 w-12" />} title="Nenhuma tarefa" description="Crie tarefas, oportunidades e follow-ups para acompanhar seus atendimentos." action={<button onClick={openTaskNew} className="btn-primary"><Plus className="h-4 w-4" /> Criar tarefa</button>} />
          ) : (
            <div className="space-y-3">
              {filteredTasks.map((t) => {
                const client = clients.find((c) => c.id === t.client_id);
                const isOverdue = t.due_date && t.due_date < todayISO() && t.status !== 'concluido' && t.status !== 'cancelado';
                return (
                  <div key={t.id} className={`card p-4 ${isOverdue ? 'border-red-200 dark:border-red-800' : ''}`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleTaskStatus(t)} className="mt-0.5 flex-shrink-0">
                        <div className={`h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${t.status === 'concluido' ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600 hover:border-teal-500'}`}>
                          {t.status === 'concluido' && <CheckCircle className="h-3 w-3 text-white" />}
                        </div>
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-medium ${t.status === 'concluido' ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>{t.title}</p>
                          <span className={`badge text-xs ${t.status === 'concluido' ? 'badge-success' : t.status === 'cancelado' ? 'badge-neutral' : t.status === 'em_andamento' ? 'badge-info' : 'badge-warning'}`}>{taskStatusLabels[t.status] ?? t.status}</span>
                          <span className="badge badge-neutral text-xs">{taskTypeLabels[t.type] ?? t.type}</span>
                          <span className={`badge text-xs ${t.priority === 'alta' ? 'badge-danger' : t.priority === 'media' ? 'badge-warning' : 'badge-neutral'}`}>{taskPriorityLabels[t.priority] ?? t.priority}</span>
                          {isOverdue && <span className="badge badge-danger text-xs">Atrasada</span>}
                        </div>
                        {t.description && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t.description}</p>}
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                          {client && <span>{client.full_name}</span>}
                          {t.due_date && <span>Venc.: {formatDate(t.due_date)}</span>}
                          {t.completed_at && <span>Concluído em {formatDate(t.completed_at)}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => openTaskEdit(t)} className="btn-ghost" title="Editar"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteTask(t)} className="btn-ghost text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Funnel tab */}
      {tab === 'funnel' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-slate-400">{funnel.length} oportunidade(s) no funil</p>
            <button onClick={openFunnelNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova oportunidade</button>
          </div>
          {funnel.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-12 w-12" />} title="Funil vazio" description="Adicione oportunidades para acompanhar a jornada do contato ao contrato." action={<button onClick={openFunnelNew} className="btn-primary"><Plus className="h-4 w-4" /> Criar oportunidade</button>} />
          ) : (
            <div className="overflow-x-auto pb-4">
              <div className="flex gap-3 min-w-max">
                {STAGES.map((stage) => {
                  const stageItems = funnel.filter((f) => f.stage === stage);
                  const totalValue = stageItems.reduce((s, f) => s + f.estimated_value, 0);
                  return (
                    <div key={stage} className={`w-64 flex-shrink-0 rounded-xl border-t-4 ${STAGE_COLORS[stage]} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700`}>
                      <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-700">
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{STAGE_LABELS[stage]}</p>
                        <p className="text-xs text-slate-400">{stageItems.length} · {formatCurrency(totalValue)}</p>
                      </div>
                      <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                        {stageItems.map((f) => {
                          const client = clients.find((c) => c.id === f.client_id);
                          const campaign = campaigns.find((c) => c.id === f.campaign_id);
                          const isOverdue = f.next_action_date && f.next_action_date < todayISO() && f.stage !== 'perdido' && f.stage !== 'contratado';
                          return (
                            <div key={f.id} className={`rounded-lg border p-2.5 text-xs cursor-pointer hover:shadow-sm transition-all ${isOverdue ? 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-600'}`} onClick={() => openFunnelEdit(f)}>
                              <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{client?.full_name ?? 'Sem cliente'}</p>
                              {f.intended_service && <p className="text-slate-400 truncate mt-0.5">{f.intended_service}</p>}
                              {f.origin && <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 text-[10px]">{f.origin}</span>}
                              {f.responsible && <p className="text-slate-400 mt-0.5">Resp.: {f.responsible}</p>}
                              {f.estimated_value > 0 && <p className="font-medium mt-0.5" style={{ color: 'var(--color-primary)' }}>{formatCurrency(f.estimated_value)}</p>}
                              {f.next_action && <p className="text-slate-500 mt-1 flex items-center gap-1"><Clock className="h-3 w-3" /> {f.next_action}{f.next_action_date ? ` (${formatDate(f.next_action_date)})` : ''}</p>}
                              {f.stage === 'perdido' && f.loss_reason && <p className="text-red-500 mt-1">Motivo: {f.loss_reason}</p>}
                              {f.budget_id && <p className="text-amber-500 mt-0.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Orçamento vinculado</p>}
                              {f.order_id && <p className="text-teal-500 mt-0.5 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> OS vinculada</p>}
                              {campaign && <p className="text-pink-500 mt-0.5 flex items-center gap-1"><TrendingUp className="h-3 w-3" /> {campaign.name}</p>}
                              <div className="flex items-center gap-0.5 mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 flex-wrap">
                                {STAGES.filter((s) => s !== stage).map((s) => (
                                  <button key={s} onClick={(e) => { e.stopPropagation(); moveFunnelStage(f, s); }} title={STAGE_LABELS[s]} className="px-1.5 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">{STAGE_LABELS[s].split(' ')[0]}</button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {stageItems.length === 0 && <p className="text-center text-slate-300 dark:text-slate-600 py-4 text-xs">Vazio</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages tab */}
      {tab === 'messages' && (
        <div className="space-y-4">
          <div className="card p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1">
                <label className="label">Cliente para preenchimento automático</label>
                <select className="input" value={selectedClientId} onChange={(e) => setSelectedClientId(e.target.value)}>
                  <option value="">Selecione um cliente (opcional)...</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.full_name}</option>)}
                </select>
              </div>
              <button onClick={openTemplateNew} className="btn-primary flex-shrink-0 mt-5"><Plus className="h-4 w-4" /> Novo modelo</button>
            </div>
          </div>
          {templates.length === 0 ? (
            <EmptyState icon={<MessageSquare className="h-12 w-12" />} title="Nenhum modelo de mensagem" description="Crie modelos para confirmação de ensaio, retorno de orçamento, lembrete de pagamento, aviso de entrega e pós-venda." />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {templates.map((t) => (
                <div key={t.id} className="card p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{t.name}</p>
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-500">{t.category}</span>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => copyTemplate(t)} title="Copiar" className="btn-ghost p-1.5"><Copy className="h-4 w-4" /></button>
                      <button onClick={() => sendWhatsApp(t)} title="WhatsApp" className="btn-ghost p-1.5 text-green-600"><Send className="h-4 w-4" /></button>
                      <button onClick={() => openTemplateEdit(t)} title="Editar" className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTemplate(t)} title="Excluir" className="btn-ghost p-1.5 text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap line-clamp-4">{t.content}</p>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-400">E-mail e WhatsApp são abertos no aplicativo correspondente — o envio só é registrado quando efetivado na plataforma. Placeholders: {'{NOME}'}, {'{NOME_ESTUDIO}'}, {'{DATA}'}, {'{HORA}'}, {'{VALOR}'}, {'{CODIGO}'}.</p>
        </div>
      )}

      {/* Post-sale tab */}
      {tab === 'postsale' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex gap-2">
              <button onClick={() => setFeedbackFilter('all')} className={`px-3 py-1.5 rounded-lg text-sm ${feedbackFilter === 'all' ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100' : 'text-slate-500'}`}>Todos</button>
              <button onClick={() => setFeedbackFilter('needs_followup')} className={`px-3 py-1.5 rounded-lg text-sm ${feedbackFilter === 'needs_followup' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300' : 'text-slate-500'}`}>Exigem retorno</button>
            </div>
            <button onClick={openFeedbackNew} className="btn-primary"><Plus className="h-4 w-4" /> Novo feedback</button>
          </div>
          {feedbackFilter === 'needs_followup' && (
            <div className="card p-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="h-4 w-4 inline mr-1" /> {feedbacks.filter((f) => f.needs_followup && !f.followup_done).length} caso(s) exigem retorno.</p>
            </div>
          )}
          {(() => {
            const filtered = feedbackFilter === 'needs_followup' ? feedbacks.filter((f) => f.needs_followup && !f.followup_done) : feedbacks;
            if (filtered.length === 0) return <EmptyState icon={<Star className="h-12 w-12" />} title="Nenhum feedback" description="Registre a satisfação do cliente após a entrega." action={<button onClick={openFeedbackNew} className="btn-primary"><Plus className="h-4 w-4" /> Registrar feedback</button>} />;
            return (
              <div className="space-y-3">
                {filtered.map((f) => {
                  const client = clients.find((c) => c.id === f.client_id);
                  return (
                    <div key={f.id} className={`card p-4 ${f.needs_followup && !f.followup_done ? 'border-amber-300 dark:border-amber-700' : ''}`}>
                      <div className="flex items-start gap-3">
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          {[1, 2, 3, 4, 5].map((n) => <Star key={n} className={`h-4 w-4 ${n <= f.satisfaction_score ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`} />)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{client?.full_name ?? 'Cliente'}</p>
                            <span className="text-xs text-slate-400">{formatDate(f.feedback_date)}</span>
                            {f.needs_followup && <span className={`badge text-xs ${f.followup_done ? 'badge-success' : 'badge-danger'}`}>{f.followup_done ? 'Retorno feito' : 'Exige retorno'}</span>}
                          </div>
                          {f.observations && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{f.observations}</p>}
                          {f.reported_problems && <p className="text-sm text-red-500 mt-1"><AlertTriangle className="h-3 w-3 inline mr-1" /> {f.reported_problems}</p>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {f.needs_followup && !f.followup_done && <button onClick={() => toggleFollowupDone(f)} className="btn-ghost text-emerald-600" title="Marcar retorno feito"><CheckCircle className="h-4 w-4" /></button>}
                          <button onClick={() => openFeedbackEdit(f)} className="btn-ghost" title="Editar"><Pencil className="h-4 w-4" /></button>
                          <button onClick={() => setDeleteFeedback(f)} className="btn-ghost text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* Reports tab */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {reportLoading ? (
            <div className="py-20 text-center text-slate-400">Carregando relatórios...</div>
          ) : reportData.length === 0 ? (
            <EmptyState icon={<PieChart className="h-12 w-12" />} title="Sem dados para relatório" description="Cadastre clientes com origem para gerar relatórios comparativos." />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
                <div className="card p-4">
                  <p className="text-sm text-slate-400">Total de clientes</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reportData.reduce((s, r) => s + r.clients, 0)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-slate-400">Orçamentos totais</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reportData.reduce((s, r) => s + r.budgets, 0)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-slate-400">Orçamentos aprovados</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{reportData.reduce((s, r) => s + r.approved, 0)}</p>
                </div>
                <div className="card p-4">
                  <p className="text-sm text-slate-400">Faturamento total</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(reportData.reduce((s, r) => s + r.revenue, 0))}</p>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                    <tr>
                      <th className="px-4 py-3 font-medium">Origem</th>
                      <th className="px-4 py-3 font-medium text-right">Clientes</th>
                      <th className="px-4 py-3 font-medium text-right">Orçamentos</th>
                      <th className="px-4 py-3 font-medium text-right">Aprovados</th>
                      <th className="px-4 py-3 font-medium text-right">Taxa de aprovação</th>
                      <th className="px-4 py-3 font-medium text-right">Faturamento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {reportData.map((r) => {
                      const approvalRate = r.budgets > 0 ? (r.approved / r.budgets) * 100 : 0;
                      return (
                        <tr key={r.origin} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{r.origin}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{r.clients}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{r.budgets}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{r.approved}</td>
                          <td className="px-4 py-3 text-right text-slate-500">{approvalRate.toFixed(0)}%</td>
                          <td className="px-4 py-3 text-right font-medium" style={{ color: 'var(--color-primary)' }}>{formatCurrency(r.revenue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Task Modal */}
      <Modal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={editingTask ? 'Editar tarefa' : 'Nova tarefa'} size="md">
        <div className="space-y-4">
          <div>
            <label className="label">Título *</label>
            <input className="input" placeholder="Ex: Ligar para confirmar ensaio..." value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          </div>
          <div>
            <label className="label">Descrição</label>
            <textarea className="input min-h-[80px]" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={taskForm.type} onChange={(e) => setTaskForm({ ...taskForm, type: e.target.value })}>
                <option value="tarefa">Tarefa</option>
                <option value="oportunidade">Oportunidade</option>
                <option value="follow_up">Follow-up</option>
                <option value="atendimento">Atendimento</option>
              </select>
            </div>
            <div>
              <label className="label">Prioridade</label>
              <select className="input" value={taskForm.priority} onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Status</label>
              <select className="input" value={taskForm.status} onChange={(e) => setTaskForm({ ...taskForm, status: e.target.value })}>
                <option value="pendente">Pendente</option>
                <option value="em_andamento">Em andamento</option>
                <option value="concluido">Concluído</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="label">Vencimento</label>
              <input type="date" className="input" value={taskForm.due_date} onChange={(e) => setTaskForm({ ...taskForm, due_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Cliente (opcional)</label>
            <select className="input" value={taskForm.client_id} onChange={(e) => setTaskForm({ ...taskForm, client_id: e.target.value })}>
              <option value="">Sem cliente vinculado</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.full_name}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setTaskModalOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={handleTaskSave} className="btn-primary">{editingTask ? 'Salvar' : 'Criar tarefa'}</button>
        </div>
      </Modal>

      {/* AI Tab */}
      {tab === 'ai' && (
        <AiTab selectedClientId={selectedClientId} clients={clients} timeline={timeline} onNavigate={onNavigate} />
      )}

      <ConfirmDialog open={!!deleteTask} title="Excluir tarefa" message={`Excluir "${deleteTask?.title}"?`} onConfirm={handleTaskDelete} onCancel={() => setDeleteTask(null)} />

      {/* Funnel Modal */}
      <Modal open={funnelModalOpen} onClose={() => setFunnelModalOpen(false)} title={editingFunnel ? 'Editar oportunidade' : 'Nova oportunidade'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Cliente *</label><select className="input" value={funnelForm.client_id} onChange={(e) => setFunnelForm({ ...funnelForm, client_id: e.target.value })}><option value="">Selecione...</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.full_name}</option>)}</select></div>
            <div><label className="label">Etapa</label><select className="input" value={funnelForm.stage} onChange={(e) => setFunnelForm({ ...funnelForm, stage: e.target.value })}>{STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Origem do contato</label><input className="input" placeholder="Ex: Instagram, indicação, Google..." value={funnelForm.origin} onChange={(e) => setFunnelForm({ ...funnelForm, origin: e.target.value })} /></div>
            <div><label className="label">Serviço pretendido</label><input className="input" placeholder="Ex: Ensaio gestante, casamento..." value={funnelForm.intended_service} onChange={(e) => setFunnelForm({ ...funnelForm, intended_service: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Campanha</label><select className="input" value={funnelForm.campaign_id} onChange={(e) => setFunnelForm({ ...funnelForm, campaign_id: e.target.value })}><option value="">Sem campanha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Responsável</label><input className="input" placeholder="Quem está atendendo" value={funnelForm.responsible} onChange={(e) => setFunnelForm({ ...funnelForm, responsible: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Próxima ação</label><input className="input" placeholder="Ex: Ligar para confirmar" value={funnelForm.next_action} onChange={(e) => setFunnelForm({ ...funnelForm, next_action: e.target.value })} /></div>
            <div><label className="label">Data da próxima ação</label><input type="date" className="input" value={funnelForm.next_action_date} onChange={(e) => setFunnelForm({ ...funnelForm, next_action_date: e.target.value })} /></div>
          </div>
          <div><label className="label">Valor estimado (R$)</label><input type="number" min="0" step="any" className="input" value={funnelForm.estimated_value} onChange={(e) => setFunnelForm({ ...funnelForm, estimated_value: e.target.value })} /></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={funnelForm.notes} onChange={(e) => setFunnelForm({ ...funnelForm, notes: e.target.value })} /></div>
          {editingFunnel?.budget_id && <p className="text-sm text-amber-600">Orçamento vinculado</p>}
          {editingFunnel?.order_id && <p className="text-sm text-teal-600">OS vinculada</p>}
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setFunnelModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleFunnelSave} className="btn-primary">{editingFunnel ? 'Salvar' : 'Criar'}</button></div>
      </Modal>

      <ConfirmDialog open={!!deleteFunnel} title="Excluir oportunidade" message="Excluir esta oportunidade?" onConfirm={handleFunnelDelete} onCancel={() => setDeleteFunnel(null)} />

      <Modal open={!!lossModalFunnel} onClose={() => setLossModalFunnel(null)} title="Motivo da perda" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Registre o motivo pelo qual esta oportunidade foi perdida.</p>
          <div><label className="label">Motivo</label><select className="input" value={lossReason} onChange={(e) => setLossReason(e.target.value)}><option value="">Selecione...</option><option value="Preço">Preço</option><option value="Concorrência">Concorrência</option><option value="Desistiu">Desistiu</option><option value="Sem resposta">Sem resposta</option><option value="Não atendeu">Não atendeu</option><option value="Outro">Outro</option></select></div>
          <div className="flex justify-end gap-3"><button onClick={() => setLossModalFunnel(null)} className="btn-secondary">Cancelar</button><button onClick={handleLossConfirm} className="btn-primary">Confirmar perda</button></div>
        </div>
      </Modal>

      {/* Template Modal */}
      <Modal open={templateModalOpen} onClose={() => setTemplateModalOpen(false)} title={editingTemplate ? 'Editar modelo' : 'Novo modelo'} size="lg">
        <div className="space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></div>
          <div><label className="label">Categoria</label><input className="input" placeholder="Ex: confirmacao_ensaio, retorno_orcamento..." value={templateForm.category} onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })} /></div>
          <div><label className="label">Conteúdo *</label><textarea className="input min-h-[120px]" value={templateForm.content} onChange={(e) => setTemplateForm({ ...templateForm, content: e.target.value })} /><p className="text-xs text-slate-400 mt-1">Placeholders: {'{NOME}'}, {'{NOME_ESTUDIO}'}, {'{DATA}'}, {'{HORA}'}, {'{VALOR}'}, {'{CODIGO}'}</p></div>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setTemplateModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleTemplateSave} className="btn-primary">{editingTemplate ? 'Salvar' : 'Criar'}</button></div>
      </Modal>

      <ConfirmDialog open={!!deleteTemplate} title="Excluir modelo" message={`Excluir "${deleteTemplate?.name}"?`} onConfirm={handleTemplateDelete} onCancel={() => setDeleteTemplate(null)} />

      {/* Feedback Modal */}
      <Modal open={feedbackModalOpen} onClose={() => setFeedbackModalOpen(false)} title={editingFeedback ? 'Editar feedback' : 'Novo feedback de pós-venda'} size="lg">
        <div className="space-y-4">
          <div><label className="label">Ordem de serviço *</label><select className="input" value={feedbackForm.service_order_id} onChange={(e) => { const o = orders.find((o) => o.id === e.target.value); setFeedbackForm({ ...feedbackForm, service_order_id: e.target.value, client_id: o?.client_id ?? '' }); }}><option value="">Selecione...</option>{orders.map((o) => { const c = clients.find((c) => c.id === o.client_id); return <option key={o.id} value={o.id}>{o.code} — {o.title} ({c?.full_name ?? ''})</option>; })}</select></div>
          <div><label className="label">Satisfação</label><div className="flex items-center gap-1">{[1, 2, 3, 4, 5].map((n) => <button key={n} onClick={() => setFeedbackForm({ ...feedbackForm, satisfaction_score: n })}><Star className={`h-7 w-7 ${n <= feedbackForm.satisfaction_score ? 'text-amber-400 fill-amber-400' : 'text-slate-300 dark:text-slate-600'}`} /></button>)}</div></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={feedbackForm.observations} onChange={(e) => setFeedbackForm({ ...feedbackForm, observations: e.target.value })} /></div>
          <div><label className="label">Problemas relatados</label><textarea className="input min-h-[60px]" placeholder="Descreva qualquer problema ou insatisfação..." value={feedbackForm.reported_problems} onChange={(e) => setFeedbackForm({ ...feedbackForm, reported_problems: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Data do feedback</label><input type="date" className="input" value={feedbackForm.feedback_date} onChange={(e) => setFeedbackForm({ ...feedbackForm, feedback_date: e.target.value })} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300"><input type="checkbox" checked={feedbackForm.needs_followup} onChange={(e) => setFeedbackForm({ ...feedbackForm, needs_followup: e.target.checked })} className="h-4 w-4 rounded accent-teal-600" /> Exige retorno</label></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setFeedbackModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleFeedbackSave} className="btn-primary">{editingFeedback ? 'Salvar' : 'Registrar'}</button></div>
      </Modal>

      <ConfirmDialog open={!!deleteFeedback} title="Excluir feedback" message="Excluir este feedback?" onConfirm={handleFeedbackDelete} onCancel={() => setDeleteFeedback(null)} />
    </div>
  );
}

function AiTab({ selectedClientId, clients, timeline }: {
  selectedClientId: string;
  clients: Client[];
  timeline: TimelineEntry[];
  onNavigate: (page: Page) => void;
}) {
  const [aiAction, setAiAction] = useState<AiAction | ''>('');
  const [extraContext, setExtraContext] = useState('');
  const [aiResult, setAiResult] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showDataWarning, setShowDataWarning] = useState(false);

  const selectedClient = clients.find((c) => c.id === selectedClientId);

  const buildClientSummary = (): string => {
    if (!selectedClient) return '';
    const safeData = sanitizeClientData({
      nome: selectedClient.full_name,
      codigo: selectedClient.code,
      origem: selectedClient.origin,
      status: selectedClient.status,
      tipo_pessoa: selectedClient.person_type,
      data_primeiro_contato: selectedClient.first_contact,
      tipo_ensaio: selectedClient.shoot_type,
      preferencias_cenario: selectedClient.scenery_preferences,
      preferencias_figurino: selectedClient.costume_preferences,
      observacoes: selectedClient.observations,
    });
    const recentTimeline = timeline.slice(0, 20).map((e) => `- ${formatDate(e.date)}: ${e.description} (${e.categoryLabel})`).join('\n');
    return `Dados do cliente:\n${safeData}\n\nHistórico recente:\n${recentTimeline}`;
  };

  const handleAiCall = async () => {
    if (!aiAction) { toast('Selecione uma ação', 'warning'); return; }
    setAiLoading(true);
    setAiError('');
    setAiResult('');
    try {
      const clientSummary = buildClientSummary();
      const result = await callGemini(aiAction as AiAction, extraContext, clientSummary);
      setAiResult(result.text);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Erro ao processar solicitação');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">Aviso de processamento de dados</p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              As informações enviadas serão processadas pelo Google Gemini (serviço externo). Dados sensíveis como CPF, CNPJ, telefone, endereço e e-mail são automaticamente removidos antes do envio. A IA apenas sugere textos — nenhuma alteração é feita automaticamente nos seus cadastros, pagamentos ou compromissos.
            </p>
            <button onClick={() => setShowDataWarning(!showDataWarning)} className="text-xs text-amber-600 hover:underline mt-1">
              {showDataWarning ? 'Ocultar detalhes' : 'Ver o que será enviado'}
            </button>
            {showDataWarning && (
              <pre className="text-xs text-amber-700 dark:text-amber-300 mt-2 p-3 bg-amber-100 dark:bg-amber-900/30 rounded-lg overflow-auto max-h-40">
                {buildClientSummary() || 'Nenhum cliente selecionado. Apenas o contexto adicional será enviado.'}
              </pre>
            )}
          </div>
        </div>
      </div>

      <div className="card p-6">
        <div className="mb-4">
          <label className="label flex items-center gap-2"><Wand2 className="h-4 w-4" /> O que você quer que a IA faça?</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {AI_ACTIONS.map((a) => (
              <button
                key={a.id}
                onClick={() => setAiAction(a.id)}
                className={`text-left p-3 rounded-xl border transition-colors ${aiAction === a.id ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
              >
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{a.label}</p>
                <p className="text-xs text-slate-400 mt-0.5">{a.description}</p>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4">
          <label className="label">Cliente selecionado</label>
          <p className="text-sm text-slate-500">{selectedClient ? `${selectedClient.code} — ${selectedClient.full_name}` : 'Nenhum cliente selecionado (a IA usará apenas o contexto abaixo)'}</p>
        </div>

        <div className="mb-4">
          <label className="label">Contexto adicional (opcional)</label>
          <textarea className="input min-h-[80px]" placeholder="Ex: Cliente fez ensaio de gestante e não voltou para a sessão do bebê. Queremos oferecer um pacote..." value={extraContext} onChange={(e) => setExtraContext(e.target.value)} />
        </div>

        <div className="flex items-center gap-3 mb-4">
          <button onClick={handleAiCall} disabled={aiLoading || !aiAction} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
            {aiLoading ? (<><span className="animate-pulse">Gerando...</span></>) : (<><Sparkles className="h-4 w-4" /> Gerar sugestão</>)}
          </button>
          {aiResult && (
            <button onClick={() => { navigator.clipboard.writeText(aiResult); toast('Texto copiado', 'success'); }} className="btn-secondary">
              <Copy className="h-4 w-4" /> Copiar
            </button>
          )}
        </div>

        {aiError && (
          <div className="card p-4 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <p className="text-sm text-red-600 dark:text-red-400">{aiError}</p>
          </div>
        )}

        {aiResult && (
          <div className="card p-6 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Sugestão da IA</p>
              <p className="text-xs text-slate-400">Revise antes de usar</p>
            </div>
            <div className="prose prose-sm max-w-none">
              <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 font-sans">{aiResult}</pre>
            </div>
          </div>
        )}

        {!aiResult && !aiError && !aiLoading && (
          <EmptyState icon={<Sparkles className="h-12 w-12" />} title="Assistente de IA" description="Selecione uma ação acima e clique em 'Gerar sugestão'. A IA criará textos, resumos, briefings e sugestões comerciais com base nos dados do cliente." />
        )}
      </div>
    </div>
  );
}

