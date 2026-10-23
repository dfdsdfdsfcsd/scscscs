import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, getMonthBounds, todayISO, toLocalISODate } from '@/lib/utils';
import { buildReportPeriodData, buildServiceComparison, round2 } from '@/lib/pricing';
import { buildPrintHTML, openPrintWindow, type PrintSettings } from '@/lib/printUtils';
import { Plus, Trash2, CircleCheck as CheckCircle, TrendingUp, TrendingDown, Wallet, Clock, Printer, ChartBar as BarChart3, ChevronLeft, ChevronRight, CalendarCheck, RotateCcw, Tag, CircleAlert as AlertCircle, FileDown } from 'lucide-react';
import type { FinancialEntry, FinancialExpense, Client, Budget, Service, MonthlyClosing, Campaign } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import { useSettings } from '@/context/SettingsContext';
import { useSaving } from '@/lib/useSaving';

type Tab = 'receivable' | 'payable' | 'summary' | 'closing';

const expenseCategories = ['Aluguel', 'Energia', 'Água', 'Internet', 'Materiais fotográficos', 'Impressões', 'Edição terceirizada', 'Comissões', 'Salários', 'Equipamentos', 'Manutenção', 'Impostos e taxas', 'Diversas'];

const entryCategories = ['Venda de serviço', 'Sinal recebido', 'Parcela recebida', 'Venda de produto', 'Serviço adicional', 'Outras receitas'];

