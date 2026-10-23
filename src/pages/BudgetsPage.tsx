import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useSettings } from '@/context/SettingsContext';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, todayISO, buildWhatsAppUrl, toLocalISODate } from '@/lib/utils';
import { Plus, Search, Eye, Trash2, FileText, Printer, CircleCheck as CheckCircle, Circle as XCircle, Trash, MessageCircle } from 'lucide-react';
import type { Budget, BudgetItem, Client, Service, ServiceOrder, Campaign } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import { buildPrintHTML, openPrintWindow } from '@/lib/printUtils';
import { useSaving } from '@/lib/useSaving';

const statusLabels: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  aguardando: 'Aguardando resposta',
  aprovado: 'Aprovado',
  recusado: 'Recusado',
  expirado: 'Expirado',
  cancelado: 'Cancelado',
};

const statusBadge: Record<string, string> = {
  rascunho: 'badge-neutral',
  enviado: 'badge-info',
  aguardando: 'badge-warning',
  aprovado: 'badge-success',
  recusado: 'badge-danger',
  expirado: 'badge-neutral',
  cancelado: 'badge-danger',
};

interface BudgetFormItem {
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

let _itemCounter = 0;
function makeItem(): BudgetFormItem {
  _itemCounter++;
  return { id: `new-${Date.now()}-${_itemCounter}`, service_id: null, is_custom: false, name: '', description: '', quantity: 1, unit_price: 0, discount: 0, subtotal: 0 };
}

export function BudgetsPage() {
  const { settings } = useSettings();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<Budget | null>(null);
  const [viewItems, setViewItems] = useState<BudgetItem[]>([]);
  const [viewClient, setViewClient] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Budget | null>(null);
  const [quickServiceModal, setQuickServiceModal] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [quickServiceForm, setQuickServiceForm] = useState({ name: '', price: 0 });

  const [form, setForm] = useState({
    code: '',
    client_id: '',
    status: 'rascunho',
    general_discount: 0,
    deposit: 0,
    payment_conditions: '',
    valid_until: '',
    observations: '',
    template_style: 'simples',
    campaign_id: '',
  });
  const [items, setItems] = useState<BudgetFormItem[]>([makeItem()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { saving, withSaving } = useSaving();

  const loadBudgets = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('budgets').select('*').order('created_at', { ascending: false });
    setBudgets((data as Budget[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadBudgets();
    (async () => { try { const { data } = await supabase.from('clients').select('*').eq('status', 'ativo').order('full_name'); setClients((data as Client[]) ?? []); } catch { /* ignore */ } })();
    (async () => { try { const { data } = await supabase.from('services').select('*').eq('active', true).order('name'); setServices((data as Service[]) ?? []); } catch { /* ignore */ } })();
    (async () => { try { const { data } = await supabase.from('campaigns').select('*').eq('status', 'ativa').order('name'); setCampaigns((data as Campaign[]) ?? []); } catch { /* ignore */ } })();
  }, [loadBudgets]);

  const filtered = budgets.filter((b) => {
    const client = clients.find((c) => c.id === b.client_id);
    const matchesSearch = b.code.toLowerCase().includes(search.toLowerCase()) || (client?.full_name.toLowerCase().includes(search.toLowerCase()) ?? false);
    const matchesStatus = !filterStatus || b.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const calcSubtotal = (item: BudgetFormItem) => {
    const gross = item.quantity * item.unit_price;
    return Math.max(0, gross - item.discount);
  };

  const updateItem = (id: string, updates: Partial<BudgetFormItem>) => {
    setItems((prev) => prev.map((it) => {
      if (it.id !== id) return it;
      const updated = { ...it, ...updates };
      updated.subtotal = calcSubtotal(updated);
      return updated;
    }));
  };

  const addItem = () => setItems((prev) => [...prev, makeItem()]);
  const removeItem = (id: string) => setItems((prev) => prev.length > 1 ? prev.filter((it) => it.id !== id) : prev);

  const selectService = (itemId: string, serviceId: string) => {
    if (serviceId === 'custom') {
      updateItem(itemId, { service_id: null, is_custom: true, name: '', description: '', unit_price: 0, quantity: 1, discount: 0 });
    } else {
      const svc = services.find((s) => s.id === serviceId);
      if (svc) {
        updateItem(itemId, { service_id: svc.id, is_custom: false, name: svc.name, description: svc.description ?? '', unit_price: svc.price, quantity: 1, discount: 0 });
      }
    }
  };

  const itemsSubtotal = items.reduce((sum, it) => sum + it.subtotal, 0);
  const total = Math.max(0, itemsSubtotal - (form.general_discount || 0));
  const balance = total - (form.deposit || 0);

  const openNew = () => {
    setEditingId(null);
    setForm({ code: `ORC-${String(budgets.length + 1).padStart(4, '0')}`, client_id: '', status: 'rascunho', general_discount: 0, deposit: 0, payment_conditions: '', valid_until: '', observations: '', template_style: 'simples', campaign_id: '' });
    setItems([makeItem()]);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.client_id) { toast('Selecione um cliente', 'warning'); return; }
    if (items.every((it) => !it.name)) { toast('Adicione pelo menos um item', 'warning'); return; }

    return withSaving(async () => {
    const validItems = items.filter((it) => it.name);
    const payload = {
      code: form.code,
      client_id: form.client_id,
      status: form.status,
      subtotal: itemsSubtotal,
      general_discount: form.general_discount,
      total,
      deposit: form.deposit,
      balance,
      payment_conditions: form.payment_conditions,
      valid_until: form.valid_until || null,
      observations: form.observations,
      template_style: form.template_style,
      campaign_id: form.campaign_id || null,
    };

    if (editingId) {
      const { error } = await supabase.from('budgets').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', editingId);
      if (error) { toast('Erro ao atualizar orçamento', 'error'); return; }
      const { error: itemError } = await supabase.from('budget_items').upsert(validItems.map((it) => ({ id: it.id?.startsWith('new-') ? undefined : it.id, budget_id: editingId, service_id: it.service_id, is_custom: it.is_custom, name: it.name, description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, subtotal: it.subtotal })));
      if (itemError) { toast('Erro ao salvar itens do orçamento', 'error'); return; }
      toast('Orçamento atualizado', 'success');
    } else {
      const { data, error } = await supabase.from('budgets').insert(payload).select('*').maybeSingle();
      if (error) { toast('Erro ao criar orçamento', 'error'); return; }
      const budget = data as Budget;
      await supabase.from('budget_items').insert(validItems.map((it) => ({ budget_id: budget.id, service_id: it.service_id, is_custom: it.is_custom, name: it.name, description: it.description, quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, subtotal: it.subtotal })));
      await supabase.from('client_history').insert({ client_id: form.client_id, event_type: 'orcamento', description: `Orçamento ${form.code} criado`, source_table: 'budgets', source_id: budget.id });
      toast('Orçamento criado', 'success');
    }
    setModalOpen(false);
    loadBudgets();
    });
  };

  const openView = async (b: Budget) => {
    setViewTarget(b);
    const [{ data: itemsData }, { data: clientData }] = await Promise.all([
      supabase.from('budget_items').select('*').eq('budget_id', b.id),
      supabase.from('clients').select('*').eq('id', b.client_id).maybeSingle(),
    ]);
    setViewItems((itemsData as BudgetItem[]) ?? []);
    setViewClient((clientData as Client) ?? null);
  };

  const openEdit = async (b: Budget) => {
    setEditingId(b.id);
    const { data: itemsData } = await supabase.from('budget_items').select('*').eq('budget_id', b.id);
    setForm({
      code: b.code, client_id: b.client_id, status: b.status, general_discount: b.general_discount,
      deposit: b.deposit, payment_conditions: b.payment_conditions ?? '', valid_until: b.valid_until ?? '',
      observations: b.observations ?? '', template_style: b.template_style, campaign_id: b.campaign_id ?? '',
    });
    const loadedItems = (itemsData as BudgetItem[]) ?? [];
    setItems(loadedItems.length > 0 ? loadedItems.map((it) => ({ id: it.id, service_id: it.service_id, is_custom: it.is_custom, name: it.name, description: it.description ?? '', quantity: it.quantity, unit_price: it.unit_price, discount: it.discount, subtotal: it.subtotal })) : [makeItem()]);
    setModalOpen(true);
  };

  const changeStatus = async (b: Budget, status: string) => {
    const { error } = await supabase.from('budgets').update({ status, updated_at: new Date().toISOString() }).eq('id', b.id);
    if (error) { toast('Erro ao atualizar status. Verifique sua conexão.', 'error'); return; }
    if (status === 'aprovado') {
      await supabase.from('client_history').insert({ client_id: b.client_id, event_type: 'orcamento', description: `Orçamento ${b.code} aprovado`, source_table: 'budgets', source_id: b.id });
      const existing = await supabase.from('financial_entries').select('id').eq('budget_id', b.id).maybeSingle();
      if (!existing.data) {
        await supabase.from('financial_entries').insert({
          client_id: b.client_id,
          budget_id: b.id,
          description: `Orçamento ${b.code} — ${b.total > 0 ? formatCurrency(b.total) : ''}`,
          total_amount: b.total,
          paid_amount: b.deposit,
          due_date: toLocalISODate(new Date()),
          installment_number: 1,
          total_installments: 1,
          category: 'servico',
          status: b.deposit >= b.total ? 'pago' : 'pendente',
          paid_date: b.deposit >= b.total ? toLocalISODate(new Date()) : null,
        });
      }
      const existingOrder = await supabase.from('service_orders').select('id').eq('budget_id', b.id).maybeSingle();
      if (!existingOrder.data) {
        const { data: codeData } = await supabase.rpc('generate_os_code');
        const osCode = (codeData as string) ?? `os${String(Date.now()).slice(-4)}`;
        const { data: newOrder } = await supabase.from('service_orders').insert({
          code: osCode,
          client_id: b.client_id,
          budget_id: b.id,
          title: `Pedido do ${b.code}`,
          status: 'rascunho',
          priority: 'normal',
          items_summary: `Convertido do orçamento ${b.code}`,
          campaign_id: b.campaign_id ?? null,
        }).select('*').maybeSingle();
        if (newOrder) {
          const order = newOrder as ServiceOrder;
          const { data: budgetItems } = await supabase.from('budget_items').select('*').eq('budget_id', b.id);
          if (budgetItems && (budgetItems as BudgetItem[]).length > 0) {
            await supabase.from('order_items').insert((budgetItems as BudgetItem[]).map((it) => ({
              order_id: order.id,
              service_id: it.service_id,
              is_custom: it.is_custom,
              name: it.name,
              description: it.description,
              quantity: it.quantity,
              unit_price: it.unit_price,
              discount: it.discount,
              subtotal: it.subtotal,
            })));
          }
          await supabase.from('client_history').insert({ client_id: b.client_id, event_type: 'ordem_servico', description: `Ordem de serviço ${osCode} criada a partir do orçamento ${b.code}`, source_table: 'service_orders', source_id: order.id });
        }
      }
      toast('Orçamento aprovado! Conta a receber e pedido criados.', 'success');
    } else {
      toast('Status atualizado', 'success');
    }
    loadBudgets();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('budgets').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir orçamento. Verifique sua conexão.', 'error'); return; }
    toast('Orçamento excluído', 'success');
    setDeleteTarget(null);
    loadBudgets();
  };

  const quickAddService = async () => {
    if (!quickServiceForm.name) { toast('Informe o nome do serviço', 'warning'); return; }
    const { data, error } = await supabase.from('services').insert({
      code: `SRV-${String(services.length + 1).padStart(3, '0')}`,
      name: quickServiceForm.name,
      price: quickServiceForm.price,
      active: true,
    }).select('*').maybeSingle();
    if (error) { toast('Erro ao cadastrar serviço', 'error'); return; }
    const newSvc = data as Service;
    setServices((prev) => [...prev, newSvc]);
    const firstItem = items[0];
    if (firstItem && !firstItem.name) {
      selectService(firstItem.id, newSvc.id);
    } else {
      const newItem = makeItem();
      newItem.service_id = newSvc.id;
      newItem.name = newSvc.name;
      newItem.unit_price = newSvc.price;
      newItem.subtotal = newSvc.price;
      setItems((prev) => [...prev, newItem]);
    }
    toast('Serviço cadastrado e adicionado ao orçamento', 'success');
    setQuickServiceModal(false);
    setQuickServiceForm({ name: '', price: 0 });
  };

  const printBudget = () => {
    const printArea = document.getElementById('printable-budget');
    if (!printArea) { window.print(); return; }
    const bodyContent = printArea.innerHTML;
    const html = buildPrintHTML(`Orçamento ${viewTarget?.code ?? ''}`, bodyContent, settings);
    openPrintWindow(html);
  };

  const sendBudgetWhatsapp = async () => {
    if (!viewTarget || !viewClient) return;
    const phone = viewClient.whatsapp ?? viewClient.phone ?? '';
    if (!phone) { toast('Cliente sem telefone cadastrado', 'warning'); return; }
    const msg = `Olá, ${viewClient.full_name}! Segue o orçamento ${viewTarget.code} da ${settings.studio_name}.\n\nItens:\n${viewItems.map((it) => `- ${it.name} (${it.quantity}x): ${formatCurrency(it.subtotal)}`).join('\n')}\n\nTotal: ${formatCurrency(viewTarget.total)}${viewTarget.deposit > 0 ? `\nSinal: ${formatCurrency(viewTarget.deposit)}` : ''}${viewTarget.payment_conditions ? `\nCondições: ${viewTarget.payment_conditions}` : ''}${viewTarget.valid_until ? `\nVálido até: ${formatDate(viewTarget.valid_until)}` : ''}\n\nQualquer dúvida, estamos à disposição!`;
    window.open(buildWhatsAppUrl(phone, msg), '_blank');
    await supabase.from('budgets').update({ status: 'enviado', updated_at: new Date().toISOString() }).eq('id', viewTarget.id);
    await supabase.from('client_history').insert({ client_id: viewTarget.client_id, event_type: 'orcamento', description: `Orçamento ${viewTarget.code} enviado via WhatsApp`, source_table: 'budgets', source_id: viewTarget.id });
    toast('Orçamento enviado via WhatsApp e status atualizado para "Enviado"', 'success');
    setViewTarget(null);
    loadBudgets();
  };

  return (
    <div>
      <PageHeader title="Orçamentos" subtitle={`${budgets.length} orçamento(s) emitido(s)`} actions={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Novo orçamento</button>} />

      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-10" placeholder="Pesquisar por código ou cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input sm:w-48" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">Todos os status</option>
            {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={<FileText className="h-12 w-12" />} title="Nenhum orçamento encontrado" description="Crie orçamentos profissionais para seus clientes." action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Criar orçamento</button>} />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Código</th>
                <th className="px-4 py-3 font-medium">Cliente</th>
                <th className="px-4 py-3 font-medium hidden md:table-cell">Data</th>
                <th className="px-4 py-3 font-medium hidden sm:table-cell">Validade</th>
                <th className="px-4 py-3 font-medium">Total</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {filtered.map((b) => {
                const client = clients.find((c) => c.id === b.client_id);
                return (
                  <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-400">{b.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{client?.full_name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{formatDate(b.created_at)}</td>
                    <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{formatDate(b.valid_until)}</td>
                    <td className="px-4 py-3 font-semibold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(b.total)}</td>
                    <td className="px-4 py-3"><span className={`badge ${statusBadge[b.status]}`}>{statusLabels[b.status]}</span></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openView(b)} className="btn-ghost" title="Visualizar"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => openEdit(b)} className="btn-ghost" title="Editar"><FileText className="h-4 w-4" /></button>
                        {b.status === 'aguardando' || b.status === 'enviado' ? (
                          <>
                            <button onClick={() => changeStatus(b, 'aprovado')} className="btn-ghost text-green-600" title="Aprovar"><CheckCircle className="h-4 w-4" /></button>
                            <button onClick={() => changeStatus(b, 'recusado')} className="btn-ghost text-red-500" title="Recusar"><XCircle className="h-4 w-4" /></button>
                          </>
                        ) : null}
                        <button onClick={() => setDeleteTarget(b)} className="btn-ghost text-red-500" title="Excluir"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? 'Editar orçamento' : 'Novo orçamento'} size="xl">
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div><label className="label">Código</label><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><label className="label">Cliente *</label><ClientSearchSelect clients={clients} value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id ?? '' })} required onClientCreated={(c) => setClients((prev) => [...prev, c])} /></div>
            <div><label className="label">Validade</label><input type="date" className="input" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">Itens do orçamento</h4>
              <div className="flex gap-2">
                <button onClick={() => setQuickServiceModal(true)} className="btn-ghost text-xs"><Plus className="h-3 w-3" /> Novo serviço</button>
                <button onClick={addItem} className="btn-ghost text-xs"><Plus className="h-3 w-3" /> Adicionar item</button>
              </div>
            </div>
            <div className="space-y-3">
              {items.map((item, idx) => (
                <div key={item.id} className="card p-3 bg-slate-50 dark:bg-slate-800/50">
                  <div className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-12 sm:col-span-4">
                      <label className="label text-xs">Serviço {idx + 1}</label>
                      <select className="input text-sm" value={item.is_custom ? 'custom' : (item.service_id ?? '')} onChange={(e) => selectService(item.id, e.target.value)}>
                        <option value="">Selecione...</option>
                        {services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)}</option>)}
                        <option value="custom">Serviço avulso</option>
                      </select>
                    </div>
                    <div className="col-span-12 sm:col-span-2"><label className="label text-xs">Qtd</label><input type="number" step="0.01" className="input text-sm" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-12 sm:col-span-2"><label className="label text-xs">Valor unit.</label><input type="number" step="0.01" className="input text-sm" value={item.unit_price} onChange={(e) => updateItem(item.id, { unit_price: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-6 sm:col-span-1"><label className="label text-xs">Desc.</label><input type="number" step="0.01" className="input text-sm" value={item.discount} onChange={(e) => updateItem(item.id, { discount: parseFloat(e.target.value) || 0 })} /></div>
                    <div className="col-span-4 sm:col-span-2"><label className="label text-xs">Subtotal</label><p className="text-sm font-semibold pt-2.5" style={{ color: 'var(--color-primary)' }}>{formatCurrency(item.subtotal)}</p></div>
                    <div className="col-span-2 sm:col-span-1 flex justify-end">
                      <button onClick={() => removeItem(item.id)} className="btn-ghost text-red-500 mb-2"><Trash className="h-4 w-4" /></button>
                    </div>
                    {item.is_custom && (
                      <div className="col-span-12 sm:col-span-6"><input className="input text-sm" placeholder="Nome do serviço avulso" value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} /></div>
                    )}
                    <div className="col-span-12 sm:col-span-6"><input className="input text-sm" placeholder="Descrição (opcional)" value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="card p-4 bg-slate-50 dark:bg-slate-800/50">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Resumo financeiro</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal:</span><span className="font-medium">{formatCurrency(itemsSubtotal)}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500">Desconto geral:</span><input type="number" step="0.01" className="input w-32 text-sm" value={form.general_discount} onChange={(e) => setForm({ ...form, general_discount: parseFloat(e.target.value) || 0 })} /></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="font-semibold text-slate-700 dark:text-slate-300">Total:</span><span className="font-bold text-lg" style={{ color: 'var(--color-primary)' }}>{formatCurrency(total)}</span></div>
                <div className="flex justify-between items-center"><span className="text-slate-500">Sinal:</span><input type="number" step="0.01" className="input w-32 text-sm" value={form.deposit} onChange={(e) => setForm({ ...form, deposit: parseFloat(e.target.value) || 0 })} /></div>
                <div className="flex justify-between"><span className="text-slate-500">Saldo restante:</span><span className="font-medium">{formatCurrency(balance)}</span></div>
              </div>
            </div>
            <div className="space-y-4">
              <div><label className="label">Condições de pagamento</label><input className="input" placeholder="Ex: 50% sinal + 3x sem juros" value={form.payment_conditions} onChange={(e) => setForm({ ...form, payment_conditions: e.target.value })} /></div>
              <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></div>
              <div><label className="label">Modelo visual</label><select className="input" value={form.template_style} onChange={(e) => setForm({ ...form, template_style: e.target.value })}><option value="simples">Simples</option><option value="premium">Premium</option><option value="detalhado">Detalhado</option></select></div>
              <div><label className="label">Campanha (opcional)</label><select className="input" value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}><option value="">Sem campanha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              {editingId && <div><label className="label">Status</label><select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : (editingId ? 'Salvar alterações' : 'Criar orçamento')}</button>
        </div>
      </Modal>

      {/* View Modal */}
      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title={`Orçamento ${viewTarget?.code ?? ''}`} size="lg">
        {viewTarget && (
          <div className="space-y-4">
            <div className="card p-6 print:shadow-none" id="printable-budget">
              <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-700 pb-4 mb-4">
                <div>
                  {settings.logo_url && <img src={settings.logo_url} alt="logo" className="h-12 mb-2" />}
                  <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{settings.studio_name}</h2>
                  {settings.address && <p className="text-xs text-slate-400">{settings.address}</p>}
                  {settings.phone && <p className="text-xs text-slate-400">{settings.phone} · {settings.email}</p>}
                </div>
                <div className="text-right">
                  <h3 className="text-lg font-semibold" style={{ color: 'var(--color-primary)' }}>ORÇAMENTO</h3>
                  <p className="text-sm text-slate-500">{viewTarget.code}</p>
                  <p className="text-xs text-slate-400">{formatDate(viewTarget.created_at)}</p>
                  <p className="text-xs text-slate-400">Validade: {formatDate(viewTarget.valid_until)}</p>
                </div>
              </div>
              <div className="mb-4">
                <p className="text-xs text-slate-400 uppercase">Cliente</p>
                <p className="font-medium text-slate-900 dark:text-slate-100">{viewClient?.full_name ?? '—'}</p>
                {viewClient?.phone && <p className="text-sm text-slate-500">{viewClient.phone}</p>}
                {viewClient?.email && <p className="text-sm text-slate-500">{viewClient.email}</p>}
              </div>
              <table className="w-full text-sm mb-4">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                  <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-center">Qtd</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Desc.</th><th className="px-3 py-2 text-right">Subtotal</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {viewItems.map((it) => (
                    <tr key={it.id}>
                      <td className="px-3 py-2"><p className="font-medium text-slate-800 dark:text-slate-200">{it.name}</p>{it.description && <p className="text-xs text-slate-400">{it.description}</p>}</td>
                      <td className="px-3 py-2 text-center">{it.quantity}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(it.unit_price)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(it.discount)}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(it.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end">
                <div className="w-full sm:w-64 space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-slate-500">Subtotal:</span><span>{formatCurrency(viewTarget.subtotal)}</span></div>
                  {viewTarget.general_discount > 0 && <div className="flex justify-between"><span className="text-slate-500">Desconto:</span><span>-{formatCurrency(viewTarget.general_discount)}</span></div>}
                  <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2 text-base"><span className="font-bold">Total:</span><span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(viewTarget.total)}</span></div>
                  {viewTarget.deposit > 0 && <div className="flex justify-between"><span className="text-slate-500">Sinal:</span><span>{formatCurrency(viewTarget.deposit)}</span></div>}
                  {viewTarget.balance > 0 && <div className="flex justify-between"><span className="text-slate-500">Saldo:</span><span>{formatCurrency(viewTarget.balance)}</span></div>}
                </div>
              </div>
              {viewTarget.payment_conditions && <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400 uppercase">Condições de pagamento</p><p className="text-sm text-slate-700 dark:text-slate-300">{viewTarget.payment_conditions}</p></div>}
              {viewTarget.observations && <div className="mt-3"><p className="text-xs text-slate-400 uppercase">Observações</p><p className="text-sm text-slate-700 dark:text-slate-300">{viewTarget.observations}</p></div>}
              {settings.cancellation_rules && <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400 uppercase">Termos de cancelamento</p><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{settings.cancellation_rules}</p></div>}
              {settings.reschedule_rules && <div className="mt-3"><p className="text-xs text-slate-400 uppercase">Termos de reagendamento</p><p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{settings.reschedule_rules}</p></div>}
              <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between">
                <div><p className="text-xs text-slate-400">Assinatura do estúdio</p><div className="mt-8 w-48 border-t border-slate-300" /></div>
                <div><p className="text-xs text-slate-400">Assinatura do cliente</p><div className="mt-8 w-48 border-t border-slate-300" /></div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={printBudget} className="btn-secondary"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
              <button onClick={sendBudgetWhatsapp} className="btn-secondary" style={{ color: '#16a34a' }}><MessageCircle className="h-4 w-4" /> Enviar via WhatsApp</button>
              {viewTarget.status !== 'aprovado' && viewTarget.status !== 'recusado' && viewTarget.status !== 'cancelado' && (
                <button onClick={() => { changeStatus(viewTarget, 'aprovado'); setViewTarget(null); }} className="btn-primary"><CheckCircle className="h-4 w-4" /> Aprovar orçamento</button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Quick service modal */}
      <Modal open={quickServiceModal} onClose={() => setQuickServiceModal(false)} title="Cadastro rápido de serviço" size="sm">
        <div className="space-y-4">
          <div><label className="label">Nome do serviço *</label><input className="input" value={quickServiceForm.name} onChange={(e) => setQuickServiceForm({ ...quickServiceForm, name: e.target.value })} /></div>
          <div><label className="label">Preço (R$)</label><input type="number" step="0.01" className="input" value={quickServiceForm.price} onChange={(e) => setQuickServiceForm({ ...quickServiceForm, price: parseFloat(e.target.value) || 0 })} /></div>
          <div className="flex justify-end gap-3"><button onClick={() => setQuickServiceModal(false)} className="btn-secondary">Cancelar</button><button onClick={quickAddService} className="btn-primary">Cadastrar e adicionar</button></div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir orçamento" message={`Confirma a exclusão do orçamento ${deleteTarget?.code}?`} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
