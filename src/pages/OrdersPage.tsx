import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, formatDateTime, todayISO, daysUntil } from '@/lib/utils';
import { Plus, Search, Trash2, ClipboardList, Clock, CircleCheck as CheckCircle, Package, TriangleAlert as AlertTriangle, ChevronDown, ChevronRight, ListChecks, Truck, PackageCheck, Image, Printer, X, Save, Settings, RotateCcw, Mail, Send, History } from 'lucide-react';
import type {
  ServiceOrder, OrderItem, ProductionStep, ProductionStepHistory,
  ChecklistTemplate, ChecklistTemplateItem, OrderChecklist,
  Client, Budget, Appointment, Service, Campaign, EmailSendHistory,
} from '@/lib/types';
import { isGmailAvailable, getGmailStatus, sendGmailEmail } from '@/lib/gmail';
import { generateDocumentPDF } from '@/lib/pdfUtils';
import { normalizePhone, formatPhoneForDisplay, buildWhatsAppUrl, buildWhatsAppMessage, openWhatsApp, isWhatsAppAvailable } from '@/lib/whatsapp';
import { useSettings } from '@/context/SettingsContext';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import { useSaving } from '@/lib/useSaving';
import { Download, MessageCircle } from 'lucide-react';

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  em_producao: 'Em produção',
  concluido: 'Concluído',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};