export function FinancialPage() {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>('receivable');
  const [entries, setEntries] = useState<FinancialEntry[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [entryModal, setEntryModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<FinancialEntry | null>(null);
  const [deleteExpense, setDeleteExpense] = useState<FinancialExpense | null>(null);
  const [payEntry, setPayEntry] = useState<FinancialEntry | null>(null);
  const [payExpense, setPayExpense] = useState<FinancialExpense | null>(null);
  const [payAmount, setPayAmount] = useState(0);
  const [payDiscount, setPayDiscount] = useState(0);
  const [payDiscountReason, setPayDiscountReason] = useState('');
  const [reportMonth, setReportMonth] = useState(new Date());
  const [closings, setClosings] = useState<MonthlyClosing[]>([]);
  const [closingLoading, setClosingLoading] = useState(false);
  const [reviewForm, setReviewForm] = useState({ reviewed_by: '', discrepancies: '' });
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allBudgets, setAllBudgets] = useState<Budget[]>([]);
  const { saving: savingEntry, withSaving: withSavingEntry } = useSaving();
  const { saving: savingExpense, withSaving: withSavingExpense } = useSaving();
  const { saving: payingEntry, withSaving: withPayingEntry } = useSaving();
  const { saving: payingExpense, withSaving: withPayingExpense } = useSaving();

  const [entryForm, setEntryForm] = useState({
    client_id: '', budget_id: '', description: '', total_amount: 0, due_date: todayISO(),
    installment_number: 1, total_installments: 1, payment_method: 'Pix', category: 'Venda de serviço',
  });
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: 0, due_date: todayISO(), category: 'Diversas', supplier: '', payment_method: 'Pix',
    card_name: '', total_installments: 1, campaign_id: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const [entriesRes, expensesRes] = await Promise.all([
      supabase.from('financial_entries').select('*').order('due_date', { ascending: true }),
      supabase.from('financial_expenses').select('*').order('due_date', { ascending: true }),
    ]);
    setEntries((entriesRes.data as FinancialEntry[]) ?? []);
    setExpenses((expensesRes.data as FinancialExpense[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    (async () => { try { const { data, error } = await supabase.from('clients').select('*').order('full_name'); if (error) toast('Erro ao carregar clientes', 'error'); setClients((data as Client[]) ?? []); } catch { toast('Erro ao carregar clientes', 'error'); } })();
    (async () => { try { const { data } = await supabase.from('budgets').select('*').eq('status', 'aprovado').order('created_at', { ascending: false }); setBudgets((data as Budget[]) ?? []); } catch { /* ignore */ } })();
    (async () => { try { const { data } = await supabase.from('services').select('*'); setServices((data as Service[]) ?? []); } catch { /* ignore */ } })();
    (async () => { try { const { data } = await supabase.from('budgets').select('*').order('created_at', { ascending: false }); setAllBudgets((data as Budget[]) ?? []); } catch { /* ignore */ } })();
    (async () => { try { const { data } = await supabase.from('campaigns').select('*').order('name'); setCampaigns((data as Campaign[]) ?? []); } catch { /* ignore */ } })();
  }, [load]);

  const { start, end } = getMonthBounds(reportMonth);
  const monthEntries = entries.filter((e) => e.due_date >= start && e.due_date <= end);
  const monthExpenses = expenses.filter((e) => e.due_date >= start && e.due_date <= end);

  const last6Months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(reportMonth);
    d.setMonth(d.getMonth() - (5 - i));
    return d;
  });
  const monthlyData = last6Months.map((d) => {
    const { start: ms, end: me } = getMonthBounds(d);
    const rev = entries.filter((e) => e.due_date >= ms && e.due_date <= me && e.status === 'pago').reduce((s, e) => s + e.paid_amount, 0);
    const exp = expenses.filter((e) => e.due_date >= ms && e.due_date <= me && e.status === 'pago').reduce((s, e) => s + e.paid_amount, 0);
    return { label: d.toLocaleDateString('pt-BR', { month: 'short' }), revenue: rev, expenses: exp, result: rev - exp };
  });
  const maxMonthly = Math.max(...monthlyData.map((m) => Math.max(m.revenue, m.expenses)), 1);

  const categoryBreakdown = monthEntries.filter((e) => e.status === 'pago').reduce((acc, e) => {
    acc[e.category] = (acc[e.category] ?? 0) + e.paid_amount;
    return acc;
  }, {} as Record<string, number>);
  const totalCatRevenue = Object.values(categoryBreakdown).reduce((s, v) => s + v, 0);

  const totalReceivable = entries.filter((e) => e.status !== 'pago').reduce((s, e) => s + (e.total_amount - e.paid_amount), 0);
  const totalPayable = expenses.filter((e) => e.status !== 'pago').reduce((s, e) => s + (e.amount - e.paid_amount), 0);
  const monthRevenue = monthEntries.filter((e) => e.status === 'pago').reduce((s, e) => s + e.paid_amount, 0);
  const monthExpensesPaid = monthExpenses.filter((e) => e.status === 'pago').reduce((s, e) => s + e.paid_amount, 0);
  const monthResult = monthRevenue - monthExpensesPaid;
  const overdueEntries = entries.filter((e) => e.status !== 'pago' && e.due_date < todayISO());
  const overdueExpenses = expenses.filter((e) => e.status !== 'pago' && e.due_date < todayISO());

  const handleAddEntry = async () => {
    return withSavingEntry(async () => {
    if (!entryForm.description || entryForm.total_amount <= 0) { toast('Preencha descrição e valor', 'warning'); return; }
    const totalInstallments = Math.max(1, entryForm.total_installments);
    const installmentAmount = Math.round((entryForm.total_amount / totalInstallments) * 100) / 100;
    const lastInstallmentAmount = Math.round((entryForm.total_amount - installmentAmount * (totalInstallments - 1)) * 100) / 100;

    const baseDate = new Date(entryForm.due_date);
    const rows = Array.from({ length: totalInstallments }, (_, i) => {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      const dueDate = toLocalISODate(d);
      return {
        client_id: entryForm.client_id || null,
        budget_id: entryForm.budget_id || null,
        description: totalInstallments > 1 ? `${entryForm.description} (${i + 1}/${totalInstallments})` : entryForm.description,
        total_amount: i === totalInstallments - 1 ? lastInstallmentAmount : installmentAmount,
        paid_amount: 0,
        due_date: dueDate,
        installment_number: i + 1,
        total_installments: totalInstallments,
        payment_method: entryForm.payment_method,
        category: entryForm.category,
        status: 'pendente',
      };
    });

    const { error } = await supabase.from('financial_entries').insert(rows);
    if (error) { toast('Erro ao criar conta a receber', 'error'); return; }
    if (entryForm.client_id) await supabase.from('client_history').insert({ client_id: entryForm.client_id, event_type: 'financeiro', description: `Conta a receber criada: ${entryForm.description} - ${formatCurrency(entryForm.total_amount)}${totalInstallments > 1 ? ` em ${totalInstallments}x` : ''}` });
    toast(totalInstallments > 1 ? `${totalInstallments} parcelas criadas` : 'Conta a receber criada', 'success');
    setEntryModal(false);
    setEntryForm({ client_id: '', budget_id: '', description: '', total_amount: 0, due_date: todayISO(), installment_number: 1, total_installments: 1, payment_method: 'Pix', category: 'Venda de serviço' });
    load();
    });
  };

  const handleAddExpense = async () => {
    return withSavingExpense(async () => {
    if (!expenseForm.description || expenseForm.amount <= 0) { toast('Preencha descrição e valor', 'warning'); return; }
    const totalInstallments = Math.max(1, expenseForm.total_installments);
    const installmentAmount = Math.round((expenseForm.amount / totalInstallments) * 100) / 100;
    const lastInstallmentAmount = Math.round((expenseForm.amount - installmentAmount * (totalInstallments - 1)) * 100) / 100;

    const baseDate = new Date(expenseForm.due_date);
    const rows = Array.from({ length: totalInstallments }, (_, i) => {
      const d = new Date(baseDate);
      d.setMonth(d.getMonth() + i);
      const dueDate = toLocalISODate(d);
      return {
        description: totalInstallments > 1 ? `${expenseForm.description} (${i + 1}/${totalInstallments})` : expenseForm.description,
        amount: i === totalInstallments - 1 ? lastInstallmentAmount : installmentAmount,
        paid_amount: 0,
        due_date: dueDate,
        category: expenseForm.category,
        supplier: expenseForm.supplier || null,
        payment_method: expenseForm.payment_method,
        status: 'pendente',
        card_name: expenseForm.card_name || null,
        total_installments: totalInstallments,
        installment_number: i + 1,
        campaign_id: expenseForm.campaign_id || null,
      };
    });

    const { data: inserted, error } = await supabase.from('financial_expenses').insert(rows).select('*');
    if (error || !inserted) { toast('Erro ao criar conta a pagar', 'error'); return; }
    if (totalInstallments > 1 && inserted.length > 0) {
      const parentId = (inserted[0] as FinancialExpense).id;
      await supabase.from('financial_expenses').update({ parent_expense_id: parentId }).in('id', inserted.map((r: FinancialExpense) => r.id).filter((id: string) => id !== parentId));
    }
    toast(totalInstallments > 1 ? `${totalInstallments} parcelas criadas (total ${formatCurrency(expenseForm.amount)})` : 'Conta a pagar criada', 'success');
    setExpenseModal(false);
    setExpenseForm({ description: '', amount: 0, due_date: todayISO(), category: 'Diversas', supplier: '', payment_method: 'Pix', card_name: '', total_installments: 1, campaign_id: '' });
    load();
    });
  };

  const handlePayEntry = async () => {
    return withPayingEntry(async () => {
    if (!payEntry || payAmount <= 0) return;
    const newPaid = Math.min(payEntry.paid_amount + payAmount, payEntry.total_amount - payEntry.discount_amount);
    const isPaid = newPaid >= (payEntry.total_amount - payEntry.discount_amount);
    const updateData: Record<string, unknown> = {
      paid_amount: newPaid,
      paid_date: isPaid ? todayISO() : payEntry.paid_date,
      status: isPaid ? 'pago' : 'pendente',
    };
    if (payDiscount > 0 && payDiscountReason.trim()) {
      updateData.discount_amount = payEntry.discount_amount + payDiscount;
      updateData.discount_reason = payDiscountReason.trim();
    }
    const { error, count } = await supabase.from('financial_entries').update(updateData).eq('id', payEntry.id).eq('paid_amount', payEntry.paid_amount);
    if (error) { toast('Erro ao registrar pagamento', 'error'); return; }
    if (count === 0) { toast('Outro pagamento foi registrado simultaneamente. Recarregando...', 'warning'); setPayEntry(null); setPayAmount(0); setPayDiscount(0); setPayDiscountReason(''); load(); return; }
    const { data: openReg } = await supabase.from('cash_registers').select('id').eq('status', 'aberto').maybeSingle();
    if (openReg) {
      await supabase.from('cash_transactions').insert({
        cash_register_id: (openReg as { id: string }).id,
        client_id: payEntry.client_id ?? null,
        type: 'entrada',
        category: 'recebimento_parcela',
        description: `Recebimento: ${payEntry.description}`,
        amount: payAmount,
        payment_method: payEntry.payment_method ?? 'Pix',
        financial_entry_id: payEntry.id,
      });
    }
    if (payEntry.client_id) await supabase.from('client_history').insert({ client_id: payEntry.client_id, event_type: 'pagamento', description: `Pagamento recebido: ${payEntry.description} - ${formatCurrency(payAmount)}` });
    toast('Pagamento registrado', 'success');
    setPayEntry(null); setPayAmount(0); setPayDiscount(0); setPayDiscountReason('');
    load();
    });
  };

  const handlePayExpense = async () => {
    return withPayingExpense(async () => {
    if (!payExpense || payAmount <= 0) return;
    const newPaid = Math.min(payExpense.paid_amount + payAmount, payExpense.amount);
    const isPaid = newPaid >= payExpense.amount;
    const { error } = await supabase.from('financial_expenses').update({
      paid_amount: newPaid,
      paid_date: isPaid ? todayISO() : payExpense.paid_date,
      status: isPaid ? 'pago' : 'pendente',
    }).eq('id', payExpense.id);
    if (error) { toast('Erro ao registrar pagamento', 'error'); return; }
    const { data: openReg } = await supabase.from('cash_registers').select('id').eq('status', 'aberto').maybeSingle();
    if (openReg) {
      await supabase.from('cash_transactions').insert({
        cash_register_id: (openReg as { id: string }).id,
        type: 'saida',
        category: 'pagamento_fornecedor',
        description: `Pagamento: ${payExpense.description}`,
        amount: payAmount,
        payment_method: payExpense.payment_method ?? 'Pix',
      });
    }
    toast('Pagamento registrado', 'success');
    setPayExpense(null); setPayAmount(0);
    load();
    });
  };

  const handleDeleteEntry = async () => {
    if (!deleteEntry) return;
    const { error } = await supabase.from('financial_entries').delete().eq('id', deleteEntry.id);
    if (error) { toast('Erro ao excluir conta. Verifique sua conexão e tente novamente.', 'error'); return; }
    toast('Conta a receber excluída', 'success');
    setDeleteEntry(null); load();
  };

  const handleDeleteExpense = async () => {
    if (!deleteExpense) return;
    const { error } = await supabase.from('financial_expenses').delete().eq('id', deleteExpense.id);
    if (error) { toast('Erro ao excluir conta. Verifique sua conexão e tente novamente.', 'error'); return; }
    toast('Conta a pagar excluída', 'success');
    setDeleteExpense(null); load();
  };

  const loadClosings = useCallback(async () => {
    setClosingLoading(true);
    const { data } = await supabase.from('monthly_closings').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false });
    setClosings((data as MonthlyClosing[]) ?? []);
    setClosingLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'closing') loadClosings();
  }, [tab, loadClosings]);

  const runReconciliation = async () => {
    const month = reportMonth.getMonth() + 1;
    const year = reportMonth.getFullYear();
    const { start, end } = getMonthBounds(reportMonth);

    const [entriesRes, expensesRes, cashTxRes] = await Promise.all([
      supabase.from('financial_entries').select('*').gte('due_date', start).lte('due_date', end),
      supabase.from('financial_expenses').select('*').gte('due_date', start).lte('due_date', end),
      supabase.from('cash_transactions').select('amount,type').gte('created_at', start).lte('created_at', end + 'T23:59:59'),
    ]);

    const periodEntries = (entriesRes.data as FinancialEntry[]) ?? [];
    const periodExpenses = (expensesRes.data as FinancialExpense[]) ?? [];
    const periodCashTx = (cashTxRes.data as { amount: number; type: string }[]) ?? [];

    const totalReceivable = periodEntries.reduce((s, e) => s + e.total_amount, 0);
    const totalReceived = periodEntries.reduce((s, e) => s + e.paid_amount, 0);
    const totalPayable = periodExpenses.reduce((s, e) => s + e.amount, 0);
    const totalPaid = periodExpenses.reduce((s, e) => s + e.paid_amount, 0);
    const cashIn = periodCashTx.filter((t) => t.type === 'entrada').reduce((s, t) => s + t.amount, 0);
    const cashOut = periodCashTx.filter((t) => t.type === 'saida').reduce((s, t) => s + t.amount, 0);

    const discrepancies: string[] = [];
    const cashLinkedRevenue = periodCashTx.filter((t) => t.type === 'entrada').reduce((s, t) => s + t.amount, 0);
    if (Math.abs(cashLinkedRevenue - totalReceived) > 0.01) {
      discrepancies.push(`Diferença entre recebimentos do financeiro (${formatCurrency(totalReceived)}) e entradas do caixa (${formatCurrency(cashIn)}). Pode haver lançamentos manuais no caixa não vinculados ao financeiro.`);
    }

    const { data: existing } = await supabase.from('monthly_closings').select('id').eq('period_month', month).eq('period_year', year).maybeSingle();
    const payload = {
      period_month: month, period_year: year,
      total_receivable: totalReceivable, total_received: totalReceived,
      total_payable: totalPayable, total_paid: totalPaid,
      cash_in: cashIn, cash_out: cashOut,
      discrepancies: discrepancies.length > 0 ? discrepancies.join('\n') : null,
      status: 'pendente',
    };
    if (existing) {
      const { error } = await supabase.from('monthly_closings').update({ ...payload, status: 'alterado', updated_at: new Date().toISOString() }).eq('id', (existing as { id: string }).id);
      if (error) { toast('Erro ao atualizar conferência. Verifique sua conexão.', 'error'); return; }
    } else {
      const { error } = await supabase.from('monthly_closings').insert(payload);
      if (error) { toast('Erro ao gerar conferência. Verifique sua conexão.', 'error'); return; }
    }
    toast('Conferência gerada. Revise as divergências antes de marcar como revisado.', 'success');
    loadClosings();
  };

  const markPeriodReviewed = async (closing: MonthlyClosing) => {
    if (!reviewForm.reviewed_by.trim()) { toast('Informe o nome do responsável', 'warning'); return; }
    const now = new Date().toISOString();
    const { error } = await supabase.from('monthly_closings').update({
      status: 'revisado', reviewed_by: reviewForm.reviewed_by.trim(),
      reviewed_at: now, closed_at: now, updated_at: now,
    }).eq('id', closing.id);
    if (error) { toast('Erro ao marcar período como revisado. Verifique sua conexão.', 'error'); return; }
    toast('Período marcado como revisado', 'success');
    setReviewForm({ reviewed_by: '', discrepancies: '' });
    loadClosings();
  };

  const handleRefund = async (entry: FinancialEntry) => {
    const refundAmount = entry.paid_amount;
    if (refundAmount <= 0) { toast('Não há valor pago para estornar', 'warning'); return; }
    const { data: openReg } = await supabase.from('cash_registers').select('id').eq('status', 'aberto').maybeSingle();
    const { error: txError } = await supabase.from('cash_transactions').insert({
      cash_register_id: openReg ? (openReg as { id: string }).id : null,
      client_id: entry.client_id,
      type: 'saida',
      category: 'estorno',
      description: `Estorno: ${entry.description}`,
      amount: refundAmount,
      payment_method: entry.payment_method ?? 'Pix',
      financial_entry_id: entry.id,
    });
    if (txError) { toast('Erro ao registrar estorno no caixa', 'error'); return; }
    const { error: upErr } = await supabase.from('financial_entries').update({
      paid_amount: 0, status: 'pendente', paid_date: null,
      refund_amount: refundAmount, original_entry_id: entry.id,
    }).eq('id', entry.id);
    if (upErr) { toast('Erro ao estornar no financeiro. O caixa foi atualizado, mas o financeiro pode estar inconsistente.', 'warning'); }
    if (entry.client_id) await supabase.from('client_history').insert({ client_id: entry.client_id, event_type: 'pagamento', description: `Estorno de ${formatCurrency(refundAmount)}: ${entry.description}` });
    toast('Estorno registrado. O valor foi revertido no caixa e no financeiro.', 'success');
    load();
  };

  const exportCSV = () => {
    const escape = (val: string | number | null | undefined) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const rows: string[] = [];
    rows.push('Tipo,Descrição,Categoria,Vencimento,Valor Total,Pago,Status');
    entries.forEach((e) => rows.push(['Receber', e.description, e.category, e.due_date, e.total_amount, e.paid_amount, e.status].map(escape).join(',')));
    expenses.forEach((e) => rows.push(['Pagar', e.description, e.category, e.due_date, e.amount, e.paid_amount, e.status].map(escape).join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `fluxo_financeiro_${todayISO()}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportado', 'success');
  };

  const printSettings: PrintSettings = {
    studio_name: settings.studio_name,
    fantasy_name: settings.fantasy_name,
    tax_id: settings.tax_id,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    logo_url: settings.logo_url,
  };

  const printReport = () => {
    const periodLabel = reportMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const prevD = new Date(reportMonth); prevD.setMonth(prevD.getMonth() - 1);
    const prevLabel = prevD.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const { start: prevStart, end: prevEnd } = getMonthBounds(prevD);
    const prevData = buildReportPeriodData(entries, expenses, allBudgets, prevStart, prevEnd);
    const curData = buildReportPeriodData(entries, expenses, allBudgets, start, end);
    const svcComparison = buildServiceComparison(services);

    const body = `
      <div class="print-section">
        <h3>Comparativo de períodos</h3>
        <table class="print-table">
          <thead><tr><th>Indicador</th><th class="text-right">${prevLabel}</th><th class="text-right">${periodLabel}</th><th class="text-right">Variação</th></tr></thead>
          <tbody>
            <tr><td>Receitas recebidas</td><td class="text-right">${formatCurrency(prevData.revenue)}</td><td class="text-right">${formatCurrency(curData.revenue)}</td><td class="text-right">${curData.revenue >= prevData.revenue ? '+' : ''}${formatCurrency(round2(curData.revenue - prevData.revenue))}</td></tr>
            <tr><td>Despesas pagas</td><td class="text-right">${formatCurrency(prevData.expenses)}</td><td class="text-right">${formatCurrency(curData.expenses)}</td><td class="text-right">${curData.expenses >= prevData.expenses ? '+' : ''}${formatCurrency(round2(curData.expenses - prevData.expenses))}</td></tr>
            <tr><td>Resultado</td><td class="text-right">${formatCurrency(prevData.result)}</td><td class="text-right">${formatCurrency(curData.result)}</td><td class="text-right">${curData.result >= prevData.result ? '+' : ''}${formatCurrency(round2(curData.result - prevData.result))}</td></tr>
            <tr><td>A receber</td><td class="text-right">${formatCurrency(prevData.receivable)}</td><td class="text-right">${formatCurrency(curData.receivable)}</td><td class="text-right">${formatCurrency(round2(curData.receivable - prevData.receivable))}</td></tr>
            <tr><td>A pagar</td><td class="text-right">${formatCurrency(prevData.payable)}</td><td class="text-right">${formatCurrency(curData.payable)}</td><td class="text-right">${formatCurrency(round2(curData.payable - prevData.payable))}</td></tr>
            <tr><td>Ticket médio</td><td class="text-right">${formatCurrency(prevData.avgTicket)}</td><td class="text-right">${formatCurrency(curData.avgTicket)}</td><td class="text-right">${formatCurrency(round2(curData.avgTicket - prevData.avgTicket))}</td></tr>
            <tr><td>Vendas</td><td class="text-right">${prevData.salesCount}</td><td class="text-right">${curData.salesCount}</td><td class="text-right">${curData.salesCount - prevData.salesCount}</td></tr>
            <tr><td>Orçamentos</td><td class="text-right">${prevData.budgetCount}</td><td class="text-right">${curData.budgetCount}</td><td class="text-right">${curData.budgetCount - prevData.budgetCount}</td></tr>
            <tr><td>Aprovados</td><td class="text-right">${prevData.approvedCount}</td><td class="text-right">${curData.approvedCount}</td><td class="text-right">${curData.approvedCount - prevData.approvedCount}</td></tr>
            <tr><td>Conversão</td><td class="text-right">${prevData.conversionRate}%</td><td class="text-right">${curData.conversionRate}%</td><td class="text-right">${round2(curData.conversionRate - prevData.conversionRate)}pp</td></tr>
          </tbody>
        </table>
      </div>
      <div class="print-section">
        <h3>Rentabilidade por serviço</h3>
        <table class="print-table">
          <thead><tr><th>Serviço</th><th class="text-right">Preço</th><th class="text-right">Custo</th><th class="text-right">Margem</th><th class="text-right">Marg. %</th><th class="text-right">Markup %</th></tr></thead>
          <tbody>
            ${svcComparison.map((s) => `<tr><td>${s.code} — ${s.serviceName}</td><td class="text-right">${formatCurrency(s.price)}</td><td class="text-right">${formatCurrency(s.cost)}</td><td class="text-right">${formatCurrency(s.margin)}</td><td class="text-right">${s.marginPercent}%</td><td class="text-right">${s.markupPercent}%</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
    openPrintWindow(buildPrintHTML(`Relatório gerencial — ${periodLabel}`, body, printSettings));
  };

  const exportReportCSV = () => {
    const periodLabel = reportMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    const prevD = new Date(reportMonth); prevD.setMonth(prevD.getMonth() - 1);
    const { start: prevStart, end: prevEnd } = getMonthBounds(prevD);
    const prevData = buildReportPeriodData(entries, expenses, allBudgets, prevStart, prevEnd);
    const curData = buildReportPeriodData(entries, expenses, allBudgets, start, end);
    const svc = buildServiceComparison(services);
    const esc = (v: string | number) => { const s = String(v ?? ''); return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows: string[] = [];
    rows.push('Indicador,Periodo Anterior,Periodo Atual,Variacao');
    rows.push(['Receitas recebidas', prevData.revenue, curData.revenue, round2(curData.revenue - prevData.revenue)].map(esc).join(','));
    rows.push(['Despesas pagas', prevData.expenses, curData.expenses, round2(curData.expenses - prevData.expenses)].map(esc).join(','));
    rows.push(['Resultado', prevData.result, curData.result, round2(curData.result - prevData.result)].map(esc).join(','));
    rows.push(['Ticket medio', prevData.avgTicket, curData.avgTicket, round2(curData.avgTicket - prevData.avgTicket)].map(esc).join(','));
    rows.push(['Vendas', prevData.salesCount, curData.salesCount, curData.salesCount - prevData.salesCount].map(esc).join(','));
    rows.push(['Orcamentos', prevData.budgetCount, curData.budgetCount, curData.budgetCount - prevData.budgetCount].map(esc).join(','));
    rows.push(['Aprovados', prevData.approvedCount, curData.approvedCount, curData.approvedCount - prevData.approvedCount].map(esc).join(','));
    rows.push(['Conversao %', prevData.conversionRate, curData.conversionRate, round2(curData.conversionRate - prevData.conversionRate)].map(esc).join(','));
    rows.push('');
    rows.push('Serviço,Preco,Custo,Margem,Margem %,Markup %');
    svc.forEach((s) => rows.push([`${s.code} — ${s.serviceName}`, s.price, s.cost, s.margin, s.marginPercent, s.markupPercent].map(esc).join(',')));
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `relatorio_gerencial_${todayISO()}.csv`; a.click(); URL.revokeObjectURL(url);
    toast('Relatório CSV exportado', 'success');
  };

  const tabs: { id: Tab; label: string; icon: typeof TrendingUp }[] = [
    { id: 'receivable', label: 'Contas a receber', icon: TrendingUp },
    { id: 'payable', label: 'Contas a pagar', icon: TrendingDown },
    { id: 'summary', label: 'Resumo financeiro', icon: Wallet },
    { id: 'closing', label: 'Fechamento mensal', icon: CalendarCheck },
  ];

  return (
    <div>
      <PageHeader
        title="Fluxo financeiro"
        subtitle="Controle de recebimentos, despesas e resultados"
        actions={
          <div className="flex gap-2">
            <button onClick={exportCSV} className="btn-secondary"><Printer className="h-4 w-4" /> Exportar CSV</button>
            <button onClick={printReport} className="btn-secondary"><Printer className="h-4 w-4" /> Imprimir relatório</button>
            <button onClick={exportReportCSV} className="btn-secondary"><FileDown className="h-4 w-4" /> Relatório CSV</button>
            <button onClick={() => setEntryModal(true)} className="btn-secondary text-emerald-600"><Plus className="h-4 w-4" /> Conta a receber</button>
            <button onClick={() => setExpenseModal(true)} className="btn-secondary text-red-500"><Plus className="h-4 w-4" /> Conta a pagar</button>
          </div>
        }
      />

      {/* Indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5"><p className="text-sm text-slate-400">A receber</p><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(totalReceivable)}</p><p className="text-xs text-slate-400 mt-1">{overdueEntries.length} em atraso</p></div>
        <div className="card p-5"><p className="text-sm text-slate-400">A pagar</p><p className="text-2xl font-bold mt-1 text-red-500">{formatCurrency(totalPayable)}</p><p className="text-xs text-slate-400 mt-1">{overdueExpenses.length} em atraso</p></div>
        <div className="card p-5"><p className="text-sm text-slate-400">Receitas do mês</p><p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(monthRevenue)}</p></div>
        <div className="card p-5"><p className="text-sm text-slate-400">Resultado do mês</p><p className={`text-2xl font-bold mt-1 ${monthResult >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(monthResult)}</p></div>
      </div>

      <div className="flex gap-2 mb-4 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((t) => { const Icon = t.icon; return (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 border-transparent'}`} style={tab === t.id ? { borderColor: 'var(--color-primary)' } : { borderColor: 'transparent' }}>
            <Icon className="h-4 w-4" /> {t.label}
          </button>
        ); })}
      </div>

      {loading ? <div className="py-20 text-center text-slate-400">Carregando...</div> : (
        <>
          {tab === 'receivable' && (
            <div className="card overflow-hidden">
              {entries.length === 0 ? <EmptyState icon={<TrendingUp className="h-10 w-10" />} title="Nenhuma conta a receber" description="Registre valores a receber de clientes." action={<button onClick={() => setEntryModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Nova conta a receber</button>} /> : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Descrição</th><th className="px-4 py-3 hidden md:table-cell">Cliente</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3 text-right">Pago</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {entries.map((e) => { const client = clients.find((c) => c.id === e.client_id); const overdue = e.status !== 'pago' && e.due_date < todayISO(); return (
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-slate-100">{e.description}</p><p className="text-xs text-slate-400">{e.category} · {e.installment_number}/{e.total_installments}</p></td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{client?.full_name ?? '—'}</td>
                        <td className="px-4 py-3"><span className={overdue ? 'text-red-500 font-medium' : 'text-slate-500'}>{formatDate(e.due_date)}</span>{overdue && <span className="badge badge-danger ml-2">Atrasado</span>}</td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(e.total_amount)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(e.paid_amount)}</td>
                        <td className="px-4 py-3"><span className={`badge ${e.status === 'pago' ? 'badge-success' : overdue ? 'badge-danger' : 'badge-warning'}`}>{e.status === 'pago' ? 'Pago' : overdue ? 'Atrasado' : 'Pendente'}</span></td>
                        <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{e.status !== 'pago' && <button onClick={() => { setPayEntry(e); setPayAmount(e.total_amount - e.paid_amount - e.discount_amount); setPayDiscount(0); setPayDiscountReason(''); }} className="btn-ghost text-emerald-600" title="Registrar pagamento"><CheckCircle className="h-4 w-4" /></button>}{e.paid_amount > 0 && e.status === 'pendente' && <button onClick={() => handleRefund(e)} className="btn-ghost text-orange-500" title="Estornar pagamento"><RotateCcw className="h-4 w-4" /></button>}<button onClick={() => setDeleteEntry(e)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button></div></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'payable' && (
            <div className="card overflow-hidden">
              {expenses.length === 0 ? <EmptyState icon={<TrendingDown className="h-10 w-10" />} title="Nenhuma conta a pagar" description="Registre contas e despesas a pagar." action={<button onClick={() => setExpenseModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Nova conta a pagar</button>} /> : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400"><tr><th className="px-4 py-3">Descrição</th><th className="px-4 py-3 hidden md:table-cell">Fornecedor</th><th className="px-4 py-3">Vencimento</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3 text-right">Pago</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {expenses.map((e) => { const overdue = e.status !== 'pago' && e.due_date < todayISO(); return (
                      <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-slate-100">{e.description}</p><p className="text-xs text-slate-400">{e.category}</p></td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{e.supplier ?? '—'}</td>
                        <td className="px-4 py-3"><span className={overdue ? 'text-red-500 font-medium' : 'text-slate-500'}>{formatDate(e.due_date)}</span></td>
                        <td className="px-4 py-3 text-right font-medium">{formatCurrency(e.amount)}</td>
                        <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(e.paid_amount)}</td>
                        <td className="px-4 py-3"><span className={`badge ${e.status === 'pago' ? 'badge-success' : overdue ? 'badge-danger' : 'badge-warning'}`}>{e.status === 'pago' ? 'Pago' : overdue ? 'Atrasado' : 'Pendente'}</span></td>
                        <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">{e.status !== 'pago' && <button onClick={() => { setPayExpense(e); setPayAmount(e.amount - e.paid_amount); }} className="btn-ghost text-emerald-600"><CheckCircle className="h-4 w-4" /></button>}<button onClick={() => setDeleteExpense(e)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button></div></td>
                      </tr>
                    ); })}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'summary' && (
            <div className="space-y-6">
              {/* Period filter */}
              <div className="card p-4 flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={() => { const d = new Date(reportMonth); d.setMonth(d.getMonth() - 1); setReportMonth(d); }} className="btn-ghost"><ChevronLeft className="h-4 w-4" /></button>
                  <span className="text-sm font-medium min-w-[140px] text-center capitalize">{reportMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
                  <button onClick={() => { const d = new Date(reportMonth); d.setMonth(d.getMonth() + 1); setReportMonth(d); }} className="btn-ghost"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <button onClick={() => setReportMonth(new Date())} className="btn-secondary text-xs">Mês atual</button>
                <div className="ml-auto flex items-center gap-2 text-sm text-slate-400"><BarChart3 className="h-4 w-4" /> Relatório de {reportMonth.toLocaleDateString('pt-BR', { month: 'long' })}</div>
                <button onClick={printReport} className="btn-secondary text-xs"><Printer className="h-3 w-3" /> Imprimir</button>
                <button onClick={exportReportCSV} className="btn-secondary text-xs"><FileDown className="h-3 w-3" /> CSV</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="card p-6">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-600" /> Receitas do período</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Faturamento previsto:</span><span className="font-medium">{formatCurrency(monthEntries.reduce((s, e) => s + e.total_amount, 0))}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Valores recebidos:</span><span className="font-medium text-emerald-600">{formatCurrency(monthRevenue)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">A receber no período:</span><span className="font-medium">{formatCurrency(monthEntries.reduce((s, e) => s + (e.total_amount - e.paid_amount), 0))}</span></div>
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-500">Inadimplência:</span><span className="font-medium text-red-500">{formatCurrency(overdueEntries.reduce((s, e) => s + (e.total_amount - e.paid_amount), 0))}</span></div>
                  </div>
                </div>
                <div className="card p-6">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /> Despesas do período</h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between"><span className="text-slate-500">Despesas previstas:</span><span className="font-medium">{formatCurrency(monthExpenses.reduce((s, e) => s + e.amount, 0))}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">Despesas pagas:</span><span className="font-medium text-red-500">{formatCurrency(monthExpensesPaid)}</span></div>
                    <div className="flex justify-between"><span className="text-slate-500">A pagar no período:</span><span className="font-medium">{formatCurrency(monthExpenses.reduce((s, e) => s + (e.amount - e.paid_amount), 0))}</span></div>
                    <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-500">Atrasadas:</span><span className="font-medium text-red-500">{formatCurrency(overdueExpenses.reduce((s, e) => s + (e.amount - e.paid_amount), 0))}</span></div>
                  </div>
                </div>
              </div>

              {/* 6-month chart */}
              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Evolução dos últimos 6 meses</h3>
                <div className="flex items-end gap-2 sm:gap-4 h-48 overflow-x-auto">
                  {monthlyData.map((m, i) => {
                    const revH = Math.round((m.revenue / maxMonthly) * 100);
                    const expH = Math.round((m.expenses / maxMonthly) * 100);
                    return (
                      <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-[60px]">
                        <div className="flex items-end gap-1 h-36 w-full justify-center">
                          <div className="w-3 sm:w-4 rounded-t bg-emerald-500 transition-all" style={{ height: `${revH}%` }} title={`Receitas: ${formatCurrency(m.revenue)}`} />
                          <div className="w-3 sm:w-4 rounded-t bg-red-400 transition-all" style={{ height: `${expH}%` }} title={`Despesas: ${formatCurrency(m.expenses)}`} />
                        </div>
                        <span className="text-xs text-slate-400 capitalize">{m.label}</span>
                        <span className={`text-xs font-medium ${m.result >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(m.result)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="flex justify-center gap-4 mt-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-emerald-500" /> Receitas</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400" /> Despesas</span>
                </div>
              </div>

              {/* Category breakdown */}
              {Object.keys(categoryBreakdown).length > 0 && (
                <div className="card p-6">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-600" /> Receitas por categoria</h3>
                  <div className="space-y-3">
                    {Object.entries(categoryBreakdown).sort((a, b) => b[1] - a[1]).map(([cat, val]) => {
                      const pct = totalCatRevenue > 0 ? Math.round((val / totalCatRevenue) * 100) : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-sm mb-1"><span className="text-slate-600 dark:text-slate-300">{cat}</span><span className="font-medium">{formatCurrency(val)} · {pct}%</span></div>
                          <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} /></div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><Wallet className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Resultado financeiro</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center"><p className="text-sm text-slate-400">Receitas recebidas</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(monthRevenue)}</p></div>
                  <div className="text-center"><p className="text-sm text-slate-400">Despesas pagas</p><p className="text-2xl font-bold text-red-500 mt-1">{formatCurrency(monthExpensesPaid)}</p></div>
                  <div className="text-center border-l border-slate-200 dark:border-slate-700"><p className="text-sm text-slate-400">Resultado</p><p className={`text-2xl font-bold mt-1 ${monthResult >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(monthResult)}</p></div>
                </div>
                <p className="text-xs text-slate-400 mt-4">O saldo do caixa não representa lucro líquido. Os valores acima distinguem dinheiro disponível, receitas, despesas e resultado estimado do período.</p>
              </div>

              {/* Period comparison */}
              {(() => {
                const prevD = new Date(reportMonth); prevD.setMonth(prevD.getMonth() - 1);
                const { start: prevStart, end: prevEnd } = getMonthBounds(prevD);
                const prevData = buildReportPeriodData(entries, expenses, allBudgets, prevStart, prevEnd);
                const curData = buildReportPeriodData(entries, expenses, allBudgets, start, end);
                const fmtVar = (cur: number, prev: number, suffix = '') => { const v = round2(cur - prev); const sign = v >= 0 ? '+' : ''; return `${sign}${formatCurrency(v)}${suffix}`; };
                const fmtVarNum = (cur: number, prev: number) => { const v = cur - prev; const sign = v >= 0 ? '+' : ''; return `${sign}${v}`; };
                return (
                  <div className="card p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Comparativo com mês anterior</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400"><tr><th className="px-3 py-2">Indicador</th><th className="px-3 py-2 text-right">{prevD.toLocaleDateString('pt-BR', { month: 'short' })}</th><th className="px-3 py-2 text-right">Atual</th><th className="px-3 py-2 text-right">Variação</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                          <tr><td className="px-3 py-2">Receitas</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(prevData.revenue)}</td><td className="px-3 py-2 text-right font-medium text-emerald-600">{formatCurrency(curData.revenue)}</td><td className={`px-3 py-2 text-right ${curData.revenue >= prevData.revenue ? 'text-emerald-600' : 'text-red-500'}`}>{fmtVar(curData.revenue, prevData.revenue)}</td></tr>
                          <tr><td className="px-3 py-2">Despesas</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(prevData.expenses)}</td><td className="px-3 py-2 text-right font-medium text-red-500">{formatCurrency(curData.expenses)}</td><td className={`px-3 py-2 text-right ${curData.expenses <= prevData.expenses ? 'text-emerald-600' : 'text-red-500'}`}>{fmtVar(curData.expenses, prevData.expenses)}</td></tr>
                          <tr><td className="px-3 py-2">Resultado</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(prevData.result)}</td><td className={`px-3 py-2 text-right font-medium ${curData.result >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(curData.result)}</td><td className={`px-3 py-2 text-right ${curData.result >= prevData.result ? 'text-emerald-600' : 'text-red-500'}`}>{fmtVar(curData.result, prevData.result)}</td></tr>
                          <tr><td className="px-3 py-2">A receber</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(prevData.receivable)}</td><td className="px-3 py-2 text-right">{formatCurrency(curData.receivable)}</td><td className="px-3 py-2 text-right text-slate-500">{fmtVar(curData.receivable, prevData.receivable)}</td></tr>
                          <tr><td className="px-3 py-2">A pagar</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(prevData.payable)}</td><td className="px-3 py-2 text-right">{formatCurrency(curData.payable)}</td><td className="px-3 py-2 text-right text-slate-500">{fmtVar(curData.payable, prevData.payable)}</td></tr>
                          <tr><td className="px-3 py-2">Ticket médio</td><td className="px-3 py-2 text-right text-slate-500">{formatCurrency(prevData.avgTicket)}</td><td className="px-3 py-2 text-right font-medium">{formatCurrency(curData.avgTicket)}</td><td className="px-3 py-2 text-right text-slate-500">{fmtVar(curData.avgTicket, prevData.avgTicket)}</td></tr>
                          <tr><td className="px-3 py-2">Vendas</td><td className="px-3 py-2 text-right text-slate-500">{prevData.salesCount}</td><td className="px-3 py-2 text-right font-medium">{curData.salesCount}</td><td className="px-3 py-2 text-right text-slate-500">{fmtVarNum(curData.salesCount, prevData.salesCount)}</td></tr>
                          <tr><td className="px-3 py-2">Orçamentos</td><td className="px-3 py-2 text-right text-slate-500">{prevData.budgetCount}</td><td className="px-3 py-2 text-right">{curData.budgetCount}</td><td className="px-3 py-2 text-right text-slate-500">{fmtVarNum(curData.budgetCount, prevData.budgetCount)}</td></tr>
                          <tr><td className="px-3 py-2">Aprovados</td><td className="px-3 py-2 text-right text-slate-500">{prevData.approvedCount}</td><td className="px-3 py-2 text-right">{curData.approvedCount}</td><td className="px-3 py-2 text-right text-slate-500">{fmtVarNum(curData.approvedCount, prevData.approvedCount)}</td></tr>
                          <tr><td className="px-3 py-2">Conversão</td><td className="px-3 py-2 text-right text-slate-500">{prevData.conversionRate}%</td><td className="px-3 py-2 text-right font-medium">{curData.conversionRate}%</td><td className="px-3 py-2 text-right text-slate-500">{round2(curData.conversionRate - prevData.conversionRate)}pp</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}

              {/* Profitability analysis using shared calculation */}
              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-600" /> Análise de rentabilidade</h3>
                <div className="space-y-4">
                  {(() => {
                    const curData = buildReportPeriodData(entries, expenses, allBudgets, start, end);
                    const svcComparison = buildServiceComparison(services);
                    const avgMargin = svcComparison.length > 0 ? round2(svcComparison.reduce((s, c) => s + c.marginPercent, 0) / svcComparison.length) : 0;
                    return (
                      <>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Receitas recebidas</p><p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(curData.revenue)}</p></div>
                          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Despesas pagas</p><p className="text-lg font-bold text-red-500 mt-1">{formatCurrency(curData.expenses)}</p></div>
                          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Resultado</p><p className={`text-lg font-bold mt-1 ${curData.result >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(curData.result)}</p></div>
                          <div className="text-center p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Margem média</p><p className={`text-lg font-bold mt-1 ${avgMargin >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{avgMargin}%</p></div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400">Ticket médio</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{formatCurrency(curData.avgTicket)}</p></div>
                          <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400">Conversão de orçamentos</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{curData.conversionRate}% ({curData.approvedCount}/{curData.budgetCount})</p></div>
                        </div>
                        {svcComparison.length > 0 && (
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-slate-400 uppercase"><tr><th className="px-2 py-2">Serviço</th><th className="px-2 py-2 text-right">Preço</th><th className="px-2 py-2 text-right">Custo</th><th className="px-2 py-2 text-right">Margem</th><th className="px-2 py-2 text-right">Marg %</th><th className="px-2 py-2 text-right">Markup %</th></tr></thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                                {svcComparison.map((s) => (
                                  <tr key={s.code}><td className="px-2 py-2 text-slate-700 dark:text-slate-300">{s.code} — {s.serviceName}</td><td className="px-2 py-2 text-right">{formatCurrency(s.price)}</td><td className="px-2 py-2 text-right text-amber-600">{formatCurrency(s.cost)}</td><td className="px-2 py-2 text-right font-medium">{formatCurrency(s.margin)}</td><td className={`px-2 py-2 text-right ${s.marginPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{s.marginPercent}%</td><td className={`px-2 py-2 text-right ${s.markupPercent >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{s.markupPercent}%</td></tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        <p className="text-xs text-slate-400">Margem sobre venda = (preço - custo) / preço. Acréscimo sobre custo (markup) = (preço - custo) / custo. Custo base é o valor cadastrado em cada serviço. Para análise completa, use a calculadora de preços na aba Serviços.</p>
                      </>
                    );
                  })()}
                </div>
              </div>
              <div className="card p-6">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" /> Inadimplência</h3>
                {overdueEntries.length === 0 ? <p className="text-sm text-slate-400">Nenhuma conta em atraso.</p> : (
                  <div className="space-y-2">
                    {overdueEntries.map((e) => { const client = clients.find((c) => c.id === e.client_id); return (
                      <div key={e.id} className="flex justify-between items-center text-sm border-b border-slate-100 dark:border-slate-700 pb-2">
                        <div><p className="font-medium text-slate-900 dark:text-slate-100">{e.description}</p><p className="text-xs text-slate-400">{client?.full_name ?? '—'} · venceu em {formatDate(e.due_date)}</p></div>
                        <span className="font-semibold text-red-500">{formatCurrency(e.total_amount - e.paid_amount)}</span>
                      </div>
                    ); })}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Entry modal */}
      <Modal open={entryModal} onClose={() => setEntryModal(false)} title="Nova conta a receber" size="md">
        <div className="space-y-4">
          <div><label className="label">Descrição *</label><input className="input" value={entryForm.description} onChange={(e) => setEntryForm({ ...entryForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Valor total (R$) *</label><input type="number" step="0.01" className="input" value={entryForm.total_amount} onChange={(e) => setEntryForm({ ...entryForm, total_amount: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Vencimento</label><input type="date" className="input" value={entryForm.due_date} onChange={(e) => setEntryForm({ ...entryForm, due_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Parcela</label><input type="number" className="input" value={entryForm.installment_number} onChange={(e) => setEntryForm({ ...entryForm, installment_number: parseInt(e.target.value) || 1 })} /></div>
            <div><label className="label">Total de parcelas</label><input type="number" className="input" value={entryForm.total_installments} onChange={(e) => setEntryForm({ ...entryForm, total_installments: parseInt(e.target.value) || 1 })} /></div>
          </div>
          <div><label className="label">Cliente</label><ClientSearchSelect clients={clients} value={entryForm.client_id} onChange={(id) => setEntryForm({ ...entryForm, client_id: id ?? '' })} /></div>
          {budgets.length > 0 && <div><label className="label">Orçamento relacionado</label><select className="input" value={entryForm.budget_id} onChange={(e) => setEntryForm({ ...entryForm, budget_id: e.target.value })}><option value="">Sem orçamento</option>{budgets.map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}</select></div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Categoria</label><select className="input" value={entryForm.category} onChange={(e) => setEntryForm({ ...entryForm, category: e.target.value })}>{entryCategories.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Forma de pagamento</label><select className="input" value={entryForm.payment_method} onChange={(e) => setEntryForm({ ...entryForm, payment_method: e.target.value })}><option>Pix</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Cartão de débito</option><option>Transferência</option></select></div>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setEntryModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleAddEntry} disabled={savingEntry} className="btn-primary">{savingEntry ? 'Salvando...' : 'Criar conta a receber'}</button></div>
      </Modal>

      {/* Expense modal */}
      <Modal open={expenseModal} onClose={() => setExpenseModal(false)} title="Nova conta a pagar" size="md">
        <div className="space-y-4">
          <div><label className="label">Descrição *</label><input className="input" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Valor (R$) *</label><input type="number" step="0.01" className="input" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Vencimento</label><input type="date" className="input" value={expenseForm.due_date} onChange={(e) => setExpenseForm({ ...expenseForm, due_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Categoria</label><select className="input" value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })}>{expenseCategories.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Forma de pagamento</label><select className="input" value={expenseForm.payment_method} onChange={(e) => setExpenseForm({ ...expenseForm, payment_method: e.target.value })}><option>Pix</option><option>Dinheiro</option><option>Cartão de crédito</option><option>Transferência</option><option>Boleto</option></select></div>
          </div>
          <div><label className="label">Fornecedor (opcional)</label><input className="input" value={expenseForm.supplier} onChange={(e) => setExpenseForm({ ...expenseForm, supplier: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Total de parcelas</label><input type="number" min="1" max="48" className="input" value={expenseForm.total_installments} onChange={(e) => setExpenseForm({ ...expenseForm, total_installments: Math.max(1, parseInt(e.target.value) || 1) })} /><p className="text-xs text-slate-400 mt-1">Valor total será dividido igualmente</p></div>
            <div><label className="label">Campanha (opcional)</label><select className="input" value={expenseForm.campaign_id} onChange={(e) => setExpenseForm({ ...expenseForm, campaign_id: e.target.value })}><option value="">Sem campanha</option>{campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          </div>
          {expenseForm.payment_method === 'Cartão de crédito' && (
            <div><label className="label">Nome do cartão</label><input className="input" placeholder="Ex: Nubank, Itaú..." value={expenseForm.card_name} onChange={(e) => setExpenseForm({ ...expenseForm, card_name: e.target.value })} /></div>
          )}
          {expenseForm.total_installments > 1 && (
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-xs text-slate-500">Serão criadas {expenseForm.total_installments} contas de {formatCurrency(expenseForm.amount / expenseForm.total_installments)} cada, vencendo mensalmente a partir da data informada.</p>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setExpenseModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleAddExpense} disabled={savingExpense} className="btn-primary">{savingExpense ? 'Salvando...' : 'Criar conta a pagar'}</button></div>
      </Modal>

      {/* Payment modals */}
      <Modal open={!!payEntry} onClose={() => setPayEntry(null)} title="Registrar recebimento" size="sm">
        {payEntry && (
          <div className="space-y-4">
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50"><p className="text-sm text-slate-500">{payEntry.description}</p><p className="text-xs text-slate-400">Total: {formatCurrency(payEntry.total_amount)} {payEntry.discount_amount > 0 && `· Desconto: ${formatCurrency(payEntry.discount_amount)}`} · Pago: {formatCurrency(payEntry.paid_amount)} · Saldo: {formatCurrency(payEntry.total_amount - payEntry.discount_amount - payEntry.paid_amount)}</p></div>
            <div><label className="label">Valor a receber (R$)</label><input type="number" step="0.01" className="input" value={payAmount} onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)} /></div>
            <div className="border-t border-slate-200 dark:border-slate-700 pt-3">
              <label className="label flex items-center gap-1"><Tag className="h-3 w-3" /> Desconto (opcional)</label>
              <input type="number" step="0.01" className="input mb-2" placeholder="0,00" value={payDiscount} onChange={(e) => setPayDiscount(parseFloat(e.target.value) || 0)} />
              {payDiscount > 0 && <input className="input" placeholder="Justificativa do desconto *" value={payDiscountReason} onChange={(e) => setPayDiscountReason(e.target.value)} />}
            </div>
            <div className="flex justify-end gap-3"><button onClick={() => setPayEntry(null)} className="btn-secondary">Cancelar</button><button onClick={handlePayEntry} disabled={payingEntry} className="btn-primary">{payingEntry ? 'Salvando...' : 'Confirmar recebimento'}</button></div>
          </div>
        )}
      </Modal>

      <Modal open={!!payExpense} onClose={() => setPayExpense(null)} title="Registrar pagamento" size="sm">
        {payExpense && (
          <div className="space-y-4">
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50"><p className="text-sm text-slate-500">{payExpense.description}</p><p className="text-xs text-slate-400">Total: {formatCurrency(payExpense.amount)} · Pago: {formatCurrency(payExpense.paid_amount)} · Saldo: {formatCurrency(payExpense.amount - payExpense.paid_amount)}</p></div>
            <div><label className="label">Valor a pagar (R$)</label><input type="number" step="0.01" className="input" value={payAmount} onChange={(e) => setPayAmount(parseFloat(e.target.value) || 0)} /></div>
            <div className="flex justify-end gap-3"><button onClick={() => setPayExpense(null)} className="btn-secondary">Cancelar</button><button onClick={handlePayExpense} disabled={payingExpense} className="btn-primary">{payingExpense ? 'Salvando...' : 'Confirmar pagamento'}</button></div>
          </div>
        )}
      </Modal>

      {/* Monthly closing tab */}
      {tab === 'closing' && (
        <div className="space-y-4">
          <div className="card p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <button onClick={() => { const d = new Date(reportMonth); d.setMonth(d.getMonth() - 1); setReportMonth(d); }} className="btn-ghost"><ChevronLeft className="h-4 w-4" /></button>
              <span className="text-sm font-medium min-w-[140px] text-center capitalize">{reportMonth.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
              <button onClick={() => { const d = new Date(reportMonth); d.setMonth(d.getMonth() + 1); setReportMonth(d); }} className="btn-ghost"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <button onClick={() => setReportMonth(new Date())} className="btn-secondary text-xs">Mês atual</button>
            <button onClick={runReconciliation} className="btn-primary ml-auto"><CalendarCheck className="h-4 w-4" /> Gerar conferência</button>
          </div>

          {(() => {
            const month = reportMonth.getMonth() + 1;
            const year = reportMonth.getFullYear();
            const closing = closings.find((c) => c.period_month === month && c.period_year === year);
            if (!closing) {
              return <EmptyState icon={<CalendarCheck className="h-12 w-12" />} title="Sem conferência para este mês" description="Clique em 'Gerar conferência' para comparar recebimentos, despesas e caixa do período." />;
            }
            return (
              <div className="space-y-4">
                <div className={`card p-4 ${closing.status === 'revisado' ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : closing.status === 'alterado' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className={`badge ${closing.status === 'revisado' ? 'badge-success' : closing.status === 'alterado' ? 'badge-warning' : 'badge-neutral'}`}>{closing.status === 'revisado' ? 'Revisado' : closing.status === 'alterado' ? 'Alterado após revisão' : 'Pendente'}</span>
                    {closing.reviewed_by && <span className="text-xs text-slate-400">por {closing.reviewed_by} em {formatDate(closing.reviewed_at ?? '')}</span>}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="card p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><TrendingUp className="h-5 w-5 text-emerald-600" /> Contas a receber</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Valor contratado:</span><span className="font-medium">{formatCurrency(closing.total_receivable)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Valor recebido:</span><span className="font-medium text-emerald-600">{formatCurrency(closing.total_received)}</span></div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-500">Saldo a receber:</span><span className="font-medium text-amber-600">{formatCurrency(closing.total_receivable - closing.total_received)}</span></div>
                    </div>
                  </div>
                  <div className="card p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><TrendingDown className="h-5 w-5 text-red-500" /> Contas a pagar</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-500">Despesas comprometidas:</span><span className="font-medium">{formatCurrency(closing.total_payable)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Despesas pagas:</span><span className="font-medium text-red-500">{formatCurrency(closing.total_paid)}</span></div>
                      <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="text-slate-500">Saldo a pagar:</span><span className="font-medium text-amber-600">{formatCurrency(closing.total_payable - closing.total_paid)}</span></div>
                    </div>
                  </div>
                </div>

                <div className="card p-6">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2"><Wallet className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Movimentação do caixa</h3>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center"><p className="text-xs text-slate-400">Entradas</p><p className="text-lg font-bold text-emerald-600 mt-1">{formatCurrency(closing.cash_in)}</p></div>
                    <div className="text-center"><p className="text-xs text-slate-400">Saídas</p><p className="text-lg font-bold text-red-500 mt-1">{formatCurrency(closing.cash_out)}</p></div>
                    <div className="text-center border-l border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400">Saldo do caixa</p><p className="text-lg font-bold mt-1" style={{ color: 'var(--color-primary)' }}>{formatCurrency(closing.cash_in - closing.cash_out)}</p></div>
                  </div>
                </div>

                {closing.discrepancies && (
                  <div className="card p-4 border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Divergências encontradas</p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1 whitespace-pre-wrap">{closing.discrepancies}</p>
                      </div>
                    </div>
                  </div>
                )}

                {closing.status !== 'revisado' && (
                  <div className="card p-6">
                    <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-4">Marcar como revisado</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                      <div><label className="label">Responsável *</label><input className="input" placeholder="Nome de quem revisou" value={reviewForm.reviewed_by} onChange={(e) => setReviewForm({ ...reviewForm, reviewed_by: e.target.value })} /></div>
                      <div><label className="label">Observações (opcional)</label><input className="input" placeholder="Anotações sobre a conferência" value={reviewForm.discrepancies} onChange={(e) => setReviewForm({ ...reviewForm, discrepancies: e.target.value })} /></div>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">Após marcar como revisado, se houver alterações posteriores no período, o status mudará para 'alterado' indicando que precisa de nova conferência. Valores não são ajustados automaticamente.</p>
                    <button onClick={() => markPeriodReviewed(closing)} className="btn-primary"><CalendarCheck className="h-4 w-4" /> Marcar como revisado</button>
                  </div>
                )}
              </div>
            );
          })()}

          {closings.length > 0 && (
            <div className="card overflow-hidden">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 p-4 border-b border-slate-200 dark:border-slate-700">Histórico de fechamentos</h3>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                  <tr><th className="px-4 py-3">Período</th><th className="px-4 py-3 text-right">Recebido</th><th className="px-4 py-3 text-right">Pago</th><th className="px-4 py-3 text-right">Caixa</th><th className="px-4 py-3">Status</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {closings.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => { const d = new Date(c.period_year, c.period_month - 1); setReportMonth(d); }}>
                      <td className="px-4 py-3 font-medium">{c.period_month.toString().padStart(2, '0')}/{c.period_year}</td>
                      <td className="px-4 py-3 text-right text-emerald-600">{formatCurrency(c.total_received)}</td>
                      <td className="px-4 py-3 text-right text-red-500">{formatCurrency(c.total_paid)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(c.cash_in - c.cash_out)}</td>
                      <td className="px-4 py-3"><span className={`badge ${c.status === 'revisado' ? 'badge-success' : c.status === 'alterado' ? 'badge-warning' : 'badge-neutral'}`}>{c.status === 'revisado' ? 'Revisado' : c.status === 'alterado' ? 'Alterado' : 'Pendente'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog open={!!deleteEntry} title="Excluir conta a receber" message="Confirma a exclusão?" onConfirm={handleDeleteEntry} onCancel={() => setDeleteEntry(null)} />
      <ConfirmDialog open={!!deleteExpense} title="Excluir conta a pagar" message="Confirma a exclusão?" onConfirm={handleDeleteExpense} onCancel={() => setDeleteExpense(null)} />
    </div>
  );
}
