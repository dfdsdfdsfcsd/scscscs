import { useEffect, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, todayISO } from '@/lib/utils';
import { Plus, Pencil, Trash2, Percent, DollarSign, Users, TrendingUp, CheckCircle, Clock, BarChart3 } from 'lucide-react';
import type { CommissionRule, Commission, Service, ServiceOrder, Budget, Professional } from '@/lib/types';

type Tab = 'rules' | 'commissions' | 'report';

const statusLabels: Record<string, string> = {
  prevista: 'Prevista',
  devida: 'Devida',
  paga: 'Paga',
  cancelada: 'Cancelada',
};

const statusBadge: Record<string, string> = {
  prevista: 'badge-warning',
  devida: 'badge-neutral',
  paga: 'badge-success',
  cancelada: 'badge-danger',
};

export function CommissionsPage() {
  const [tab, setTab] = useState<Tab>('rules');
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);
  const [deleteRule, setDeleteRule] = useState<CommissionRule | null>(null);
  const [commissionModal, setCommissionModal] = useState(false);
  const [editingCommission, setEditingCommission] = useState<Commission | null>(null);
  const [payCommission, setPayCommission] = useState<Commission | null>(null);
  const [reportFilter, setReportFilter] = useState<string>('all');

  const [ruleForm, setRuleForm] = useState({
    name: '', service_id: '', professional_id: '', partner: '',
    rule_type: 'percent', value: 0, base: 'gross',
    is_active: true, effective_from: todayISO(), effective_to: '',
  });

  const [commissionForm, setCommissionForm] = useState({
    commission_rule_id: '', service_order_id: '', budget_id: '',
    service_id: '', professional_id: '', partner: '', description: '',
    base_value: 0, rule_type_snapshot: 'percent', value_snapshot: 0,
    base_snapshot: 'gross', estimated_amount: 0, due_amount: 0,
    status: 'prevista' as string, paid_date: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [rulesRes, commissionsRes, servicesRes, ordersRes, budgetsRes, profRes] = await Promise.all([
      supabase.from('commission_rules').select('*').order('created_at', { ascending: false }),
      supabase.from('commissions').select('*').order('created_at', { ascending: false }),
      supabase.from('services').select('*').order('name'),
      supabase.from('service_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('budgets').select('*').order('created_at', { ascending: false }),
      supabase.from('professionals').select('*').order('name'),
    ]);
    setRules((rulesRes.data as CommissionRule[]) ?? []);
    setCommissions((commissionsRes.data as Commission[]) ?? []);
    setServices((servicesRes.data as Service[]) ?? []);
    setOrders((ordersRes.data as ServiceOrder[]) ?? []);
    setBudgets((budgetsRes.data as Budget[]) ?? []);
    setProfessionals((profRes.data as Professional[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const profName = (id: string | null, fallback: string | null) => {
    if (id) { const p = professionals.find(p => p.id === id); if (p) return p.name; }
    return fallback ?? '—';
  };

  const openNewRule = () => {
    setEditingRule(null);
    setRuleForm({ name: '', service_id: '', professional_id: '', partner: '', rule_type: 'percent', value: 0, base: 'gross', is_active: true, effective_from: todayISO(), effective_to: '' });
    setModalOpen(true);
  };

  const openEditRule = (r: CommissionRule) => {
    setEditingRule(r);
    setRuleForm({
      name: r.name, service_id: r.service_id ?? '', professional_id: r.professional_id ?? '',
      partner: r.partner ?? '', rule_type: r.rule_type, value: r.value, base: r.base,
      is_active: r.is_active, effective_from: r.effective_from, effective_to: r.effective_to ?? '',
    });
    setModalOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleForm.name) { toast('Informe o nome da regra', 'warning'); return; }
    const prof = professionals.find(p => p.id === ruleForm.professional_id);
    const payload = {
      name: ruleForm.name,
      service_id: ruleForm.service_id || null,
      professional_id: ruleForm.professional_id || null,
      professional: prof?.name ?? null,
      partner: ruleForm.partner || null,
      rule_type: ruleForm.rule_type,
      value: ruleForm.value,
      base: ruleForm.base,
      is_active: ruleForm.is_active,
      effective_from: ruleForm.effective_from,
      effective_to: ruleForm.effective_to || null,
      updated_at: new Date().toISOString(),
    };
    if (editingRule) {
      const { error } = await supabase.from('commission_rules').update(payload).eq('id', editingRule.id);
      if (error) { toast('Erro ao atualizar regra', 'error'); return; }
      toast('Regra atualizada', 'success');
    } else {
      const { error } = await supabase.from('commission_rules').insert(payload);
      if (error) { toast('Erro ao criar regra', 'error'); return; }
      toast('Regra criada', 'success');
    }
    setModalOpen(false);
    load();
  };

  const handleDeleteRule = async () => {
    if (!deleteRule) return;
    await supabase.from('commission_rules').delete().eq('id', deleteRule.id);
    toast('Regra excluída', 'success');
    setDeleteRule(null);
    load();
  };

  const calcEstimated = () => {
    const base = commissionForm.base_value;
    if (commissionForm.rule_type_snapshot === 'percent') {
      return Math.round(base * commissionForm.value_snapshot) / 100;
    }
    return commissionForm.value_snapshot;
  };

  const openNewCommission = () => {
    setEditingCommission(null);
    setCommissionForm({
      commission_rule_id: '', service_order_id: '', budget_id: '',
      service_id: '', professional_id: '', partner: '', description: '',
      base_value: 0, rule_type_snapshot: 'percent', value_snapshot: 0,
      base_snapshot: 'gross', estimated_amount: 0, due_amount: 0,
      status: 'prevista', paid_date: '',
    });
    setCommissionModal(true);
  };

  const openEditCommission = (c: Commission) => {
    setEditingCommission(c);
    setCommissionForm({
      commission_rule_id: c.commission_rule_id ?? '', service_order_id: c.service_order_id ?? '',
      budget_id: c.budget_id ?? '', service_id: c.service_id ?? '',
      professional_id: c.professional_id ?? '', partner: c.partner ?? '',
      description: c.description, base_value: c.base_value,
      rule_type_snapshot: c.rule_type_snapshot, value_snapshot: c.value_snapshot,
      base_snapshot: c.base_snapshot, estimated_amount: c.estimated_amount,
      due_amount: c.due_amount, status: c.status, paid_date: c.paid_date ?? '',
    });
    setCommissionModal(true);
  };

  const handleSaveCommission = async () => {
    if (!commissionForm.description) { toast('Informe uma descrição', 'warning'); return; }
    const est = calcEstimated();
    const prof = professionals.find(p => p.id === commissionForm.professional_id);
    const payload = {
      commission_rule_id: commissionForm.commission_rule_id || null,
      service_order_id: commissionForm.service_order_id || null,
      budget_id: commissionForm.budget_id || null,
      service_id: commissionForm.service_id || null,
      professional_id: commissionForm.professional_id || null,
      professional: prof?.name ?? null,
      partner: commissionForm.partner || null,
      description: commissionForm.description,
      base_value: commissionForm.base_value,
      rule_type_snapshot: commissionForm.rule_type_snapshot,
      value_snapshot: commissionForm.value_snapshot,
      base_snapshot: commissionForm.base_snapshot,
      estimated_amount: est,
      due_amount: commissionForm.due_amount,
      status: commissionForm.status,
      paid_date: commissionForm.paid_date || null,
      updated_at: new Date().toISOString(),
    };
    if (editingCommission) {
      const { error } = await supabase.from('commissions').update(payload).eq('id', editingCommission.id);
      if (error) { toast('Erro ao atualizar comissão', 'error'); return; }
      toast('Comissão atualizada', 'success');
    } else {
      const { error } = await supabase.from('commissions').insert(payload);
      if (error) { toast('Erro ao criar comissão', 'error'); return; }
      toast('Comissão criada', 'success');
    }
    setCommissionModal(false);
    load();
  };

  const handlePayCommission = async () => {
    if (!payCommission) return;
    const { error } = await supabase.from('commissions').update({
      status: 'paga', paid_date: todayISO(), updated_at: new Date().toISOString(),
    }).eq('id', payCommission.id);
    if (error) { toast('Erro ao registrar pagamento', 'error'); return; }
    toast('Comissão marcada como paga', 'success');
    setPayCommission(null);
    load();
  };

  const handleApplyRule = (rule: CommissionRule) => {
    setEditingCommission(null);
    setCommissionForm({
      commission_rule_id: rule.id, service_order_id: '', budget_id: '',
      service_id: rule.service_id ?? '', professional_id: rule.professional_id ?? '',
      partner: rule.partner ?? '', description: rule.name,
      base_value: 0, rule_type_snapshot: rule.rule_type, value_snapshot: rule.value,
      base_snapshot: rule.base, estimated_amount: 0, due_amount: 0,
      status: 'prevista', paid_date: '',
    });
    setCommissionModal(true);
  };

  const totalEstimated = commissions.filter(c => c.status !== 'cancelada' && c.status !== 'paga').reduce((s, c) => s + c.estimated_amount, 0);
  const totalDue = commissions.filter(c => c.status === 'devida').reduce((s, c) => s + c.due_amount, 0);
  const totalPaid = commissions.filter(c => c.status === 'paga').reduce((s, c) => s + (c.due_amount > 0 ? c.due_amount : c.estimated_amount), 0);
  const pendingCount = commissions.filter(c => c.status === 'prevista' || c.status === 'devida').length;

  // Report by professional
  const reportData = useMemo(() => {
    const activeCommissions = commissions.filter(c => c.status !== 'cancelada');
    const profMap = new Map<string, { professional: Professional | null; estimated: number; due: number; paid: number; count: number }>();

    for (const c of activeCommissions) {
      const key = c.professional_id ?? `_text:${c.professional ?? '_sem_profissional'}`;
      if (!profMap.has(key)) {
        const prof = c.professional_id ? professionals.find(p => p.id === c.professional_id) ?? null : null;
        profMap.set(key, { professional: prof, estimated: 0, due: 0, paid: 0, count: 0 });
      }
      const entry = profMap.get(key)!;
      entry.count++;
      if (c.status === 'paga') {
        entry.paid += c.due_amount > 0 ? c.due_amount : c.estimated_amount;
      } else if (c.status === 'devida') {
        entry.due += c.due_amount > 0 ? c.due_amount : c.estimated_amount;
      } else {
        entry.estimated += c.estimated_amount;
      }
    }

    let rows = Array.from(profMap.values());
    if (reportFilter !== 'all') {
      rows = rows.filter(r => r.professional?.id === reportFilter);
    }
    rows.sort((a, b) => (b.estimated + b.due + b.paid) - (a.estimated + a.due + a.paid));
    return rows;
  }, [commissions, professionals, reportFilter]);

  const tabs: { id: Tab; label: string; icon: typeof Percent }[] = [
    { id: 'rules', label: 'Regras de comissão', icon: Percent },
    { id: 'commissions', label: 'Comissões registradas', icon: DollarSign },
    { id: 'report', label: 'Relatório por profissional', icon: BarChart3 },
  ];

  return (
    <div>
      <PageHeader title="Comissões" subtitle="Regras de comissão por serviço, profissional ou parceiro" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5"><div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-500" /><p className="text-sm text-slate-400">Previsto</p></div><p className="text-2xl font-bold mt-1 text-amber-600">{formatCurrency(totalEstimated)}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><Clock className="h-4 w-4 text-orange-500" /><p className="text-sm text-slate-400">Devido</p></div><p className="text-2xl font-bold mt-1 text-orange-600">{formatCurrency(totalDue)}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" /><p className="text-sm text-slate-400">Pago</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(totalPaid)}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><Users className="h-4 w-4 text-sky-500" /><p className="text-sm text-slate-400">Pendentes</p></div><p className="text-2xl font-bold mt-1 text-sky-600">{pendingCount}</p></div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 border-transparent'}`} style={tab === t.id ? { borderColor: 'var(--color-primary)' } : { borderColor: 'transparent' }}>
            <Icon className="h-4 w-4" /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="py-20 text-center text-slate-400">Carregando...</div> : (
        <>
          {tab === 'rules' && (
            <div>
              <div className="flex justify-end mb-4"><button onClick={openNewRule} className="btn-primary"><Plus className="h-4 w-4" /> Nova regra</button></div>
              {rules.length === 0 ? (
                <div className="card p-8 text-center text-slate-400">
                  <p className="text-sm">Nenhuma regra de comissão cadastrada.</p>
                  <p className="text-xs mt-1">Crie regras percentuais ou de valor fixo por serviço, profissional ou parceiro.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {rules.map((r) => {
                    const service = services.find(s => s.id === r.service_id);
                    const profNameDisplay = profName(r.professional_id, r.professional);
                    return (
                      <div key={r.id} className={`card p-4 ${!r.is_active ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</p>
                              <span className={`badge ${r.is_active ? 'badge-success' : 'badge-neutral'}`}>{r.is_active ? 'Ativa' : 'Inativa'}</span>
                              {r.rule_type === 'percent' ? (
                                <span className="badge badge-warning"><Percent className="h-3 w-3" /> {r.value}%</span>
                              ) : (
                                <span className="badge badge-warning"><DollarSign className="h-3 w-3" /> {formatCurrency(r.value)}</span>
                              )}
                              <span className="text-xs text-slate-400">Base: {r.base === 'gross' ? 'Bruto' : 'Líquido'}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                              {service && <span>Serviço: {service.name}</span>}
                              {(r.professional_id || r.professional) && <span>Profissional: {profNameDisplay}</span>}
                              {r.partner && <span>Parceiro: {r.partner}</span>}
                              <span>Vigência: {formatDate(r.effective_from)} {r.effective_to ? `até ${formatDate(r.effective_to)}` : 'em diante'}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => handleApplyRule(r)} className="btn-ghost text-xs text-emerald-600" title="Aplicar regra (criar comissão)">Aplicar</button>
                            <button onClick={() => openEditRule(r)} className="btn-ghost"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteRule(r)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="card p-4 mt-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                <p className="text-xs text-amber-700 dark:text-amber-300">Alterações em regras não recalcular comissões já registradas. Cada comissão guarda o snapshot da regra no momento da criação.</p>
              </div>
            </div>
          )}

          {tab === 'commissions' && (
            <div>
              <div className="flex justify-end mb-4"><button onClick={openNewCommission} className="btn-primary"><Plus className="h-4 w-4" /> Nova comissão</button></div>
              {commissions.length === 0 ? (
                <div className="card p-8 text-center text-slate-400"><p className="text-sm">Nenhuma comissão registrada.</p></div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                      <tr>
                        <th className="px-4 py-3">Descrição</th>
                        <th className="px-4 py-3 hidden md:table-cell">Profissional/Parceiro</th>
                        <th className="px-4 py-3 text-right">Base</th>
                        <th className="px-4 py-3 text-right">Previsto</th>
                        <th className="px-4 py-3 text-right">Devido</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {commissions.map((c) => {
                        const order = orders.find(o => o.id === c.service_order_id);
                        const budget = budgets.find(b => b.id === c.budget_id);
                        const profDisplay = profName(c.professional_id, c.professional);
                        return (
                          <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3">
                              <p className="font-medium text-slate-900 dark:text-slate-100">{c.description}</p>
                              <p className="text-xs text-slate-400">
                                {order && `OS ${order.code}`}
                                {budget && `Orçamento ${budget.code}`}
                                {!order && !budget && 'Manual'}
                                {c.rule_type_snapshot === 'percent' ? ` · ${c.value_snapshot}%` : ` · ${formatCurrency(c.value_snapshot)}`}
                              </p>
                            </td>
                            <td className="px-4 py-3 text-slate-500 hidden md:table-cell">
                              {profDisplay}{c.partner ? ` / ${c.partner}` : ''}
                            </td>
                            <td className="px-4 py-3 text-right">{formatCurrency(c.base_value)}</td>
                            <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrency(c.estimated_amount)}</td>
                            <td className="px-4 py-3 text-right font-medium">{c.due_amount > 0 ? formatCurrency(c.due_amount) : '—'}</td>
                            <td className="px-4 py-3"><span className={`badge ${statusBadge[c.status] ?? 'badge-neutral'}`}>{statusLabels[c.status] ?? c.status}</span></td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {(c.status === 'prevista' || c.status === 'devida') && (
                                  <button onClick={() => setPayCommission(c)} className="btn-ghost text-emerald-600" title="Marcar como paga"><CheckCircle className="h-4 w-4" /></button>
                                )}
                                <button onClick={() => openEditCommission(c)} className="btn-ghost"><Pencil className="h-4 w-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {tab === 'report' && (
            <div>
              <div className="flex items-center justify-between gap-4 mb-4">
                <select className="input max-w-xs" value={reportFilter} onChange={(e) => setReportFilter(e.target.value)}>
                  <option value="all">Todos os profissionais</option>
                  {professionals.filter(p => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              {reportData.length === 0 ? (
                <div className="card p-8 text-center text-slate-400"><BarChart3 className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhuma comissão para exibir no relatório.</p></div>
              ) : (
                <>
                  <div className="card overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                        <tr>
                          <th className="px-4 py-3">Profissional</th>
                          <th className="px-4 py-3 hidden md:table-cell">Função</th>
                          <th className="px-4 py-3 text-right">Comissões</th>
                          <th className="px-4 py-3 text-right">Previsto</th>
                          <th className="px-4 py-3 text-right">Devido</th>
                          <th className="px-4 py-3 text-right">Pago</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {reportData.map((row, idx) => {
                          const name = row.professional?.name ?? 'Sem profissional';
                          const role = row.professional?.role ?? '—';
                          const total = row.estimated + row.due + row.paid;
                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{name}</td>
                              <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{role}</td>
                              <td className="px-4 py-3 text-right text-slate-400">{row.count}</td>
                              <td className="px-4 py-3 text-right font-medium text-amber-600">{formatCurrency(row.estimated)}</td>
                              <td className="px-4 py-3 text-right font-medium text-orange-600">{formatCurrency(row.due)}</td>
                              <td className="px-4 py-3 text-right font-medium text-emerald-600">{formatCurrency(row.paid)}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100">{formatCurrency(total)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-semibold">
                        <tr>
                          <td className="px-4 py-3" colSpan={2}>Total geral</td>
                          <td className="px-4 py-3 text-right">{reportData.reduce((s, r) => s + r.count, 0)}</td>
                          <td className="px-4 py-3 text-right text-amber-600">{formatCurrency(reportData.reduce((s, r) => s + r.estimated, 0))}</td>
                          <td className="px-4 py-3 text-right text-orange-600">{formatCurrency(reportData.reduce((s, r) => s + r.due, 0))}</td>
                          <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(reportData.reduce((s, r) => s + r.paid, 0))}</td>
                          <td className="px-4 py-3 text-right">{formatCurrency(reportData.reduce((s, r) => s + r.estimated + r.due + r.paid, 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
                    {reportData.map((row, idx) => {
                      const name = row.professional?.name ?? 'Sem profissional';
                      const total = row.estimated + row.due + row.paid;
                      const paidPct = total > 0 ? Math.round((row.paid / total) * 100) : 0;
                      return (
                        <div key={idx} className="card p-4">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{name}</p>
                          {row.professional?.role && <p className="text-xs text-slate-400">{row.professional.role}</p>}
                          <div className="mt-3 flex items-center justify-between text-sm">
                            <span className="text-slate-400">Pago</span>
                            <span className="font-medium text-emerald-600">{formatCurrency(row.paid)}</span>
                          </div>
                          <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${paidPct}%` }} />
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                            <span>Previsto: {formatCurrency(row.estimated)}</span>
                            <span>Devido: {formatCurrency(row.due)}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {/* Rule modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingRule ? 'Editar regra' : 'Nova regra de comissão'} size="md">
        <div className="space-y-4">
          <div><label className="label">Nome da regra *</label><input className="input" placeholder="Ex: 10% fotógrafo parceiro" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} /></div>
          <div><label className="label">Serviço (opcional — vazio = todos)</label><select className="input" value={ruleForm.service_id} onChange={(e) => setRuleForm({ ...ruleForm, service_id: e.target.value })}><option value="">Todos os serviços</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Profissional</label><select className="input" value={ruleForm.professional_id} onChange={(e) => setRuleForm({ ...ruleForm, professional_id: e.target.value })}><option value="">Sem profissional</option>{professionals.filter(p => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</option>)}</select></div>
            <div><label className="label">Parceiro</label><input className="input" placeholder="Nome ou empresa" value={ruleForm.partner} onChange={(e) => setRuleForm({ ...ruleForm, partner: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Tipo</label><select className="input" value={ruleForm.rule_type} onChange={(e) => setRuleForm({ ...ruleForm, rule_type: e.target.value })}><option value="percent">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></select></div>
            <div><label className="label">Valor</label><input type="number" step="0.01" className="input" value={ruleForm.value} onChange={(e) => setRuleForm({ ...ruleForm, value: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div><label className="label">Base de cálculo</label><select className="input" value={ruleForm.base} onChange={(e) => setRuleForm({ ...ruleForm, base: e.target.value })}><option value="gross">Valor bruto</option><option value="net">Valor líquido (após descontos)</option></select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Vigência a partir de</label><input type="date" className="input" value={ruleForm.effective_from} onChange={(e) => setRuleForm({ ...ruleForm, effective_from: e.target.value })} /></div>
            <div><label className="label">Até (opcional)</label><input type="date" className="input" value={ruleForm.effective_to} onChange={(e) => setRuleForm({ ...ruleForm, effective_to: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={ruleForm.is_active} onChange={(e) => setRuleForm({ ...ruleForm, is_active: e.target.checked })} /> Regra ativa</label>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveRule} className="btn-primary">{editingRule ? 'Salvar' : 'Criar regra'}</button></div>
      </Modal>

      {/* Commission modal */}
      <Modal open={commissionModal} onClose={() => setCommissionModal(false)} title={editingCommission ? 'Editar comissão' : 'Nova comissão'} size="md">
        <div className="space-y-4">
          <div><label className="label">Descrição *</label><input className="input" value={commissionForm.description} onChange={(e) => setCommissionForm({ ...commissionForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Profissional</label><select className="input" value={commissionForm.professional_id} onChange={(e) => setCommissionForm({ ...commissionForm, professional_id: e.target.value })}><option value="">Sem profissional</option>{professionals.filter(p => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name}{p.role ? ` — ${p.role}` : ''}</option>)}</select></div>
            <div><label className="label">Parceiro</label><input className="input" value={commissionForm.partner} onChange={(e) => setCommissionForm({ ...commissionForm, partner: e.target.value })} /></div>
          </div>
          <div><label className="label">Ordem de serviço (opcional)</label><select className="input" value={commissionForm.service_order_id} onChange={(e) => setCommissionForm({ ...commissionForm, service_order_id: e.target.value })}><option value="">Sem ordem</option>{orders.map((o) => <option key={o.id} value={o.id}>{o.code} — {o.title}</option>)}</select></div>
          <div><label className="label">Orçamento (opcional)</label><select className="input" value={commissionForm.budget_id} onChange={(e) => setCommissionForm({ ...commissionForm, budget_id: e.target.value })}><option value="">Sem orçamento</option>{budgets.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Tipo</label><select className="input" value={commissionForm.rule_type_snapshot} onChange={(e) => setCommissionForm({ ...commissionForm, rule_type_snapshot: e.target.value, estimated_amount: 0 })}><option value="percent">Percentual (%)</option><option value="fixed">Valor fixo (R$)</option></select></div>
            <div><label className="label">Valor</label><input type="number" step="0.01" className="input" value={commissionForm.value_snapshot} onChange={(e) => setCommissionForm({ ...commissionForm, value_snapshot: parseFloat(e.target.value) || 0 })} /></div>
          </div>
          <div><label className="label">Base de cálculo (R$)</label><input type="number" step="0.01" className="input" value={commissionForm.base_value} onChange={(e) => setCommissionForm({ ...commissionForm, base_value: parseFloat(e.target.value) || 0 })} /></div>
          <div className="card p-3 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between"><span className="text-sm text-slate-500">Valor previsto:</span><span className="text-lg font-bold text-amber-600">{formatCurrency(commissionForm.rule_type_snapshot === 'percent' ? Math.round(commissionForm.base_value * commissionForm.value_snapshot) / 100 : commissionForm.value_snapshot)}</span></div>
          {editingCommission && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Valor devido (R$)</label><input type="number" step="0.01" className="input" value={commissionForm.due_amount} onChange={(e) => setCommissionForm({ ...commissionForm, due_amount: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="label">Status</label><select className="input" value={commissionForm.status} onChange={(e) => setCommissionForm({ ...commissionForm, status: e.target.value })}>{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              {commissionForm.status === 'paga' && <div><label className="label">Data de pagamento</label><input type="date" className="input" value={commissionForm.paid_date} onChange={(e) => setCommissionForm({ ...commissionForm, paid_date: e.target.value })} /></div>}
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setCommissionModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveCommission} className="btn-primary">{editingCommission ? 'Salvar' : 'Criar comissão'}</button></div>
      </Modal>

      <ConfirmDialog open={!!payCommission} title="Marcar comissão como paga" message="Confirma o pagamento desta comissão?" onConfirm={handlePayCommission} onCancel={() => setPayCommission(null)} />
      <ConfirmDialog open={!!deleteRule} title="Excluir regra" message="Confirma a exclusão desta regra? Comissões já registradas não serão afetadas." onConfirm={handleDeleteRule} onCancel={() => setDeleteRule(null)} />
    </div>
  );
}
