import { useState, useRef, useEffect } from 'react';
import { Search, User, X, ChevronDown, UserPlus, Loader as Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from '@/components/Toast';
import { Modal } from '@/components/Modal';
import { toLocalISODate } from '@/lib/utils';
import type { Client } from '@/lib/types';

interface ClientSearchSelectProps {
  clients: Client[];
  value: string | null | undefined;
  onChange: (clientId: string | null) => void;
  placeholder?: string;
  required?: boolean;
  allowEmpty?: boolean;
  emptyLabel?: string;
  onOpenClient?: (clientId: string) => void;
  onClientCreated?: (client: Client) => void;
}

interface QuickForm {
  full_name: string;
  birth_date: string;
  phone: string;
  cpf: string;
  cnpj: string;
  email: string;
}

const emptyQuickForm: QuickForm = {
  full_name: '',
  birth_date: '',
  phone: '',
  cpf: '',
  cnpj: '',
  email: '',
};

export function ClientSearchSelect({
  clients,
  value,
  onChange,
  placeholder = 'Buscar cliente por nome, CPF ou telefone...',
  required = false,
  allowEmpty = true,
  emptyLabel = 'Sem cliente',
  onOpenClient,
  onClientCreated,
}: ClientSearchSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  // Quick create modal state
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickForm, setQuickForm] = useState<QuickForm>(emptyQuickForm);
  const [quickSaving, setQuickSaving] = useState(false);
  const [dupeMatches, setDupeMatches] = useState<Client[]>([]);
  const [dupeOpen, setDupeOpen] = useState(false);
  const [savedClientId, setSavedClientId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const selected = clients.find((c) => c.id === value) ?? null;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (quickOpen) {
      setQuickForm(emptyQuickForm);
      setDupeMatches([]);
      setDupeOpen(false);
      setSavedClientId(null);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [quickOpen]);

  const filtered = clients.filter((c) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.cpf ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q) ||
      (c.whatsapp ?? '').toLowerCase().includes(q)
    );
  });

  const handleSelect = (clientId: string | null) => {
    onChange(clientId);
    setOpen(false);
    setQuery('');
  };

  const checkQuickDuplicates = async (): Promise<Client[]> => {
    if (!quickForm.full_name.trim()) return [];
    const conditions: string[] = [];
    const name = quickForm.full_name.trim().toLowerCase();
    conditions.push(`full_name.ilike.%${name}%`);
    if (quickForm.cpf.trim()) {
      const clean = quickForm.cpf.replace(/\D/g, '');
      if (clean) conditions.push(`cpf.eq.${clean}`);
    }
    if (quickForm.cnpj.trim()) {
      const clean = quickForm.cnpj.replace(/\D/g, '');
      if (clean) conditions.push(`cnpj.eq.${clean}`);
    }
    if (quickForm.phone.trim()) {
      conditions.push(`phone.eq.${quickForm.phone.trim()}`);
    }
    if (quickForm.email.trim()) {
      conditions.push(`email.eq.${quickForm.email.trim()}`);
    }
    const { data } = await supabase.from('clients').select('*').or(conditions.join(','));
    return (data as Client[]) ?? [];
  };

  const generateClientCode = async (): Promise<string> => {
    const { data } = await supabase.from('clients').select('code').order('code', { ascending: false }).limit(1);
    const lastCode = (data as { code: string }[] | null)?.[0]?.code;
    if (lastCode) {
      const num = parseInt(lastCode.replace(/\D/g, ''), 10);
      if (!isNaN(num)) return `CLI-${String(num + 1).padStart(4, '0')}`;
    }
    const { count } = await supabase.from('clients').select('id', { count: 'exact', head: true });
    return `CLI-${String((count ?? 0) + 1).padStart(4, '0')}`;
  };

  const performQuickSave = async (): Promise<void> => {
    if (!quickForm.full_name.trim()) {
      toast('Informe o nome completo do cliente.', 'warning');
      nameInputRef.current?.focus();
      return;
    }
    if (quickForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(quickForm.email)) {
      toast('O e-mail informado não é válido.', 'warning');
      return;
    }
    if (quickForm.cpf && quickForm.cpf.replace(/\D/g, '').length !== 11) {
      toast('O CPF deve conter 11 dígitos.', 'warning');
      return;
    }
    if (quickForm.cnpj && quickForm.cnpj.replace(/\D/g, '').length !== 14) {
      toast('O CNPJ deve conter 14 dígitos.', 'warning');
      return;
    }

    setQuickSaving(true);
    try {
      const code = await generateClientCode();
      const isJuridica = !!quickForm.cnpj.trim();
      const payload: Record<string, unknown> = {
        code,
        person_type: isJuridica ? 'juridica' : 'fisica',
        full_name: quickForm.full_name.trim(),
        cpf: quickForm.cpf.trim() || null,
        cnpj: quickForm.cnpj.trim() || null,
        phone: quickForm.phone.trim() || null,
        whatsapp: null,
        email: quickForm.email.trim() || null,
        birth_date: quickForm.birth_date || null,
        status: 'ativo',
        first_contact: toLocalISODate(new Date()),
      };

      const { data, error } = await supabase.from('clients').insert(payload).select('*').maybeSingle();
      if (error || !data) {
        toast('Erro ao cadastrar cliente. Verifique os dados.', 'error');
        return;
      }

      const newClient = data as Client;
      await supabase.from('client_history').insert({
        client_id: newClient.id,
        event_type: 'cadastro',
        description: 'Cliente cadastrado via cadastro rápido',
      });

      setSavedClientId(newClient.id);
      toast(`Cliente "${newClient.full_name}" cadastrado com sucesso.`, 'success');

      if (onClientCreated) onClientCreated(newClient);
      onChange(newClient.id);
    } catch {
      toast('Erro ao cadastrar cliente. Tente novamente.', 'error');
    } finally {
      setQuickSaving(false);
    }
  };

  const handleQuickSave = async () => {
    if (!quickForm.full_name.trim()) {
      toast('Informe o nome completo do cliente.', 'warning');
      nameInputRef.current?.focus();
      return;
    }
    const dupes = await checkQuickDuplicates();
    if (dupes.length > 0) {
      setDupeMatches(dupes);
      setDupeOpen(true);
      return;
    }
    performQuickSave();
  };

  const handleSaveAfterDupe = () => {
    setDupeOpen(false);
    performQuickSave();
  };

  const handleQuickKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !quickSaving && !dupeOpen) {
      e.preventDefault();
      handleQuickSave();
    }
  };

  const handleConcluir = () => {
    setQuickOpen(false);
    setOpen(false);
  };

  const handleCadastrarOutro = () => {
    setQuickForm(emptyQuickForm);
    setDupeMatches([]);
    setDupeOpen(false);
    setSavedClientId(null);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  return (
    <div ref={ref} className="relative">
      {selected ? (
        <div className="flex items-center gap-2 input cursor-pointer" onClick={() => setOpen(!open)}>
          <User className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{selected.full_name}</p>
            {(selected.cpf || selected.phone) && (
              <p className="text-xs text-slate-400 truncate">
                {[selected.cpf, selected.phone].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {onOpenClient && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onOpenClient(selected.id); }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Abrir cadastro"
              >
                <User className="h-4 w-4" />
              </button>
            )}
            {allowEmpty && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSelect(null); }}
                className="text-slate-400 hover:text-red-500"
                title="Remover"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`input flex items-center gap-2 text-left ${required && !selected ? 'ring-2 ring-amber-300' : ''}`}
        >
          <Search className="h-4 w-4 text-slate-400 flex-shrink-0" />
          <span className="text-sm text-slate-400">{required ? 'Selecione um cliente...' : emptyLabel}</span>
          <ChevronDown className="h-4 w-4 text-slate-400 ml-auto" />
        </button>
      )}

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg max-h-72 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                className="input pl-9 py-1.5 text-sm"
                placeholder={placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && filtered.length > 0) {
                    handleSelect(filtered[0].id);
                  } else if (e.key === 'Escape') {
                    setOpen(false);
                    setQuery('');
                  }
                }}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {allowEmpty && (
              <button
                type="button"
                onClick={() => handleSelect(null)}
                className="w-full px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50"
              >
                {emptyLabel}
              </button>
            )}
            {filtered.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <p className="text-sm text-slate-400 mb-2">Nenhum cliente encontrado</p>
              </div>
            ) : (
              filtered.slice(0, 50).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelect(c.id)}
                  className="w-full px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{c.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {[c.cpf, c.phone, c.whatsapp].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                  </p>
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 dark:border-slate-700 p-2">
            <button
              type="button"
              onClick={() => setQuickOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 transition-colors"
            >
              <UserPlus className="h-4 w-4" /> + Novo Cliente
            </button>
          </div>
        </div>
      )}

      {/* Quick create modal */}
      <Modal
        open={quickOpen}
        onClose={() => quickSaving ? undefined : setQuickOpen(false)}
        title="Cadastro rápido de cliente"
        size="sm"
      >
        <div className="space-y-4" onKeyDown={handleQuickKeyDown}>
          {savedClientId ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 p-4 text-center">
                <p className="text-emerald-700 dark:text-emerald-300 font-medium">Cliente cadastrado com sucesso!</p>
                <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1">
                  O cliente já está disponível para seleção.
                </p>
              </div>
              <div className="flex justify-center gap-3">
                <button onClick={handleCadastrarOutro} className="btn-secondary">
                  <UserPlus className="h-4 w-4" /> Cadastrar outro
                </button>
                <button onClick={handleConcluir} className="btn-primary">
                  Concluir
                </button>
              </div>
            </div>
          ) : dupeOpen ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
                <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
                  Possível duplicidade encontrada
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-3">
                  Já existe(m) cliente(s) com dados semelhantes. Revise antes de continuar.
                </p>
                <div className="space-y-1.5">
                  {dupeMatches.map((d) => (
                    <div key={d.id} className="flex items-center justify-between text-xs card p-2 bg-white dark:bg-slate-900">
                      <div>
                        <span className="font-mono text-slate-400">{d.code}</span>
                        <span className="font-medium ml-2">{d.full_name}</span>
                      </div>
                      <div className="text-slate-400">
                        {[d.cpf, d.phone, d.email].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setDupeOpen(false)} disabled={quickSaving} className="btn-secondary">
                  Voltar e editar
                </button>
                <button onClick={handleSaveAfterDupe} disabled={quickSaving} className="btn-primary">
                  Cadastrar mesmo assim
                </button>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="label">Nome completo *</label>
                <input
                  ref={nameInputRef}
                  className="input"
                  placeholder="Nome do cliente"
                  value={quickForm.full_name}
                  onChange={(e) => setQuickForm({ ...quickForm, full_name: e.target.value })}
                  disabled={quickSaving}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Data de nascimento</label>
                  <input
                    type="date"
                    className="input"
                    value={quickForm.birth_date}
                    onChange={(e) => setQuickForm({ ...quickForm, birth_date: e.target.value })}
                    disabled={quickSaving}
                  />
                </div>
                <div>
                  <label className="label">Telefone / WhatsApp</label>
                  <input
                    className="input"
                    placeholder="(11) 99999-9999"
                    value={quickForm.phone}
                    onChange={(e) => setQuickForm({ ...quickForm, phone: e.target.value })}
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">CPF</label>
                  <input
                    className="input"
                    placeholder="000.000.000-00"
                    value={quickForm.cpf}
                    onChange={(e) => setQuickForm({ ...quickForm, cpf: e.target.value })}
                    disabled={quickSaving}
                  />
                </div>
                <div>
                  <label className="label">CNPJ</label>
                  <input
                    className="input"
                    placeholder="00.000.000/0000-00"
                    value={quickForm.cnpj}
                    onChange={(e) => setQuickForm({ ...quickForm, cnpj: e.target.value })}
                    disabled={quickSaving}
                  />
                </div>
              </div>
              <div>
                <label className="label">E-mail</label>
                <input
                  className="input"
                  type="email"
                  placeholder="email@exemplo.com"
                  value={quickForm.email}
                  onChange={(e) => setQuickForm({ ...quickForm, email: e.target.value })}
                  disabled={quickSaving}
                />
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-500 dark:text-slate-400">
                <p>Apenas o nome é obrigatório. Os demais dados podem ser preenchidos depois na tela de clientes.</p>
              </div>
              {quickSaving && (
                <div className="rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-800 p-3 flex items-center gap-2 text-sm text-sky-700 dark:text-sky-300">
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando cliente...
                </div>
              )}
              <div className="flex justify-end gap-3">
                <button onClick={() => setQuickOpen(false)} disabled={quickSaving} className="btn-secondary">
                  Cancelar
                </button>
                <button
                  onClick={handleQuickSave}
                  disabled={quickSaving || !quickForm.full_name.trim()}
                  className="btn-primary"
                >
                  <UserPlus className="h-4 w-4" /> {quickSaving ? 'Salvando...' : 'Salvar cliente'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
