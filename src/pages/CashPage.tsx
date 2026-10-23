import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDateTime, todayISO, toLocalISODate } from '@/lib/utils';
import { useSettings } from '@/context/SettingsContext';
import { verifyPassword, isLockedOut, recordFailedAttempt, resetAttempts, getRemainingAttempts } from '@/lib/cashSecurity';
import { Wallet, Plus, Lock, Clock as Unlock, Trash2, Printer, CircleArrowUp as ArrowUpCircle, CircleArrowDown as ArrowDownCircle, Receipt, TrendingUp, TrendingDown } from 'lucide-react';
import type { CashRegister, CashTransaction, Client, Service, FinancialEntry } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import { Eye, EyeOff, ShieldAlert } from 'lucide-react';
import { buildPrintHTML, openPrintWindow } from '@/lib/printUtils';

const paymentMethods = ['Dinheiro', 'Pix', 'Cartão de débito', 'Cartão de crédito', 'Transferência', 'Outros'];

const quickActions = [
  { label: 'Venda de serviço', type: 'entrada', category: 'venda_servico', icon: TrendingUp },
  { label: 'Recebimento de parcela', type: 'entrada', category: 'recebimento_parcela', icon: Receipt },
  { label: 'Recebimento de sinal', type: 'entrada', category: 'recebimento_sinal', icon: Receipt },
  { label: 'Venda de produto', type: 'entrada', category: 'venda_produto', icon: TrendingUp },
  { label: 'Despesa', type: 'saida', category: 'despesa', icon: TrendingDown },
  { label: 'Pagamento de fornecedor', type: 'saida', category: 'pagamento_fornecedor', icon: TrendingDown },
  { label: 'Sangria', type: 'saida', category: 'sangria', icon: ArrowDownCircle },
  { label: 'Reforço de caixa', type: 'entrada', category: 'reforco', icon: ArrowUpCircle },
  { label: 'Ajuste autorizado', type: 'entrada', category: 'ajuste', icon: Wallet },
];