const statusBadge: Record<string, string> = {
  rascunho: 'badge-neutral',
  em_producao: 'badge-warning',
  concluido: 'badge-info',
  entregue: 'badge-success',
  cancelado: 'badge-danger',
};
const priorityLabels: Record<string, string> = { baixa: 'Baixa', normal: 'Normal', alta: 'Alta', urgente: 'Urgente' };
const priorityColors: Record<string, string> = { baixa: 'text-slate-500', normal: 'text-sky-600', alta: 'text-amber-600', urgente: 'text-red-500' };
const deliveryMethods = ['Retirada na loja', 'Correios', 'Entrega direta', 'Digital'];
const stepStatusLabels: Record<string, string> = { pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído' };
const stepStatusBadge: Record<string, string> = { pendente: 'badge-neutral', em_andamento: 'badge-warning', concluido: 'badge-success' };

type TabType = 'orders' | 'delivery' | 'templates';

interface OrderItemForm {
  id: string;
  service_id: string | null;
  is_custom: boolean;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
}
let _oifCounter = 0;
function makeOrderItemForm(): OrderItemForm {
  _oifCounter++;
  return { id: `new-${Date.now()}-${_oifCounter}`, service_id: null, is_custom: false, name: '', description: '', quantity: 1, unit_price: 0, discount: 0, subtotal: 0 };
}

export function OrdersPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<TabType>('orders');
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [productionSteps, setProductionSteps] = useState<ProductionStep[]>([]);
  const [stepHistory, setStepHistory] = useState<ProductionStepHistory[]>([]);
  const [orderChecklists, setOrderChecklists] = useState<OrderChecklist[]>([]);

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceOrder | null>(null);
  const [deliveryConfirm, setDeliveryConfirm] = useState<ServiceOrder | null>(null);
  const [emailModal, setEmailModal] = useState<ServiceOrder | null>(null);
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailHistory, setEmailHistory] = useState<EmailSendHistory[]>([]);

  // WhatsApp sending
  const [whatsappModal, setWhatsappModal] = useState<ServiceOrder | null>(null);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [whatsappMessage, setWhatsappMessage] = useState('');
  const [whatsappOpening, setWhatsappOpening] = useState(false);

  // Delivery panel search
  const [deliverySearch, setDeliverySearch] = useState('');

  // Templates
  const [templates, setTemplates] = useState<ChecklistTemplate[]>([]);
  const [templateItems, setTemplateItems] = useState<ChecklistTemplateItem[]>([]);
  const [templateModal, setTemplateModal] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateForm, setTemplateForm] = useState({ name: '', service_type: '', is_active: true });
  const [templateFormItems, setTemplateFormItems] = useState<{ id: string; label: string }[]>([]);

  // Form
  const [form, setForm] = useState({
    code: '', client_id: '', budget_id: '', appointment_id: '', title: '', description: '',
    status: 'rascunho', priority: 'normal', assigned_to: '', due_date: '',
    delivery_method: 'Retirada na loja', tracking_code: '', notes: '', campaign_id: '',
  });
  const [formItems, setFormItems] = useState<OrderItemForm[]>([]);
  const [formSteps, setFormSteps] = useState<{ id: string; step_name: string; assigned_to: string }[]>([]);
  const { saving, withSaving } = useSaving();

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: ordersData }, { data: clientData }, { data: budgetData }, { data: apptData }, { data: svcData }, { data: tplData }, { data: tplItemsData }, { data: campData }] = await Promise.all([
      supabase.from('service_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('clients').select('*').eq('status', 'ativo').order('full_name'),
      supabase.from('budgets').select('*').in('status', ['aprovado', 'enviado']),
      supabase.from('appointments').select('*').order('appointment_date', { ascending: false }),
      supabase.from('services').select('*').eq('active', true).order('name'),
      supabase.from('checklist_templates').select('*').order('created_at', { ascending: false }),
      supabase.from('checklist_template_items').select('*').order('item_order', { ascending: true }),
      supabase.from('campaigns').select('*').order('name'),
    ]);
    setOrders((ordersData as ServiceOrder[]) ?? []);
    setClients((clientData as Client[]) ?? []);
    setBudgets((budgetData as Budget[]) ?? []);
    setAppointments((apptData as Appointment[]) ?? []);
    setServices((svcData as Service[]) ?? []);
    setTemplates((tplData as ChecklistTemplate[]) ?? []);
    setTemplateItems((tplItemsData as ChecklistTemplateItem[]) ?? []);
    setCampaigns((campData as Campaign[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = orders.filter((o) => {
    const client = clients.find((c) => c.id === o.client_id);
    const q = search.toLowerCase();
    const matchesSearch = o.code.toLowerCase().includes(q) || o.title.toLowerCase().includes(q) || (client?.full_name.toLowerCase().includes(q) ?? false);
    const matchesStatus = !filterStatus || o.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const calcItemSubtotal = (item: OrderItemForm) => Math.max(0, item.quantity * item.unit_price - item.discount);
  const updateFormItem = (id: string, updates: Partial<OrderItemForm>) => {
    setFormItems((prev) => prev.map((it) => { if (it.id !== id) return it; const u = { ...it, ...updates }; u.subtotal = calcItemSubtotal(u); return u; }));
  };
  const addFormItem = () => setFormItems((prev) => [...prev, makeOrderItemForm()]);
  const removeFormItem = (id: string) => setFormItems((prev) => prev.length > 1 ? prev.filter((it) => it.id !== id) : prev);
  const selectFormService = (itemId: string, serviceId: string) => {
    if (serviceId === 'custom') { updateFormItem(itemId, { service_id: null, is_custom: true, name: '', unit_price: 0, quantity: 1, discount: 0 }); }
    else { const svc = services.find((s) => s.id === serviceId); if (svc) updateFormItem(itemId, { service_id: svc.id, is_custom: false, name: svc.name, unit_price: svc.price, quantity: 1, discount: 0 }); }
  };

  const openNew = async () => {
    setEditingId(null);
    const { data: codeData } = await supabase.rpc('generate_os_code');
    const osCode = (codeData as string) ?? `os${String(Date.now()).slice(-4)}`;
    setForm({ code: osCode, client_id: '', budget_id: '', appointment_id: '', title: '', description: '', status: 'rascunho', priority: 'normal', assigned_to: '', due_date: '', delivery_method: 'Retirada na loja', tracking_code: '', notes: '', campaign_id: '' });
    setFormItems([makeOrderItemForm()]);
    setFormSteps([{ id: `step-${Date.now()}`, step_name: 'Preparação', assigned_to: '' }, { id: `step-${Date.now()}-2`, step_name: 'Produção', assigned_to: '' }, { id: `step-${Date.now()}-3`, step_name: 'Revisão', assigned_to: '' }]);
    setModalOpen(true);
  };

  const openEdit = async (o: ServiceOrder) => {
    setEditingId(o.id);
    const [{ data: itemsData }, { data: stepsData }] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', o.id).order('created_at'),
      supabase.from('production_steps').select('*').eq('order_id', o.id).order('step_order'),
    ]);
    const loadedItems = (itemsData as OrderItem[]) ?? [];
    setFormItems(loadedItems.length > 0 ? loadedItems.map((it) => ({ id: it.id, service_id: it.service_id, is_custom: it.is_custom, name: it.name, description: it.description ?? '', quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, subtotal: it.subtotal })) : [makeOrderItemForm()]);
    const loadedSteps = (stepsData as ProductionStep[]) ?? [];
    setFormSteps(loadedSteps.length > 0 ? loadedSteps.map((s) => ({ id: s.id, step_name: s.step_name, assigned_to: s.assigned_to ?? '' })) : [{ id: `step-${Date.now()}`, step_name: 'Preparação', assigned_to: '' }]);
    setForm({
      code: o.code, client_id: o.client_id, budget_id: o.budget_id ?? '', appointment_id: o.appointment_id ?? '',
      title: o.title, description: o.description ?? '', status: o.status, priority: o.priority,
      assigned_to: o.assigned_to ?? '', due_date: o.due_date ?? '', delivery_method: o.delivery_method ?? 'Retirada na loja',
      tracking_code: o.tracking_code ?? '', notes: o.notes ?? '', campaign_id: o.campaign_id ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.client_id) { toast('Selecione um cliente', 'warning'); return; }
    if (!form.title) { toast('Informe um título', 'warning'); return; }

    return withSaving(async () => {
    const now = new Date().toISOString();
    const payload = {
      code: form.code, client_id: form.client_id, budget_id: form.budget_id || null, appointment_id: form.appointment_id || null,
      title: form.title, description: form.description || null, status: form.status, priority: form.priority,
      assigned_to: form.assigned_to || null, due_date: form.due_date || null,
      delivery_method: form.delivery_method || null, tracking_code: form.tracking_code || null,
      notes: form.notes || null, campaign_id: form.campaign_id || null, updated_at: now,
    };

    if (editingId) {
      const { error } = await supabase.from('service_orders').update(payload).eq('id', editingId);
      if (error) { toast('Erro ao atualizar pedido', 'error'); return; }
      const validItems = formItems.filter((it) => it.name);
      if (validItems.length > 0) {
        await supabase.from('order_items').delete().eq('order_id', editingId);
        await supabase.from('order_items').insert(validItems.map((it) => ({ order_id: editingId, service_id: it.service_id, is_custom: it.is_custom, name: it.name, description: it.description || null, quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, subtotal: it.subtotal })));
      }
      const existingSteps = await supabase.from('production_steps').select('*').eq('order_id', editingId);
      const oldSteps = (existingSteps.data as ProductionStep[]) ?? [];
      if (formSteps.length > 0) {
        await supabase.from('production_steps').delete().eq('order_id', editingId);
        await supabase.from('production_steps').insert(formSteps.map((s, i) => ({ order_id: editingId, step_name: s.step_name, step_order: i, assigned_to: s.assigned_to || null, status: 'pendente' })));
      }
      toast('Pedido atualizado', 'success');
    } else {
      const { data: inserted, error } = await supabase.from('service_orders').insert(payload).select('*').maybeSingle();
      if (error || !inserted) { toast('Erro ao criar pedido', 'error'); return; }
      const order = inserted as ServiceOrder;
      const validItems = formItems.filter((it) => it.name);
      if (validItems.length > 0) {
        await supabase.from('order_items').insert(validItems.map((it) => ({ order_id: order.id, service_id: it.service_id, is_custom: it.is_custom, name: it.name, description: it.description || null, quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, subtotal: it.subtotal })));
      }
      if (formSteps.length > 0) {
        await supabase.from('production_steps').insert(formSteps.map((s, i) => ({ order_id: order.id, step_name: s.step_name, step_order: i, assigned_to: s.assigned_to || null, status: 'pendente' })));
      }
      // Generate checklists from matching templates
      await generateChecklistsForOrder(order.id, order.budget_id, validItems);
      await supabase.from('client_history').insert({ client_id: form.client_id, event_type: 'ordem_servico', description: `Pedido ${form.code} criado: ${form.title}`, source_table: 'service_orders', source_id: order.id });
      toast('Pedido criado', 'success');
    }
    setModalOpen(false);
    load();
    });
  };

  const generateChecklistsForOrder = async (orderId: string, budgetId: string | null, items: OrderItemForm[]) => {
    const itemNames = items.map((it) => it.name.toLowerCase());
    const matching = templates.filter((t) => t.is_active && (!t.service_type || itemNames.some((n) => n.includes(t.service_type!.toLowerCase()))));
    const checklistsToInsert: { order_id: string; template_id: string | null; label: string; item_order: number; snapshot_template_name: string }[] = [];
    for (const tpl of matching) {
      const tplItems = templateItems.filter((ti) => ti.template_id === tpl.id).sort((a, b) => a.item_order - b.item_order);
      for (const ti of tplItems) {
        checklistsToInsert.push({ order_id: orderId, template_id: tpl.id, label: ti.label, item_order: ti.item_order, snapshot_template_name: tpl.name });
      }
    }
    if (checklistsToInsert.length > 0) {
      await supabase.from('order_checklists').insert(checklistsToInsert);
    }
  };

  const changeStatus = async (o: ServiceOrder, status: string) => {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status, updated_at: now };
    if (status === 'em_producao' && !o.started_at) update.started_at = now;
    if (status === 'concluido' && !o.completed_at) update.completed_at = now;
    if (status === 'entregue' && !o.delivered_at) update.delivered_at = now;
    const { error } = await supabase.from('service_orders').update(update).eq('id', o.id);
    if (error) { toast('Erro ao atualizar status', 'error'); return; }
    if (status === 'entregue') {
      await supabase.from('client_history').insert({ client_id: o.client_id, event_type: 'ordem_servico', description: `Pedido ${o.code} entregue ao cliente`, source_table: 'service_orders', source_id: o.id });
    }
    toast('Status atualizado', 'success');
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('service_orders').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir pedido', 'error'); return; }
    toast('Pedido excluído', 'success');
    setDeleteTarget(null);
    load();
  };

  const toggleExpand = async (orderId: string) => {
    if (expandedOrder === orderId) { setExpandedOrder(null); return; }
    setExpandedOrder(orderId);
    const [{ data: itemsData }, { data: stepsData }, { data: clData }, { data: histData }, { data: emailHistData }] = await Promise.all([
      supabase.from('order_items').select('*').eq('order_id', orderId).order('created_at'),
      supabase.from('production_steps').select('*').eq('order_id', orderId).order('step_order'),
      supabase.from('order_checklists').select('*').eq('order_id', orderId).order('item_order'),
      supabase.from('production_step_history').select('*').in('step_id', ((await supabase.from('production_steps').select('id').eq('order_id', orderId)).data ?? []).map((s: { id: string }) => s.id)).order('changed_at', { ascending: false }),
      supabase.from('email_send_history').select('*').eq('service_order_id', orderId).order('created_at', { ascending: false }),
    ]);
    setOrderItems((itemsData as OrderItem[]) ?? []);
    setProductionSteps((stepsData as ProductionStep[]) ?? []);
    setOrderChecklists((clData as OrderChecklist[]) ?? []);
    setStepHistory((histData as ProductionStepHistory[]) ?? []);
    setEmailHistory((emailHistData as EmailSendHistory[]) ?? []);
  };

  const updateStepStatus = async (step: ProductionStep, newStatus: string) => {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = { status: newStatus, updated_at: now };
    if (newStatus === 'em_andamento' && !step.started_at) update.started_at = now;
    if (newStatus === 'concluido') update.completed_at = now;
    const { error } = await supabase.from('production_steps').update(update).eq('id', step.id);
    if (error) { toast('Erro ao atualizar etapa', 'error'); return; }
    await supabase.from('production_step_history').insert({ step_id: step.id, field_changed: 'status', old_value: step.status, new_value: newStatus });
    if (expandedOrder) {
      const { data: stepsData } = await supabase.from('production_steps').select('*').eq('order_id', expandedOrder).order('step_order');
      setProductionSteps((stepsData as ProductionStep[]) ?? []);
      const stepIds = (stepsData as ProductionStep[])?.map((s) => s.id) ?? [];
      if (stepIds.length > 0) {
        const { data: histData } = await supabase.from('production_step_history').select('*').in('step_id', stepIds).order('changed_at', { ascending: false });
        setStepHistory((histData as ProductionStepHistory[]) ?? []);
      }
    }
    toast('Etapa atualizada', 'success');
  };

  const toggleChecklistItem = async (item: OrderChecklist, doneBy: string) => {
    const now = doneBy ? new Date().toISOString() : null;
    const { error } = await supabase.from('order_checklists').update({ is_done: !item.is_done, done_at: !item.is_done ? now : null, done_by: !item.is_done ? doneBy : null }).eq('id', item.id);
    if (error) { toast('Erro ao atualizar checklist', 'error'); return; }
    if (expandedOrder) {
      const { data: clData } = await supabase.from('order_checklists').select('*').eq('order_id', expandedOrder).order('item_order');
      setOrderChecklists((clData as OrderChecklist[]) ?? []);
    }
  };

  const toggleDigitalDelivery = async (o: ServiceOrder) => {
    const now = new Date().toISOString();
    const newval = !o.digital_delivered;
    const { error } = await supabase.from('service_orders').update({ digital_delivered: newval, digital_delivered_at: newval ? now : null, updated_at: now }).eq('id', o.id);
    if (error) { toast('Erro ao atualizar entrega digital', 'error'); return; }
    toast(newval ? 'Entrega digital registrada' : 'Entrega digital removida', 'success');
    load();
  };

  const togglePrintedDelivery = async (o: ServiceOrder) => {
    const now = new Date().toISOString();
    const newval = !o.printed_delivered;
    const { error } = await supabase.from('service_orders').update({ printed_delivered: newval, printed_delivered_at: newval ? now : null, updated_at: now }).eq('id', o.id);
    if (error) { toast('Erro ao atualizar entrega de fotos impressas', 'error'); return; }
    toast(newval ? 'Entrega de fotos impressas registrada' : 'Entrega de fotos impressas removida', 'success');
    load();
  };

  const confirmDelivery = async (o: ServiceOrder, responsible: string) => {
    if (o.delivery_confirmed) { toast('Este pedido já foi dado baixa', 'warning'); return; }
    const now = new Date().toISOString();
    const { error, count } = await supabase.from('service_orders').update({
      delivery_confirmed: true, delivery_confirmed_at: now, delivery_confirmed_by: responsible,
      status: 'entregue', delivered_at: now, updated_at: now,
    }).eq('id', o.id).eq('delivery_confirmed', false);
    if (error) { toast('Erro ao confirmar entrega', 'error'); return; }
    if (count === 0) { toast('Este pedido já teve a baixa registrada', 'warning'); setDeliveryConfirm(null); load(); return; }
    await supabase.from('client_history').insert({ client_id: o.client_id, event_type: 'ordem_servico', description: `Baixa de entrega: pedido ${o.code} entregue por ${responsible}`, source_table: 'service_orders', source_id: o.id });
    toast('Baixa de entrega registrada', 'success');
    setDeliveryConfirm(null);
    load();
  };

  const openEmailModal = async (o: ServiceOrder) => {
    const client = clients.find((c) => c.id === o.client_id);
    if (!client?.email) {
      toast('Este cliente ainda não possui um endereço de e-mail cadastrado.', 'warning');
      return;
    }
    const status = await getGmailStatus();
    if (!status.connected) {
      toast('Conecte sua conta Google nas Configurações para utilizar este recurso.', 'warning');
      return;
    }
    setEmailRecipient(client.email);
    setEmailModal(o);
  };

  const openWhatsAppModal = (o: ServiceOrder) => {
    const client = clients.find((c) => c.id === o.client_id);
    const phone = client?.whatsapp || client?.phone || '';
    if (!phone) {
      toast('Este cliente não possui um telefone cadastrado.', 'warning');
      return;
    }
    const studioName = settings.fantasy_name || settings.studio_name || 'Estúdio';
    const message = buildWhatsAppMessage({
      clientName: client?.full_name ?? 'cliente',
      studioName,
      orderCode: o.code,
      orderTitle: o.title,
      formattedDueDate: o.due_date ? formatDate(o.due_date) : null,
      formattedOrderDate: o.created_at ? formatDate(o.created_at) : null,
    });
    setWhatsappPhone(phone);
    setWhatsappMessage(message);
    setWhatsappModal(o);
  };

  const handleSendEmail = async () => {
    if (!emailModal) return;
    const client = clients.find((c) => c.id === emailModal.client_id);
    if (!client) return;
    if (!emailRecipient.trim()) { toast('Informe o endereço de e-mail do destinatário', 'warning'); return; }

    setEmailSending(true);
    try {
      const itemsText = orderItems.length > 0
        ? orderItems.map((it) => `- ${it.name} (Qtd: ${it.quantity}) — ${formatCurrency(it.subtotal)}`).join('\n')
        : 'Sem itens detalhados.';
      const total = orderItems.reduce((s, it) => s + it.subtotal, 0);
      const studioName = settings.fantasy_name || settings.studio_name || 'Estúdio';
      const subject = `Ordem de Serviço ${emailModal.code} — ${studioName}`;
      const body = [
        `Olá, ${client.full_name}!`,
        '',
        `Segue em anexo a Ordem de Serviço ${emailModal.code} referente ao pedido: ${emailModal.title}.`,
        '',
        'Itens do pedido:',
        itemsText,
        total > 0 ? `\nValor total: ${formatCurrency(total)}` : '',
        emailModal.due_date ? `\nPrazo de entrega: ${formatDate(emailModal.due_date)}` : '',
        emailModal.delivery_method ? `Forma de entrega: ${emailModal.delivery_method}` : '',
        '',
        'Em caso de dúvidas, entre em contato com o estúdio.',
        '',
        'Atenciosamente,',
        settings.gmail_sender_name || studioName,
        settings.phone ? `Telefone: ${settings.phone}` : '',
        settings.email ? `E-mail: ${settings.email}` : '',
      ].filter(Boolean).join('\n');

      const pdfSettings = {
        studio_name: settings.studio_name,
        fantasy_name: settings.fantasy_name,
        tax_id: settings.tax_id,
        address: settings.address,
        phone: settings.phone,
        email: settings.email,
        logo_url: settings.logo_url,
      };
      const pdfBlob = generateDocumentPDF({
        title: `Ordem de Serviço ${emailModal.code}`,
        body: `${emailModal.title}\n\nCliente: ${client.full_name}\n${client.phone ? 'Telefone: ' + client.phone + '\n' : ''}\nItens:\n${itemsText}\n${total > 0 ? '\nValor total: ' + formatCurrency(total) : ''}${emailModal.due_date ? '\n\nPrazo de entrega: ' + formatDate(emailModal.due_date) : ''}${emailModal.delivery_method ? '\nForma de entrega: ' + emailModal.delivery_method : ''}${emailModal.notes ? '\n\nObservações:\n' + emailModal.notes : ''}`,
        settings: pdfSettings,
      });

      const arrayBuffer = await pdfBlob.arrayBuffer();
      const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

      const res = await sendGmailEmail({
        to: emailRecipient.trim(),
        subject,
        body,
        attachments: [{ filename: `OS-${emailModal.code}.pdf`, mimeType: 'application/pdf', data: pdfBase64 }],
        senderName: settings.gmail_sender_name || undefined,
      });

      const now = new Date().toISOString();
      if (res.success) {
        await supabase.from('email_send_history').insert({
          service_order_id: emailModal.id,
          order_code: emailModal.code,
          client_id: emailModal.client_id,
          recipient_email: emailRecipient.trim(),
          subject,
          status: 'enviado',
          sent_at: now,
        });
        toast('E-mail enviado com sucesso.', 'success');
        setEmailModal(null);
      } else {
        await supabase.from('email_send_history').insert({
          service_order_id: emailModal.id,
          order_code: emailModal.code,
          client_id: emailModal.client_id,
          recipient_email: emailRecipient.trim(),
          subject,
          status: 'falhou',
          error_message: res.error ?? 'Erro desconhecido',
        });
        toast('Não foi possível enviar o e-mail. Verifique a conexão e as configurações.', 'error');
      }

      if (expandedOrder === emailModal.id) {
        const { data: histData } = await supabase.from('email_send_history').select('*').eq('service_order_id', emailModal.id).order('created_at', { ascending: false });
        setEmailHistory((histData as EmailSendHistory[]) ?? []);
      }
    } catch {
      toast('Erro ao enviar e-mail. Verifique sua conexão com a internet.', 'error');
      if (emailModal) {
        await supabase.from('email_send_history').insert({
          service_order_id: emailModal.id,
          order_code: emailModal.code,
          client_id: emailModal.client_id,
          recipient_email: emailRecipient.trim(),
          subject: `Ordem de Serviço ${emailModal.code}`,
          status: 'falhou',
          error_message: 'Erro de conexão',
        });
      }
    }
    setEmailSending(false);
  };

  // Template management
  const openNewTemplate = () => {
    setEditingTemplateId(null);
    setTemplateForm({ name: '', service_type: '', is_active: true });
    setTemplateFormItems([{ id: `ti-${Date.now()}`, label: '' }]);
    setTemplateModal(true);
  };
  const openEditTemplate = (t: ChecklistTemplate) => {
    setEditingTemplateId(t.id);
    setTemplateForm({ name: t.name, service_type: t.service_type ?? '', is_active: t.is_active });
    const items = templateItems.filter((ti) => ti.template_id === t.id).sort((a, b) => a.item_order - b.item_order);
    setTemplateFormItems(items.length > 0 ? items.map((ti) => ({ id: ti.id, label: ti.label })) : [{ id: `ti-${Date.now()}`, label: '' }]);
    setTemplateModal(true);
  };
  const handleSaveTemplate = async () => {
    if (!templateForm.name) { toast('Informe o nome do modelo', 'warning'); return; }
    const validItems = templateFormItems.filter((ti) => ti.label.trim());
    const payload = { name: templateForm.name, service_type: templateForm.service_type || null, is_active: templateForm.is_active, updated_at: new Date().toISOString() };
    if (editingTemplateId) {
      const { error } = await supabase.from('checklist_templates').update(payload).eq('id', editingTemplateId);
      if (error) { toast('Erro ao atualizar modelo', 'error'); return; }
      await supabase.from('checklist_template_items').delete().eq('template_id', editingTemplateId);
      if (validItems.length > 0) await supabase.from('checklist_template_items').insert(validItems.map((ti, i) => ({ template_id: editingTemplateId, label: ti.label, item_order: i })));
      toast('Modelo atualizado', 'success');
    } else {
      const { data, error } = await supabase.from('checklist_templates').insert(payload).select('*').maybeSingle();
      if (error || !data) { toast('Erro ao criar modelo', 'error'); return; }
      const tpl = data as ChecklistTemplate;
      if (validItems.length > 0) await supabase.from('checklist_template_items').insert(validItems.map((ti, i) => ({ template_id: tpl.id, label: ti.label, item_order: i })));
      toast('Modelo criado', 'success');
    }
    setTemplateModal(false);
    load();
  };
  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('checklist_templates').delete().eq('id', id);
    if (error) { toast('Erro ao excluir modelo', 'error'); return; }
    toast('Modelo excluído', 'success');
    load();
  };

  const stats = {
    total: orders.length,
    production: orders.filter((o) => o.status === 'em_producao').length,
    completed: orders.filter((o) => o.status === 'concluido').length,
    overdue: orders.filter((o) => o.due_date && o.status !== 'entregue' && o.status !== 'cancelado' && daysUntil(o.due_date) < 0).length,
    pendingDelivery: orders.filter((o) => o.status !== 'entregue' && o.status !== 'cancelado' && !o.delivery_confirmed).length,
  };

  const itemsTotal = formItems.reduce((s, it) => s + it.subtotal, 0);

  // Delivery panel: find by OS code
  const deliveryResults = deliverySearch
    ? orders.filter((o) => o.code.toLowerCase().includes(deliverySearch.toLowerCase()) || o.title.toLowerCase().includes(deliverySearch.toLowerCase()))
    : orders.filter((o) => o.status !== 'entregue' && o.status !== 'cancelado' && !o.delivery_confirmed);

  const tabs: { id: TabType; label: string; icon: typeof ClipboardList }[] = [
    { id: 'orders', label: 'Pedidos e produção', icon: ClipboardList },
    { id: 'delivery', label: 'Baixa de entrega', icon: PackageCheck },
    { id: 'templates', label: 'Modelos de checklist', icon: ListChecks },
  ];

  return (
    <div>
      <PageHeader
        title="Pedidos, produção e entregas"
        subtitle="Controle de ordens de serviço, produção e baixa de entregas"
        actions={tab === 'orders' ? <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova ordem</button> : tab === 'templates' ? <button onClick={openNewTemplate} className="btn-primary"><Plus className="h-4 w-4" /> Novo modelo</button> : undefined}
      />

      <div className="flex gap-2 mb-6 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-teal-600 text-teal-600' : 'border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>
              <Icon className="h-4 w-4" /> {t.label}
              {t.id === 'delivery' && stats.pendingDelivery > 0 && <span className="badge badge-danger text-xs">{stats.pendingDelivery}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'orders' && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="card p-4"><div className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-slate-400" /><p className="text-sm text-slate-400">Total</p></div><p className="text-2xl font-bold mt-1 text-slate-900 dark:text-slate-100">{stats.total}</p></div>
            <div className="card p-4"><div className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /><p className="text-sm text-slate-400">Em produção</p></div><p className="text-2xl font-bold mt-1 text-amber-600">{stats.production}</p></div>
            <div className="card p-4"><div className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-emerald-500" /><p className="text-sm text-slate-400">Concluídas</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{stats.completed}</p></div>
            <div className="card p-4"><div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /><p className="text-sm text-slate-400">Atrasadas</p></div><p className="text-2xl font-bold mt-1 text-red-500">{stats.overdue}</p></div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input className="input pl-10" placeholder="Buscar por código, título ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="input sm:w-48" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="">Todos os status</option>
              {Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {loading ? (
            <div className="py-20 text-center text-slate-400">Carregando...</div>
          ) : filtered.length === 0 ? (
            <EmptyState icon={<ClipboardList className="h-12 w-12" />} title="Nenhum pedido" description="Crie pedidos para controlar a produção e entrega." action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Nova ordem</button>} />
          ) : (
            <div className="space-y-3">
              {filtered.map((o) => {
                const client = clients.find((c) => c.id === o.client_id);
                const overdue = o.due_date && o.status !== 'entregue' && o.status !== 'cancelado' && daysUntil(o.due_date) < 0;
                const isExpanded = expandedOrder === o.id;
                return (
                  <div key={o.id} className="card overflow-hidden">
                    <div className="flex items-center cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => toggleExpand(o.id)}>
                      <div className="px-4 py-4 flex items-center gap-3 flex-1">
                        {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-slate-400">{o.code}</span>
                            <p className="font-medium text-slate-900 dark:text-slate-100">{o.title}</p>
                            {o.campaign_id && (() => { const c = campaigns.find((c) => c.id === o.campaign_id); return c ? <span className="badge badge-info text-xs">{c.name}</span> : null; })()}
                            {o.campaign && !o.campaign_id && <span className="badge badge-info text-xs">{o.campaign}</span>}
                            {overdue && <span className="badge badge-danger text-xs">Atrasado</span>}
                          </div>
                          <p className="text-xs text-slate-400 mt-0.5">{client?.full_name ?? '—'}{o.due_date && ` · prazo ${formatDate(o.due_date)}`}</p>
                        </div>
                        <div className="hidden sm:flex items-center gap-3">
                          {o.digital_delivered && <span className="flex items-center gap-1 text-xs text-emerald-600"><Image className="h-3 w-3" /> Digital</span>}
                          {o.printed_delivered && <span className="flex items-center gap-1 text-xs text-emerald-600"><Printer className="h-3 w-3" /> Impresso</span>}
                        </div>
                        <select value={o.status} onClick={(e) => e.stopPropagation()} onChange={(e) => { e.stopPropagation(); changeStatus(o, e.target.value); }} className={`badge ${statusBadge[o.status] ?? 'badge-neutral'} cursor-pointer bg-transparent border-0`}>
                          {Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                        </select>
                        <span className={`text-xs font-medium ${priorityColors[o.priority] ?? 'text-slate-500'}`}>{priorityLabels[o.priority] ?? o.priority}</span>
                        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(o); }} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="border-t border-slate-200 dark:border-slate-700 p-4 space-y-4 bg-slate-50 dark:bg-slate-800/30">
                        {/* Items */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Itens do pedido</h4>
                          {orderItems.length === 0 ? <p className="text-xs text-slate-400">Sem itens cadastrados.</p> : (
                            <table className="w-full text-sm">
                              <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="pb-2">Item</th><th className="pb-2 text-center">Qtd</th><th className="pb-2 text-right">Valor</th><th className="pb-2 text-right">Desc.</th><th className="pb-2 text-right">Subtotal</th></tr></thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {orderItems.map((it) => (
                                  <tr key={it.id}><td className="py-2"><p className="font-medium">{it.name}</p>{it.description && <p className="text-xs text-slate-400">{it.description}</p>}</td><td className="py-2 text-center">{it.quantity}</td><td className="py-2 text-right">{formatCurrency(it.unit_price)}</td><td className="py-2 text-right">{formatCurrency(it.discount)}</td><td className="py-2 text-right font-medium">{formatCurrency(it.subtotal)}</td></tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>

                        {/* Production steps */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Etapas de produção</h4>
                          {productionSteps.length === 0 ? <p className="text-xs text-slate-400">Sem etapas cadastradas.</p> : (
                            <div className="space-y-2">
                              {productionSteps.map((s) => (
                                <div key={s.id} className="flex items-center gap-3 card p-3 bg-white dark:bg-slate-900">
                                  <span className="text-xs font-mono text-slate-400">#{s.step_order + 1}</span>
                                  <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{s.step_name}</p>
                                    {s.assigned_to && <p className="text-xs text-slate-400">Resp.: {s.assigned_to}</p>}
                                    {s.completed_at && <p className="text-xs text-emerald-600">Concluído em {formatDateTime(s.completed_at)}</p>}
                                  </div>
                                  <select value={s.status} onChange={(e) => updateStepStatus(s, e.target.value)} className={`badge ${stepStatusBadge[s.status] ?? 'badge-neutral'} cursor-pointer bg-transparent border-0`}>
                                    {Object.entries(stepStatusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                  </select>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Checklist */}
                        {orderChecklists.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2"><ListChecks className="h-4 w-4" /> Checklist</h4>
                            <div className="space-y-1.5">
                              {orderChecklists.map((cl) => (
                                <label key={cl.id} className="flex items-center gap-3 cursor-pointer card p-2 bg-white dark:bg-slate-900">
                                  <input type="checkbox" checked={cl.is_done} onChange={() => toggleChecklistItem(cl, form.assigned_to || o.assigned_to || 'Sistema')} className="h-4 w-4 rounded accent-teal-600" />
                                  <span className={`text-sm flex-1 ${cl.is_done ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}`}>{cl.label}</span>
                                  {cl.snapshot_template_name && <span className="text-xs text-slate-400">{cl.snapshot_template_name}</span>}
                                  {cl.done_by && <span className="text-xs text-slate-400">por {cl.done_by}</span>}
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Step history */}
                        {stepHistory.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Histórico de alterações</h4>
                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {stepHistory.map((h) => {
                                const step = productionSteps.find((s) => s.id === h.step_id);
                                return (
                                  <div key={h.id} className="text-xs text-slate-400 flex items-center gap-2">
                                    <span>{formatDateTime(h.changed_at)}</span>
                                    <span>{step?.step_name ?? '—'}:</span>
                                    <span>{h.field_changed} de "{h.old_value ?? '—'}" para "{h.new_value ?? '—'}"</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Independent deliveries */}
                        <div className="flex flex-wrap gap-3">
                          <button onClick={() => toggleDigitalDelivery(o)} className={`btn-secondary text-xs ${o.digital_delivered ? 'text-emerald-600 border-emerald-300' : ''}`}>
                            <Image className="h-4 w-4" /> {o.digital_delivered ? 'Digital entregue' : 'Marcar digital'} {o.digital_delivered_at && `· ${formatDateTime(o.digital_delivered_at)}`}
                          </button>
                          <button onClick={() => togglePrintedDelivery(o)} className={`btn-secondary text-xs ${o.printed_delivered ? 'text-emerald-600 border-emerald-300' : ''}`}>
                            <Printer className="h-4 w-4" /> {o.printed_delivered ? 'Impressas entregues' : 'Marcar impressas'} {o.printed_delivered_at && `· ${formatDateTime(o.printed_delivered_at)}`}
                          </button>
                        </div>

                        <div className="flex flex-wrap gap-3">
                          <button onClick={() => openEdit(o)} className="btn-ghost text-xs"><Settings className="h-3 w-3" /> Editar pedido</button>
                          <button onClick={() => openEmailModal(o)} className="btn-ghost text-xs" style={{ color: 'var(--color-primary)' }}><Mail className="h-3 w-3" /> Enviar OS por e-mail</button>
                          <button onClick={() => openWhatsAppModal(o)} className="btn-ghost text-xs" style={{ color: '#25D366' }}><MessageCircle className="h-3 w-3" /> Enviar OS pelo WhatsApp</button>
                        </div>

                        {emailHistory.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2"><History className="h-4 w-4" /> Histórico de envios</h4>
                            <div className="space-y-1.5">
                              {emailHistory.map((h) => {
                                const isWhats = (h as unknown as { channel?: string }).channel === 'whatsapp';
                                const recipient = isWhats
                                  ? formatPhoneForDisplay((h as unknown as { recipient_phone?: string }).recipient_phone) || (h as unknown as { recipient_phone?: string }).recipient_phone
                                  : h.recipient_email;
                                return (
                                  <div key={h.id} className="flex items-center justify-between text-xs card p-2 bg-white dark:bg-slate-900">
                                    <div className="flex items-center gap-2">
                                      <span className={`badge ${isWhats ? 'badge-info' : ''} ${h.status === 'enviado' ? 'badge-success' : h.status === 'falhou' ? 'badge-danger' : 'badge-neutral'} text-xs`}>
                                        {isWhats ? 'WhatsApp' : 'E-mail'}: {h.status === 'enviado' ? 'aberto' : h.status === 'falhou' ? 'falhou' : 'pendente'}
                                      </span>
                                      <span className="text-slate-600 dark:text-slate-300">{recipient}</span>
                                      {h.error_message && <span className="text-red-500">— {h.error_message}</span>}
                                    </div>
                                    <span className="text-slate-400">{formatDateTime(h.created_at)}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'delivery' && (
        <>
          {/* Red delivery panel */}
          <div className="rounded-2xl border-2 border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-6 mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="rounded-xl bg-red-500 p-3"><PackageCheck className="h-6 w-6 text-white" /></div>
              <div>
                <h2 className="text-lg font-bold text-red-700 dark:text-red-300">PEDIDO ENTREGUE</h2>
                <p className="text-sm text-red-600 dark:text-red-400">Pesquise a OS e confirme a baixa de entrega</p>
              </div>
            </div>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-red-400" />
              <input className="input pl-10 border-red-200 dark:border-red-800" placeholder="Buscar por código da OS..." value={deliverySearch} onChange={(e) => setDeliverySearch(e.target.value)} />
              {deliverySearch && <button onClick={() => setDeliverySearch('')} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="h-4 w-4 text-slate-400" /></button>}
            </div>
          </div>

          {deliveryResults.length === 0 ? (
            <EmptyState icon={<PackageCheck className="h-12 w-12" />} title="Nenhum pedido para entregar" description="Todos os pedidos já foram entregues ou não há pedidos com o código buscado." />
          ) : (
            <div className="space-y-3">
              {deliveryResults.map((o) => {
                const client = clients.find((c) => c.id === o.client_id);
                return (
                  <div key={o.id} className={`card p-4 ${o.delivery_confirmed ? 'opacity-60' : ''}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">{o.code}</span>
                          <p className="font-medium text-slate-900 dark:text-slate-100">{o.title}</p>
                          {o.delivery_confirmed && <span className="badge badge-success text-xs">Entregue</span>}
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">Cliente: {client?.full_name ?? '—'}</p>
                        <div className="flex items-center gap-3 mt-1">
                          {o.digital_delivered ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Image className="h-3 w-3" /> Digital OK</span> : <span className="text-xs text-slate-400 flex items-center gap-1"><Image className="h-3 w-3" /> Digital pendente</span>}
                          {o.printed_delivered ? <span className="text-xs text-emerald-600 flex items-center gap-1"><Printer className="h-3 w-3" /> Impressas OK</span> : <span className="text-xs text-slate-400 flex items-center gap-1"><Printer className="h-3 w-3" /> Impressas pendente</span>}
                        </div>
                      </div>
                      {o.delivery_confirmed ? (
                        <div className="text-right">
                          <p className="text-xs text-slate-400">Entregue em</p>
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{formatDateTime(o.delivery_confirmed_at ?? '')}</p>
                          {o.delivery_confirmed_by && <p className="text-xs text-slate-400">por {o.delivery_confirmed_by}</p>}
                        </div>
                      ) : (
                        <button onClick={() => setDeliveryConfirm(o)} className="btn-danger"><PackageCheck className="h-4 w-4" /> DAR BAIXA</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === 'templates' && (
        <>
          {templates.length === 0 ? (
            <EmptyState icon={<ListChecks className="h-12 w-12" />} title="Nenhum modelo de checklist" description="Crie modelos de checklist por tipo de serviço. Ao criar um pedido, as tarefas aplicáveis são geradas automaticamente." action={<button onClick={openNewTemplate} className="btn-primary"><Plus className="h-4 w-4" /> Novo modelo</button>} />
          ) : (
            <div className="space-y-3">
              {templates.map((t) => {
                const items = templateItems.filter((ti) => ti.template_id === t.id).sort((a, b) => a.item_order - b.item_order);
                return (
                  <div key={t.id} className="card p-4">
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{t.name}</p>
                          {t.service_type && <span className="badge badge-info text-xs">{t.service_type}</span>}
                          {!t.is_active && <span className="badge badge-neutral text-xs">Inativo</span>}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {items.map((ti) => <span key={ti.id} className="text-xs bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 text-slate-600 dark:text-slate-300">{ti.label}</span>)}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => openEditTemplate(t)} className="btn-ghost"><Settings className="h-4 w-4" /></button>
                        <button onClick={() => handleDeleteTemplate(t.id)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="card p-4 mt-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
            <p className="text-sm text-amber-700 dark:text-amber-300">Importante: ao criar um pedido, os checklists são gerados como uma cópia (snapshot) do modelo. Alterações futuras nos modelos não modificam checklists de pedidos antigos.</p>
          </div>
        </>
      )}

      {/* Order modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar pedido' : 'Nova ordem de serviço'} size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="label">Número da OS</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><label className="label">Status</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label className="label">Prioridade</label><select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{Object.entries(priorityLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
          </div>
          <div><label className="label">Cliente *</label><ClientSearchSelect clients={clients} value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id ?? '' })} /></div>
          <div><label className="label">Título *</label><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
          <div><label className="label">Descrição</label><textarea className="input min-h-[60px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Itens do pedido</h4>
              <button onClick={addFormItem} className="btn-ghost text-xs"><Plus className="h-3 w-3" /> Adicionar item</button>
            </div>
            <div className="space-y-2">
              {formItems.map((item, idx) => (
                <div key={item.id} className="card p-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-4">
                      <label className="label text-xs">Serviço {idx + 1}</label>
                      <select className="input text-sm" value={item.is_custom ? 'custom' : (item.service_id ?? '')} onChange={(e) => selectFormService(item.id, e.target.value)}>
                        <option value="">Selecione...</option>
                        {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)}</option>)}
                        <option value="custom">Serviço avulso</option>
                      </select>
                    </div>
                    <div className="col-span-4 sm:col-span-2"><label className="label text-xs">Qtd</label><input type="number" step="0.01" className="input text-sm" value={item.quantity} onChange={(e) => updateFormItem(item.id, { quantity: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-4 sm:col-span-2"><label className="label text-xs">Valor unit.</label><input type="number" step="0.01" className="input text-sm" value={item.unit_price} onChange={(e) => updateFormItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-2 sm:col-span-1"><label className="label text-xs">Desc.</label><input type="number" step="0.01" className="input text-sm" value={item.discount} onChange={(e) => updateFormItem(item.id, { discount: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-3 sm:col-span-2"><label className="label text-xs">Subtotal</label><p className="text-sm font-semibold pt-2.5" style={{ color: 'var(--color-primary)' }}>{formatCurrency(item.subtotal)}</p></div>
                    <div className="col-span-1 flex justify-end"><button onClick={() => removeFormItem(item.id)} className="btn-ghost text-red-500 mb-2"><Trash2 className="h-4 w-4" /></button></div>
                    {item.is_custom && <div className="col-span-12 sm:col-span-6"><input className="input text-sm" placeholder="Nome do serviço avulso" value={item.name} onChange={(e) => updateFormItem(item.id, { name: e.target.value })} /></div>}
                    <div className="col-span-12 sm:col-span-6"><input className="input text-sm" placeholder="Descrição (opcional)" value={item.description} onChange={(e) => updateFormItem(item.id, { description: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>
            {itemsTotal > 0 && <div className="text-right mt-2"><span className="text-sm text-slate-500">Total: </span><span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(itemsTotal)}</span></div>}
          </div>

          {/* Production steps */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Etapas de produção</h4>
              <button onClick={() => setFormSteps([...formSteps, { id: `step-${Date.now()}`, step_name: '', assigned_to: '' }])} className="btn-ghost text-xs"><Plus className="h-3 w-3" /> Adicionar etapa</button>
            </div>
            <div className="space-y-2">
              {formSteps.map((s, idx) => (
                <div key={s.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">#{idx + 1}</span>
                  <input className="input text-sm flex-1" placeholder="Nome da etapa" value={s.step_name} onChange={(e) => setFormSteps(formSteps.map((fs) => fs.id === s.id ? { ...fs, step_name: e.target.value } : fs))} />
                  <input className="input text-sm sm:w-48" placeholder="Responsável" value={s.assigned_to} onChange={(e) => setFormSteps(formSteps.map((fs) => fs.id === s.id ? { ...fs, assigned_to: e.target.value } : fs))} />
                  <button onClick={() => setFormSteps(formSteps.filter((fs) => fs.id !== s.id))} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Prazo de entrega</label><input type="date" className="input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></div>
            <div><label className="label">Responsável geral</label><input className="input" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Orçamento de origem (opcional)</label><select className="input" value={form.budget_id} onChange={(e) => setForm({ ...form, budget_id: e.target.value })}><option value="">Sem orçamento</option>{budgets.filter((b) => !form.client_id || b.client_id === form.client_id).map((b) => <option key={b.id} value={b.id}>{b.code} — {formatCurrency(b.total)}</option>)}</select></div>
            <div><label className="label">Agendamento (opcional)</label><select className="input" value={form.appointment_id} onChange={(e) => setForm({ ...form, appointment_id: e.target.value })}><option value="">Sem agendamento</option>{appointments.filter((a) => !form.client_id || a.client_id === form.client_id).map((a) => <option key={a.id} value={a.id}>{formatDate(a.appointment_date)} — {a.title}</option>)}</select></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Campanha (opcional)</label><select className="input" value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}><option value="">Sem campanha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
            <div><label className="label">Forma de entrega</label><select className="input" value={form.delivery_method} onChange={(e) => setForm({ ...form, delivery_method: e.target.value })}>{deliveryMethods.map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          <div><label className="label">Código de rastreio</label><input className="input" value={form.tracking_code} onChange={(e) => setForm({ ...form, tracking_code: e.target.value })} /></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[50px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleSave} disabled={saving} className="btn-primary"><Save className="h-4 w-4" /> {saving ? 'Salvando...' : (editingId ? 'Salvar' : 'Criar pedido')}</button></div>
      </Modal>

      {/* Delivery confirmation modal */}
      <Modal open={!!deliveryConfirm} onClose={() => setDeliveryConfirm(null)} title="Confirmar baixa de entrega" size="sm">
        {deliveryConfirm && (() => {
          const client = clients.find((c) => c.id === deliveryConfirm.client_id);
          return (
            <div className="space-y-4">
              <div className="card p-4 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800">
                <p className="text-xs text-red-600 dark:text-red-400 uppercase mb-2">Confirme os dados antes de dar baixa</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Número da OS:</span><span className="font-mono font-medium">{deliveryConfirm.code}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-medium">{client?.full_name ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Serviço:</span><span className="font-medium">{deliveryConfirm.title}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Digital:</span><span className={deliveryConfirm.digital_delivered ? 'text-emerald-600' : 'text-amber-600'}>{deliveryConfirm.digital_delivered ? 'Entregue' : 'Pendente'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Fotos impressas:</span><span className={deliveryConfirm.printed_delivered ? 'text-emerald-600' : 'text-amber-600'}>{deliveryConfirm.printed_delivered ? 'Entregues' : 'Pendentes'}</span></div>
                </div>
              </div>
              <div><label className="label">Responsável pela baixa *</label><input className="input" placeholder="Nome de quem confirmou a entrega" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} /></div>
              <p className="text-xs text-slate-400">Após confirmar, a data e horário reais serão registrados. A baixa não pode ser repetida.</p>
              <div className="flex justify-end gap-3"><button onClick={() => setDeliveryConfirm(null)} className="btn-secondary">Cancelar</button><button onClick={() => confirmDelivery(deliveryConfirm, form.assigned_to || 'Sistema')} className="btn-danger"><PackageCheck className="h-4 w-4" /> Confirmar entrega</button></div>
            </div>
          );
        })()}
      </Modal>

      {/* Template modal */}
      <Modal open={templateModal} onClose={() => setTemplateModal(false)} title={editingTemplateId ? 'Editar modelo de checklist' : 'Novo modelo de checklist'} size="md">
        <div className="space-y-4">
          <div><label className="label">Nome do modelo *</label><input className="input" placeholder="Ex: Ensaio externo, Álbum premium" value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} /></div>
          <div><label className="label">Tipo de serviço (opcional)</label><input className="input" placeholder="Ex: ensaio, álbum, impressão. Deixe vazio para todos." value={templateForm.service_type} onChange={(e) => setTemplateForm({ ...templateForm, service_type: e.target.value })} /></div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Tarefas</label>
              <button onClick={() => setTemplateFormItems([...templateFormItems, { id: `ti-${Date.now()}`, label: '' }])} className="btn-ghost text-xs"><Plus className="h-3 w-3" /> Adicionar</button>
            </div>
            <div className="space-y-2">
              {templateFormItems.map((ti, idx) => (
                <div key={ti.id} className="flex items-center gap-2">
                  <span className="text-xs text-slate-400 font-mono">#{idx + 1}</span>
                  <input className="input text-sm flex-1" placeholder="Ex: Preparar cenário, conferir equipamentos" value={ti.label} onChange={(e) => setTemplateFormItems(templateFormItems.map((t) => t.id === ti.id ? { ...t, label: e.target.value } : t))} />
                  <button onClick={() => setTemplateFormItems(templateFormItems.filter((t) => t.id !== ti.id))} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={templateForm.is_active} onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })} className="h-4 w-4 rounded accent-teal-600" /> Modelo ativo</label>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setTemplateModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveTemplate} className="btn-primary"><Save className="h-4 w-4" /> Salvar modelo</button></div>
      </Modal>

      {/* Email modal */}
      <Modal open={!!emailModal} onClose={() => emailSending ? undefined : setEmailModal(null)} title="Enviar OS por e-mail" size="sm">
        {emailModal && (() => {
          const client = clients.find((c) => c.id === emailModal.client_id);
          return (
            <div className="space-y-4">
              <div className="card p-4 bg-sky-50 dark:bg-sky-950/30 border-sky-200 dark:border-sky-800">
                <p className="text-xs text-sky-600 dark:text-sky-400 uppercase mb-2">Confirme os dados do envio</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Número da OS:</span><span className="font-mono font-medium">{emailModal.code}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-medium">{client?.full_name ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Pedido:</span><span className="font-medium">{emailModal.title}</span></div>
                </div>
              </div>
              <div>
                <label className="label">Destinatário *</label>
                <input className="input" type="email" placeholder="email@exemplo.com" value={emailRecipient} onChange={(e) => setEmailRecipient(e.target.value)} disabled={emailSending} />
                <p className="text-xs text-slate-400 mt-1">O e-mail do cliente foi preenchido automaticamente. Você pode alterar se necessário.</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-500 dark:text-slate-400">
                <p className="font-medium text-slate-600 dark:text-slate-300 mb-1">Será enviado:</p>
                <ul className="space-y-1">
                  <li>- E-mail com mensagem profissional e dados do pedido</li>
                  <li>- PDF da Ordem de Serviço em anexo</li>
                  <li>- O número da OS será preservado (não é gerado um novo)</li>
                </ul>
              </div>
              {emailSending && (
                <div className="rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-3 flex items-center gap-2 text-sm text-sky-700 dark:text-sky-300">
                  <Send className="h-4 w-4 animate-pulse" /> Enviando e-mail... Aguarde.
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setEmailModal(null)} disabled={emailSending} className="btn-secondary">Cancelar</button>
                <button onClick={handleSendEmail} disabled={emailSending || !emailRecipient.trim()} className="btn-primary">
                  <Send className="h-4 w-4" /> {emailSending ? 'Enviando...' : 'Confirmar envio'}
                </button>
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* WhatsApp modal */}
      <Modal open={!!whatsappModal} onClose={() => whatsappOpening ? undefined : setWhatsappModal(null)} title="Enviar OS pelo WhatsApp" size="md">
        {whatsappModal && (() => {
          const client = clients.find((c) => c.id === whatsappModal.client_id);
          return (
            <div className="space-y-4">
              <div className="card p-4 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800">
                <p className="text-xs text-emerald-600 dark:text-emerald-400 uppercase mb-2">Confirme os dados do envio</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Número da OS:</span><span className="font-mono font-medium">{whatsappModal.code}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Cliente:</span><span className="font-medium">{client?.full_name ?? '—'}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Telefone:</span><span className="font-medium">{formatPhoneForDisplay(whatsappPhone) || whatsappPhone}</span></div>
                </div>
              </div>

              <div>
                <label className="label">Telefone do destinatário *</label>
                <input className="input" type="tel" placeholder="(11) 99999-9999" value={whatsappPhone} onChange={(e) => setWhatsappPhone(e.target.value)} disabled={whatsappOpening} />
                <p className="text-xs text-slate-400 mt-1">O telefone do cliente foi preenchido automaticamente. Você pode corrigir se necessário.</p>
              </div>

              <div>
                <label className="label">Mensagem</label>
                <textarea className="input min-h-[160px] text-sm" value={whatsappMessage} onChange={(e) => setWhatsappMessage(e.target.value)} disabled={whatsappOpening} />
                <p className="text-xs text-slate-400 mt-1">Confira e edite o texto antes de enviar. A mensagem será aberta no WhatsApp para sua confirmação.</p>
              </div>

              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                <p className="font-medium mb-1">Como anexar o PDF da OS:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Clique em "Salvar PDF da OS" abaixo para baixar o arquivo.</li>
                  <li>Após abrir o WhatsApp, use o botão de anexo (clipe) para enviar o PDF.</li>
                  <li>Confirme o envio no próprio aplicativo do WhatsApp.</li>
                </ol>
              </div>

              {whatsappOpening && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-3 flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <MessageCircle className="h-4 w-4 animate-pulse" /> Abrindo o WhatsApp para enviar a Ordem de Serviço...
                </div>
              )}

              <div className="flex justify-between gap-3">
                <button
                  onClick={async () => {
                    if (!whatsappModal) return;
                    const client2 = clients.find((c) => c.id === whatsappModal.client_id);
                    const itemsText = orderItems.length > 0
                      ? orderItems.map((it) => `- ${it.name} (Qtd: ${it.quantity}) — ${formatCurrency(it.subtotal)}`).join('\n')
                      : 'Sem itens detalhados.';
                    const total = orderItems.reduce((s, it) => s + it.subtotal, 0);
                    const pdfSettings = {
                      studio_name: settings.studio_name,
                      fantasy_name: settings.fantasy_name,
                      tax_id: settings.tax_id,
                      address: settings.address,
                      phone: settings.phone,
                      email: settings.email,
                      logo_url: settings.logo_url,
                    };
                    const pdfBlob = generateDocumentPDF({
                      title: `Ordem de Serviço ${whatsappModal.code}`,
                      body: `${whatsappModal.title}\n\nCliente: ${client2?.full_name ?? '—'}\n${client2?.phone ? 'Telefone: ' + client2.phone + '\n' : ''}Itens:\n${itemsText}\n${total > 0 ? '\nValor total: ' + formatCurrency(total) : ''}${whatsappModal.due_date ? '\n\nPrazo de entrega: ' + formatDate(whatsappModal.due_date) : ''}${whatsappModal.delivery_method ? '\nForma de entrega: ' + whatsappModal.delivery_method : ''}${whatsappModal.notes ? '\n\nObservações:\n' + whatsappModal.notes : ''}`,
                      settings: pdfSettings,
                    });
                    const url = URL.createObjectURL(pdfBlob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `OS-${whatsappModal.code}.pdf`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast('PDF da OS salvo. Anexe-o no WhatsApp.', 'success');
                  }}
                  disabled={whatsappOpening}
                  className="btn-secondary"
                >
                  <Download className="h-4 w-4" /> Salvar PDF da OS
                </button>

                <div className="flex gap-3">
                  <button onClick={() => setWhatsappModal(null)} disabled={whatsappOpening} className="btn-secondary">Cancelar</button>
                  <button
                    onClick={async () => {
                      if (!whatsappModal) return;
                      const normalized = normalizePhone(whatsappPhone);
                      if (!normalized) {
                        toast('Confira o número do telefone antes de continuar. Formato inválido.', 'warning');
                        return;
                      }
                      if (!whatsappMessage.trim()) {
                        toast('A mensagem não pode estar vazia.', 'warning');
                        return;
                      }
                      setWhatsappOpening(true);
                      const url = buildWhatsAppUrl(normalized, whatsappMessage);
                      const res = await openWhatsApp(url);
                      if (res.success) {
                        await supabase.from('email_send_history').insert({
                          service_order_id: whatsappModal.id,
                          order_code: whatsappModal.code,
                          client_id: whatsappModal.client_id,
                          recipient_email: '',
                          recipient_phone: normalized,
                          subject: null,
                          status: 'enviado',
                          channel: 'whatsapp',
                          sent_at: new Date().toISOString(),
                        });
                        toast('WhatsApp aberto. Confirme o envio no aplicativo.', 'info');
                        setWhatsappModal(null);
                      } else {
                        await supabase.from('email_send_history').insert({
                          service_order_id: whatsappModal.id,
                          order_code: whatsappModal.code,
                          client_id: whatsappModal.client_id,
                          recipient_email: '',
                          recipient_phone: normalized,
                          subject: null,
                          status: 'falhou',
                          channel: 'whatsapp',
                          error_message: res.error ?? 'Não foi possível abrir o WhatsApp',
                        });
                        toast('Não foi possível abrir o WhatsApp. Verifique a conexão ou tente novamente.', 'error');
                      }
                      if (expandedOrder === whatsappModal.id) {
                        const { data: histData } = await supabase.from('email_send_history').select('*').eq('service_order_id', whatsappModal.id).order('created_at', { ascending: false });
                        setEmailHistory((histData as EmailSendHistory[]) ?? []);
                      }
                      setWhatsappOpening(false);
                    }}
                    disabled={whatsappOpening || !whatsappPhone.trim() || !whatsappMessage.trim()}
                    className="btn-primary"
                    style={{ backgroundColor: '#25D366', borderColor: '#25D366' }}
                  >
                    <MessageCircle className="h-4 w-4" /> {whatsappOpening ? 'Abrindo...' : 'Abrir WhatsApp'}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir pedido" message={`Confirma a exclusão do pedido ${deleteTarget?.code}?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
