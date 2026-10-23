import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { formatDate, todayISO } from '@/lib/utils';
import { Plus, Pencil, Trash2, User, Mail, Phone, BadgeCheck } from 'lucide-react';
import type { Professional } from '@/lib/types';

export function ProfessionalsPage() {
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Professional | null>(null);
  const [search, setSearch] = useState('');

  const [form, setForm] = useState({
    name: '', role: '', email: '', phone: '', document: '',
    hire_date: '', is_active: true, notes: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('professionals').select('*').order('name');
    if (error) { toast('Erro ao carregar profissionais', 'error'); setLoading(false); return; }
    setProfessionals((data as Professional[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = professionals.filter(p =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.role ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', role: '', email: '', phone: '', document: '', hire_date: '', is_active: true, notes: '' });
    setModalOpen(true);
  };

  const openEdit = (p: Professional) => {
    setEditing(p);
    setForm({
      name: p.name, role: p.role ?? '', email: p.email ?? '', phone: p.phone ?? '',
      document: p.document ?? '', hire_date: p.hire_date ?? '', is_active: p.is_active, notes: p.notes ?? '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast('Informe o nome', 'warning'); return; }
    const payload = {
      name: form.name, role: form.role || null, email: form.email || null,
      phone: form.phone || null, document: form.document || null,
      hire_date: form.hire_date || null, is_active: form.is_active,
      notes: form.notes || null, updated_at: new Date().toISOString(),
    };
    if (editing) {
      const { error } = await supabase.from('professionals').update(payload).eq('id', editing.id);
      if (error) { toast('Erro ao atualizar', 'error'); return; }
      toast('Profissional atualizado', 'success');
    } else {
      const { error } = await supabase.from('professionals').insert(payload);
      if (error) { toast('Erro ao criar', 'error'); return; }
      toast('Profissional criado', 'success');
    }
    setModalOpen(false);
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('professionals').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir', 'error'); return; }
    toast('Profissional excluído', 'success');
    setDeleteTarget(null);
    load();
  };

  const activeCount = professionals.filter(p => p.is_active).length;

  return (
    <div>
      <PageHeader title="Profissionais" subtitle="Cadastro de funcionários e parceiros do estúdio" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5"><div className="flex items-center gap-2"><User className="h-4 w-4 text-sky-500" /><p className="text-sm text-slate-400">Total</p></div><p className="text-2xl font-bold mt-1">{professionals.length}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><BadgeCheck className="h-4 w-4 text-emerald-500" /><p className="text-sm text-slate-400">Ativos</p></div><p className="text-2xl font-bold mt-1 text-emerald-600">{activeCount}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><User className="h-4 w-4 text-amber-500" /><p className="text-sm text-slate-400">Inativos</p></div><p className="text-2xl font-bold mt-1 text-amber-600">{professionals.length - activeCount}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><Mail className="h-4 w-4 text-violet-500" /><p className="text-sm text-slate-400">Com e-mail</p></div><p className="text-2xl font-bold mt-1">{professionals.filter(p => p.email).length}</p></div>
      </div>

      <div className="flex items-center justify-between gap-4 mb-4">
        <input className="input max-w-xs" placeholder="Buscar por nome ou função..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Novo profissional</button>
      </div>

      {loading ? <div className="py-20 text-center text-slate-400">Carregando...</div> : (
        filtered.length === 0 ? (
          <div className="card p-8 text-center text-slate-400">
            <User className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Nenhum profissional cadastrado.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3 hidden md:table-cell">Função</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Contato</th>
                  <th className="px-4 py-3 hidden lg:table-cell">Admissão</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {filtered.map((p) => (
                  <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!p.is_active ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{p.name}</p>
                      {p.document && <p className="text-xs text-slate-400">CPF: {p.document}</p>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{p.role ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      {p.email && <p className="text-xs text-slate-400 flex items-center gap-1"><Mail className="h-3 w-3" /> {p.email}</p>}
                      {p.phone && <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> {p.phone}</p>}
                      {!p.email && !p.phone && '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 hidden lg:table-cell">{p.hire_date ? formatDate(p.hire_date) : '—'}</td>
                    <td className="px-4 py-3"><span className={`badge ${p.is_active ? 'badge-success' : 'badge-neutral'}`}>{p.is_active ? 'Ativo' : 'Inativo'}</span></td>
                    <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(p)} className="btn-ghost"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => setDeleteTarget(p)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar profissional' : 'Novo profissional'} size="md">
        <div className="space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Função</label><input className="input" placeholder="Fotógrafo, maquiador..." value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
            <div><label className="label">CPF</label><input className="input" value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">E-mail</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="label">Telefone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div><label className="label">Data de admissão</label><input type="date" className="input" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} /></div>
          <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Ativo</label>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button><button onClick={handleSave} className="btn-primary">{editing ? 'Salvar' : 'Criar'}</button></div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title="Excluir profissional" message="Confirma a exclusão? Comissões e agendamentos vinculados não serão afetados (o vínculo será removido)." onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
    </div>
  );
}