export function CashPage() {
  const { settings } = useSettings();
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [transactions, setTransactions] = useState<CashTransaction[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [pendingEntries, setPendingEntries] = useState<FinancialEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [txModal, setTxModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);
  const [historyModal, setHistoryModal] = useState<CashRegister | null>(null);
  const [historyTx, setHistoryTx] = useState<CashTransaction[]>([]);
  const [deleteTx, setDeleteTx] = useState<CashTransaction | null>(null);

  const [openForm, setOpenForm] = useState({ opening_balance: 0, responsible: '', notes: '' });
  const [txForm, setTxForm] = useState({
    type: 'entrada', category: 'venda_servico', description: '', amount: 0,
    payment_method: 'Dinheiro', client_id: '', service_id: '', document_number: '', responsible: '', observations: '',
    is_custom_service: false, custom_service_name: '', quantity: 1, financial_entry_id: '',
  });
  const [closeForm, setCloseForm] = useState({ counted_balance: 0, difference_notes: '' });
  const [passwordModal, setPasswordModal] = useState<null | 'open' | 'close'>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordShow, setPasswordShow] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordLockedMsg, setPasswordLockedMsg] = useState('');

  const currentRegister = registers.find((r) => r.status === 'aberto');
  const currentTx = transactions.filter((t) => t.cash_register_id === currentRegister?.id);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: regs } = await supabase.from('cash_registers').select('*').order('open_date', { ascending: false });
    setRegisters((regs as CashRegister[]) ?? []);
    const openReg = (regs as CashRegister[])?.find((r) => r.status === 'aberto');
    if (openReg) {
      const { data: txs } = await supabase.from('cash_transactions').select('*').eq('cash_register_id', openReg.id).order('created_at', { ascending: false });
      setTransactions((txs as CashTransaction[]) ?? []);
    } else {
      setTransactions([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.from('clients').select('*').eq('status', 'ativo').order('full_name').then(({ data }) => setClients((data as Client[]) ?? []));
    supabase.from('services').select('*').eq('active', true).order('name').then(({ data }) => setServices((data as Service[]) ?? []));
    supabase.from('financial_entries').select('*').neq('status', 'pago').order('due_date', { ascending: true }).then(({ data }) => setPendingEntries((data as FinancialEntry[]) ?? []));
  }, [load]);

  const totalIn = currentTx.filter((t) => t.type === 'entrada').reduce((s, t) => s + t.amount, 0);
  const totalOut = currentTx.filter((t) => t.type === 'saida').reduce((s, t) => s + t.amount, 0);
  const currentBalance = (currentRegister?.opening_balance ?? 0) + totalIn - totalOut;

  const logAudit = async (operation: string, registerId: string | null, responsible: string | null, success: boolean, reason: string | null) => {
    await supabase.from('cash_audit_logs').insert({ operation, cash_register_id: registerId, responsible, success, failure_reason: reason });
  };

  const verifyCashPassword = async (): Promise<boolean> => {
    if (!settings.cash_security_enabled || !settings.cash_password_hash) return true;
    const { locked, remainingMs } = isLockedOut();
    if (locked) {
      const mins = Math.ceil(remainingMs / 60000);
      setPasswordLockedMsg(`Muitas tentativas incorretas. Aguarde ${mins} minuto(s) antes de tentar novamente.`);
      return false;
    }
    if (!passwordInput) { setPasswordError('Digite a senha administrativa'); return false; }
    const ok = await verifyPassword(passwordInput, settings.cash_password_hash, settings.cash_password_salt ?? '');
    if (!ok) {
      const result = recordFailedAttempt();
      const remaining = getRemainingAttempts();
      if (result.locked) {
        setPasswordError('');
        setPasswordLockedMsg('Senha incorreta. Sistema bloqueado por 5 minutos após muitas tentativas.');
      } else {
        setPasswordError(`Senha incorreta. ${remaining} tentativa(s) restante(s).`);
      }
      return false;
    }
    resetAttempts();
    setPasswordError('');
    setPasswordLockedMsg('');
    return true;
  };

  const handlePasswordConfirm = async () => {
    const ok = await verifyCashPassword();
    if (!ok) return;
    setPasswordInput('');
    if (passwordModal === 'open') {
      await doOpenCash();
    } else if (passwordModal === 'close') {
      await doCloseCash();
    }
    setPasswordModal(null);
  };

  const handleOpenCash = async () => {
    if (currentRegister) { toast('Já existe um caixa aberto', 'warning'); return; }
    if (settings.cash_security_enabled && settings.cash_password_hash) {
      setPasswordInput(''); setPasswordError(''); setPasswordLockedMsg('');
      setPasswordModal('open');
      return;
    }
    await doOpenCash();
  };

  const doOpenCash = async () => {
    if (currentRegister) { toast('Já existe um caixa aberto', 'warning'); return; }
    const { data, error } = await supabase.from('cash_registers').insert({
      open_date: todayISO(),
      open_time: new Date().toISOString(),
      opening_balance: openForm.opening_balance,
      responsible: openForm.responsible,
      notes: openForm.notes,
      status: 'aberto',
    }).select('*').maybeSingle();
    if (error) { toast('Erro ao abrir caixa', 'error'); await logAudit('abertura', null, openForm.responsible || null, false, 'erro_banco'); return; }
    await logAudit('abertura', (data as CashRegister)?.id ?? null, openForm.responsible || null, true, null);
    toast('Caixa aberto', 'success');
    setOpenModal(false);
    setOpenForm({ opening_balance: 0, responsible: '', notes: '' });
    load();
  };

  const handleCloseCash = async () => {
    if (!currentRegister) return;
    if (settings.cash_security_enabled && settings.cash_password_hash) {
      setPasswordInput(''); setPasswordError(''); setPasswordLockedMsg('');
      setPasswordModal('close');
      return;
    }
    await doCloseCash();
  };

  const doCloseCash = async () => {
    if (!currentRegister) return;
    const expected = currentRegister.opening_balance + totalIn - totalOut;
    const difference = closeForm.counted_balance - expected;
    const { error } = await supabase.from('cash_registers').update({
      close_time: new Date().toISOString(),
      counted_balance: closeForm.counted_balance,
      difference,
      difference_notes: closeForm.difference_notes,
      total_in: totalIn,
      total_out: totalOut,
      status: 'fechado',
    }).eq('id', currentRegister.id);
    if (error) { toast('Erro ao fechar caixa', 'error'); await logAudit('fechamento', currentRegister.id, currentRegister.responsible || null, false, 'erro_banco'); return; }
    await logAudit('fechamento', currentRegister.id, currentRegister.responsible || null, true, null);
    toast('Caixa fechado', 'success');
    setCloseModal(false);
    setCloseForm({ counted_balance: 0, difference_notes: '' });
    load();
  };

  const handleAddTx = async () => {
    if (!currentRegister) { toast('Abra o caixa primeiro', 'warning'); return; }
    if (!txForm.description || txForm.amount <= 0) { toast('Preencha descrição e valor', 'warning'); return; }

    let serviceId: string | null = null;
    if (txForm.is_custom_service && txForm.custom_service_name) {
      const { data, error } = await supabase.from('services').insert({
        code: `SRV-AVULSO-${Date.now()}`,
        name: txForm.custom_service_name,
        price: txForm.amount,
        active: false,
      }).select('*').maybeSingle();
      if (!error && data) serviceId = (data as Service).id;
    } else if (txForm.service_id) {
      serviceId = txForm.service_id;
    }

    const amount = txForm.is_custom_service ? txForm.amount * txForm.quantity : txForm.amount;

    const { error } = await supabase.from('cash_transactions').insert({
      cash_register_id: currentRegister.id,
      client_id: txForm.client_id || null,
      service_id: serviceId,
      type: txForm.type,
      category: txForm.category,
      description: txForm.description,
      amount,
      payment_method: txForm.payment_method,
      document_number: txForm.document_number || null,
      responsible: txForm.responsible || null,
      observations: txForm.observations || null,
      financial_entry_id: txForm.financial_entry_id || null,
    });
    if (error) { toast('Erro ao registrar lançamento', 'error'); return; }

    if (txForm.financial_entry_id && (txForm.category === 'recebimento_parcela' || txForm.category === 'recebimento_sinal')) {
      const entry = pendingEntries.find((e) => e.id === txForm.financial_entry_id);
      if (entry) {
        const newPaid = Math.min(entry.paid_amount + amount, entry.total_amount);
        const isPaid = newPaid >= entry.total_amount;
        await supabase.from('financial_entries').update({
          paid_amount: newPaid,
          paid_date: isPaid ? todayISO() : entry.paid_date,
          status: isPaid ? 'pago' : 'pendente',
        }).eq('id', entry.id);
      }
    }

    if (txForm.client_id) {
      await supabase.from('client_history').insert({
        client_id: txForm.client_id,
        event_type: 'pagamento',
        description: `${txForm.type === 'entrada' ? 'Entrada' : 'Saída'}: ${txForm.description} - ${formatCurrency(amount)}`,
      });
    }

    toast('Lançamento registrado', 'success');
    setTxModal(false);
    setTxForm({ type: 'entrada', category: 'venda_servico', description: '', amount: 0, payment_method: 'Dinheiro', client_id: '', service_id: '', document_number: '', responsible: '', observations: '', is_custom_service: false, custom_service_name: '', quantity: 1, financial_entry_id: '' });
    load();
  };

  const handleDeleteTx = async () => {
    if (!deleteTx) return;
    const { error } = await supabase.from('cash_transactions').delete().eq('id', deleteTx.id);
    if (error) { toast('Erro ao remover lançamento', 'error'); return; }
    await logAudit('exclusao_lancamento', deleteTx.cash_register_id, deleteTx.responsible || null, true, null);
    toast('Lançamento removido', 'success');
    setDeleteTx(null);
    load();
  };

  const quickAdd = (action: typeof quickActions[0]) => {
    setTxForm({ ...txForm, type: action.type, category: action.category, description: action.label, financial_entry_id: '' });
    setTxModal(true);
  };

  const selectFinancialEntry = (entryId: string) => {
    if (!entryId) { setTxForm({ ...txForm, financial_entry_id: '', client_id: txForm.client_id }); return; }
    const entry = pendingEntries.find((e) => e.id === entryId);
    if (entry) {
      setTxForm({ ...txForm, financial_entry_id: entryId, client_id: entry.client_id ?? txForm.client_id, description: entry.description, amount: entry.total_amount - entry.paid_amount });
    }
  };

  const expectedBalance = (currentRegister?.opening_balance ?? 0) + totalIn - totalOut;

  return (
    <div>
      <PageHeader
        title="Caixa diário"
        subtitle="Controle de entradas e saídas do dia"
        actions={
          <div className="flex gap-2">
            {currentRegister ? (
              <>
                <button onClick={() => setTxModal(true)} className="btn-primary"><Plus className="h-4 w-4" /> Novo lançamento</button>
                <button onClick={() => { setCloseForm({ counted_balance: expectedBalance, difference_notes: '' }); setCloseModal(true); }} className="btn-secondary"><Lock className="h-4 w-4" /> Fechar caixa</button>
              </>
            ) : (
              <button onClick={() => setOpenModal(true)} className="btn-primary"><Unlock className="h-4 w-4" /> Abrir caixa</button>
            )}
          </div>
        }
      />

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : (
        <>
          {/* Current cash status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="card p-5">
              <p className="text-sm text-slate-400">Saldo atual</p>
              <p className="text-2xl font-bold mt-1" style={{ color: 'var(--color-primary)' }}>{formatCurrency(currentBalance)}</p>
              <p className="text-xs text-slate-400 mt-1">{currentRegister ? `Aberto em ${formatDateTime(currentRegister.open_time)}` : 'Caixa fechado'}</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-400">Entradas do dia</p>
              <p className="text-2xl font-bold mt-1 text-emerald-600">{formatCurrency(totalIn)}</p>
              <p className="text-xs text-slate-400 mt-1">{currentTx.filter((t) => t.type === 'entrada').length} lançamento(s)</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-400">Saídas do dia</p>
              <p className="text-2xl font-bold mt-1 text-red-600">{formatCurrency(totalOut)}</p>
              <p className="text-xs text-slate-400 mt-1">{currentTx.filter((t) => t.type === 'saida').length} lançamento(s)</p>
            </div>
            <div className="card p-5">
              <p className="text-sm text-slate-400">Saldo inicial</p>
              <p className="text-2xl font-bold mt-1 text-slate-700 dark:text-slate-200">{formatCurrency(currentRegister?.opening_balance ?? 0)}</p>
              <p className="text-xs text-slate-400 mt-1">{currentRegister?.responsible ?? 'Sem responsável'}</p>
            </div>
          </div>

          {/* Quick actions */}
          {currentRegister && (
            <div className="card p-4 mb-6">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Atalhos rápidos</h3>
              <div className="flex flex-wrap gap-2">
                {quickActions.map((a) => {
                  const Icon = a.icon;
                  return (
                    <button key={a.label} onClick={() => quickAdd(a)} className={`btn-secondary text-xs ${a.type === 'entrada' ? 'text-emerald-600' : 'text-red-500'}`}>
                      <Icon className="h-3 w-3" /> {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Transactions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">Lançamentos de hoje</h3>
                </div>
                {currentTx.length === 0 ? (
                  <EmptyState icon={<Wallet className="h-10 w-10" />} title="Sem lançamentos" description={currentRegister ? "Registre a primeira movimentação do caixa." : "Abra o caixa para começar."} />
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                      <tr><th className="px-4 py-3">Hora</th><th className="px-4 py-3">Descrição</th><th className="px-4 py-3 hidden sm:table-cell">Forma</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3"></th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {currentTx.map((t) => (
                        <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-3 text-xs text-slate-400">{new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-3"><p className="font-medium text-slate-900 dark:text-slate-100">{t.description}</p><p className="text-xs text-slate-400">{t.category}</p></td>
                          <td className="px-4 py-3 text-slate-500 hidden sm:table-cell">{t.payment_method}</td>
                          <td className={`px-4 py-3 text-right font-semibold ${t.type === 'entrada' ? 'text-emerald-600' : 'text-red-500'}`}>{t.type === 'entrada' ? '+' : '-'}{formatCurrency(t.amount)}</td>
                          <td className="px-4 py-3"><button onClick={() => setDeleteTx(t)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* History */}
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Histórico de caixas</h3>
              {registers.filter((r) => r.status === 'fechado').length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">Nenhum caixa fechado ainda.</p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {registers.filter((r) => r.status === 'fechado').map((r) => (
                    <button key={r.id} onClick={async () => { setHistoryModal(r); const { data: txs } = await supabase.from('cash_transactions').select('*').eq('cash_register_id', r.id).order('created_at', { ascending: true }); setHistoryTx((txs as CashTransaction[]) ?? []); }} className="block w-full text-left card p-3 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start">
                        <div><p className="text-sm font-medium text-slate-900 dark:text-slate-100">{new Date(r.open_date).toLocaleDateString('pt-BR')}</p><p className="text-xs text-slate-400">{r.responsible ?? 'Sem responsável'}</p></div>
                        <div className="text-right"><p className="text-xs text-slate-400">Resultado</p><p className={`text-sm font-semibold ${r.difference === null || r.difference === 0 ? 'text-slate-700 dark:text-slate-300' : r.difference > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(r.total_in - r.total_out)}</p></div>
                      </div>
                      {r.difference !== null && r.difference !== 0 && <p className={`text-xs mt-1 ${r.difference > 0 ? 'text-emerald-600' : 'text-red-500'}`}>Diferença: {formatCurrency(r.difference)}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Open cash modal */}
      <Modal open={openModal} onClose={() => setOpenModal(false)} title="Abrir caixa" size="sm">
        <div className="space-y-4">
          <div className="card p-3 bg-slate-50 dark:bg-slate-800/50"><p className="text-sm text-slate-500">Data: <strong>{todayISO().split('-').reverse().join('/')}</strong></p></div>
          <div><label className="label">Valor inicial (R$)</label><input type="number" step="0.01" className="input" value={openForm.opening_balance} onChange={(e) => setOpenForm({ ...openForm, opening_balance: parseFloat(e.target.value) || 0 })} /></div>
          <div><label className="label">Responsável</label><input className="input" value={openForm.responsible} onChange={(e) => setOpenForm({ ...openForm, responsible: e.target.value })} /></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[50px]" value={openForm.notes} onChange={(e) => setOpenForm({ ...openForm, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-3"><button onClick={() => setOpenModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleOpenCash} className="btn-primary"><Unlock className="h-4 w-4" /> Abrir caixa</button></div>
        </div>
      </Modal>

      {/* Transaction modal */}
      <Modal open={txModal} onClose={() => setTxModal(false)} title="Novo lançamento" size="md">
        <div className="space-y-4">
          <div className="flex gap-2">
            <button onClick={() => setTxForm({ ...txForm, type: 'entrada' })} className={`flex-1 rounded-xl border-2 py-3 text-sm font-medium transition-all ${txForm.type === 'entrada' ? 'border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}><ArrowUpCircle className="h-5 w-5 mx-auto mb-1" /> Entrada</button>
            <button onClick={() => setTxForm({ ...txForm, type: 'saida' })} className={`flex-1 rounded-xl border-2 py-3 text-sm font-medium transition-all ${txForm.type === 'saida' ? 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-200 dark:border-slate-700 text-slate-500'}`}><ArrowDownCircle className="h-5 w-5 mx-auto mb-1" /> Saída</button>
          </div>
          <div><label className="label">Descrição *</label><input className="input" value={txForm.description} onChange={(e) => setTxForm({ ...txForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Valor (R$) *</label><input type="number" step="0.01" className="input" value={txForm.amount} onChange={(e) => setTxForm({ ...txForm, amount: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Forma de pagamento</label><select className="input" value={txForm.payment_method} onChange={(e) => setTxForm({ ...txForm, payment_method: e.target.value })}>{paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></div>
          </div>
          <div><label className="label">Cliente (opcional)</label><ClientSearchSelect clients={clients} value={txForm.client_id} onChange={(id) => setTxForm({ ...txForm, client_id: id ?? '' })} onClientCreated={(c) => setClients((prev) => [...prev, c])} /></div>
          {(txForm.category === 'recebimento_parcela' || txForm.category === 'recebimento_sinal') && pendingEntries.length > 0 && (
            <div><label className="label">Conta a receber (opcional)</label><select className="input" value={txForm.financial_entry_id} onChange={(e) => selectFinancialEntry(e.target.value)}><option value="">Sem vínculo</option>{pendingEntries.map((e) => <option key={e.id} value={e.id}>{e.description} — {formatCurrency(e.total_amount - e.paid_amount)} restante</option>)}</select></div>
          )}
          <div>
            <label className="label">Serviço (opcional)</label>
            <label className="flex items-center gap-2 mb-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={txForm.is_custom_service} onChange={(e) => setTxForm({ ...txForm, is_custom_service: e.target.checked })} className="h-4 w-4 rounded accent-teal-600" /> Serviço avulso</label>
            {txForm.is_custom_service ? (
              <input className="input" placeholder="Nome do serviço avulso" value={txForm.custom_service_name} onChange={(e) => setTxForm({ ...txForm, custom_service_name: e.target.value })} />
            ) : (
              <select className="input" value={txForm.service_id} onChange={(e) => setTxForm({ ...txForm, service_id: e.target.value })}><option value="">Sem serviço</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.price)}</option>)}</select>
            )}
          </div>
          {txForm.is_custom_service && <div><label className="label">Quantidade</label><input type="number" step="0.01" className="input" value={txForm.quantity} onChange={(e) => setTxForm({ ...txForm, quantity: parseFloat(e.target.value) || 1 })} /></div>}
          <div><label className="label">Nº do documento (opcional)</label><input className="input" value={txForm.document_number} onChange={(e) => setTxForm({ ...txForm, document_number: e.target.value })} /></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[50px]" value={txForm.observations} onChange={(e) => setTxForm({ ...txForm, observations: e.target.value })} /></div>
          {txForm.is_custom_service && txForm.quantity > 0 && txForm.amount > 0 && <div className="card p-3 bg-slate-50 dark:bg-slate-800/50"><p className="text-sm text-slate-500">Valor total: <strong style={{ color: 'var(--color-primary)' }}>{formatCurrency(txForm.amount * txForm.quantity)}</strong></p></div>}
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setTxModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleAddTx} className="btn-primary">Confirmar lançamento</button></div>
      </Modal>

      {/* Close cash modal */}
      <Modal open={closeModal} onClose={() => setCloseModal(false)} title="Fechar caixa" size="md">
        {currentRegister && (
          <div className="space-y-4">
            <div className="card p-4 bg-slate-50 dark:bg-slate-800/50">
              <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Resumo do caixa</h4>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Saldo inicial:</span><span className="font-medium">{formatCurrency(currentRegister.opening_balance)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Entradas:</span><span className="font-medium text-emerald-600">{formatCurrency(totalIn)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saídas:</span><span className="font-medium text-red-500">{formatCurrency(totalOut)}</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="font-semibold">Saldo esperado:</span><span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(expectedBalance)}</span></div>
              </div>
            </div>
            <div><label className="label">Valor contado (R$)</label><input type="number" step="0.01" className="input" value={closeForm.counted_balance} onChange={(e) => setCloseForm({ ...closeForm, counted_balance: parseFloat(e.target.value) || 0 })} /></div>
            {closeForm.counted_balance !== expectedBalance && <div className={`rounded-lg p-3 text-sm ${closeForm.counted_balance > expectedBalance ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300'}`}>Diferença: {formatCurrency(closeForm.counted_balance - expectedBalance)}</div>}
            <div><label className="label">Justificativa da diferença (se houver)</label><textarea className="input min-h-[50px]" value={closeForm.difference_notes} onChange={(e) => setCloseForm({ ...closeForm, difference_notes: e.target.value })} /></div>
            <p className="text-xs text-slate-400">Após o fechamento, não será possível alterar os lançamentos. Correções deverão ser feitas via lançamento de ajuste em um novo caixa.</p>
            <div className="flex justify-end gap-3"><button onClick={() => setCloseModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleCloseCash} className="btn-danger"><Lock className="h-4 w-4" /> Fechar caixa</button></div>
          </div>
        )}
      </Modal>

      {/* History detail modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title="Relatório de fechamento (Z-report)" size="lg">
        {historyModal && (() => {
          const byMethod = paymentMethods.map((m) => {
            const inAmt = historyTx.filter((t) => t.type === 'entrada' && t.payment_method === m).reduce((s, t) => s + t.amount, 0);
            const outAmt = historyTx.filter((t) => t.type === 'saida' && t.payment_method === m).reduce((s, t) => s + t.amount, 0);
            return { method: m, inAmt, outAmt, net: inAmt - outAmt };
          }).filter((m) => m.inAmt > 0 || m.outAmt > 0);
          const printZReport = () => {
            const printArea = document.getElementById('printable-cash');
            if (!printArea) { window.print(); return; }
            const html = buildPrintHTML('Z-Report', printArea.innerHTML, settings);
            openPrintWindow(html);
          };
          return (
          <div className="space-y-4" id="printable-cash">
            <div className="card p-4 bg-slate-50 dark:bg-slate-800/50">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-3">Z-Report — Fechamento de Caixa</h4>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-slate-400 block text-xs">Data</span><span className="font-medium">{new Date(historyModal.open_date).toLocaleDateString('pt-BR')}</span></div>
                <div><span className="text-slate-400 block text-xs">Responsável</span><span className="font-medium">{historyModal.responsible ?? '—'}</span></div>
                <div><span className="text-slate-400 block text-xs">Abertura</span><span className="font-medium">{formatDateTime(historyModal.open_time)}</span></div>
                <div><span className="text-slate-400 block text-xs">Fechamento</span><span className="font-medium">{formatDateTime(historyModal.close_time)}</span></div>
              </div>
            </div>
            <div className="card p-4">
              <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Resumo financeiro</h5>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Saldo inicial:</span><span>{formatCurrency(historyModal.opening_balance)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Entradas:</span><span className="text-emerald-600">{formatCurrency(historyModal.total_in)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Saídas:</span><span className="text-red-500">{formatCurrency(historyModal.total_out)}</span></div>
                <div className="flex justify-between border-t border-slate-200 dark:border-slate-700 pt-2"><span className="font-semibold">Saldo final:</span><span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(historyModal.opening_balance + historyModal.total_in - historyModal.total_out)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Valor contado:</span><span className="font-medium">{formatCurrency(historyModal.counted_balance ?? 0)}</span></div>
                {historyModal.difference !== null && historyModal.difference !== 0 && <div className="flex justify-between"><span className="text-slate-500">Diferença:</span><span className={historyModal.difference > 0 ? 'text-emerald-600' : 'text-red-500'}>{formatCurrency(historyModal.difference)}</span></div>}
                {historyModal.difference_notes && <p className="text-xs text-slate-400 mt-2">{historyModal.difference_notes}</p>}
              </div>
            </div>
            {byMethod.length > 0 && (
              <div className="card p-4">
                <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Detalhamento por forma de pagamento</h5>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-slate-400"><tr><th className="pb-2">Forma</th><th className="pb-2 text-right">Entradas</th><th className="pb-2 text-right">Saídas</th><th className="pb-2 text-right">Líquido</th></tr></thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {byMethod.map((m) => (
                      <tr key={m.method}><td className="py-2">{m.method}</td><td className="py-2 text-right text-emerald-600">{formatCurrency(m.inAmt)}</td><td className="py-2 text-right text-red-500">{formatCurrency(m.outAmt)}</td><td className="py-2 text-right font-medium">{formatCurrency(m.net)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {historyTx.length > 0 && (
              <div className="card p-4">
                <h5 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Lançamentos do período ({historyTx.length})</h5>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {historyTx.map((t) => (
                    <div key={t.id} className="flex items-center justify-between text-xs border-b border-slate-100 dark:border-slate-700 pb-1">
                      <div><span className="text-slate-400">{new Date(t.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span> <span className="text-slate-700 dark:text-slate-300">{t.description}</span></div>
                      <span className={t.type === 'entrada' ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>{t.type === 'entrada' ? '+' : '-'}{formatCurrency(t.amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button onClick={printZReport} className="btn-secondary w-full justify-center"><Printer className="h-4 w-4" /> Imprimir Z-report</button>
          </div>
          );
        })()}
      </Modal>

      <ConfirmDialog open={!!deleteTx} title="Remover lançamento" message="Confirma a remoção deste lançamento do caixa?" onConfirm={handleDeleteTx} onCancel={() => setDeleteTx(null)} />

      <Modal open={!!passwordModal} onClose={() => { setPasswordModal(null); setPasswordInput(''); setPasswordError(''); }} title="Autorização administrativa" size="sm">
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3">
            <ShieldAlert className="h-5 w-5 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300">Digite a senha administrativa para {passwordModal === 'open' ? 'abrir' : 'fechar'} o caixa.</p>
          </div>
          {passwordLockedMsg && <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-sm text-red-700 dark:text-red-300">{passwordLockedMsg}</div>}
          <div>
            <label className="label">Senha *</label>
            <div className="relative">
              <input type={passwordShow ? 'text' : 'password'} className="input pr-10" placeholder="Senha administrativa" value={passwordInput} onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') handlePasswordConfirm(); }} />
              <button type="button" onClick={() => setPasswordShow(!passwordShow)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">{passwordShow ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
            </div>
            {passwordError && <p className="mt-1 text-sm text-red-600">{passwordError}</p>}
          </div>
          <div className="flex justify-end gap-3">
            <button onClick={() => { setPasswordModal(null); setPasswordInput(''); setPasswordError(''); }} className="btn-secondary">Cancelar</button>
            <button onClick={handlePasswordConfirm} className="btn-primary"><Lock className="h-4 w-4" /> Confirmar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
