import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { buildWhatsAppUrl } from '@/lib/utils';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Eye,
  Power,
  Truck,
  MessageCircle,
  Phone,
  Mail,
  Globe,
} from 'lucide-react';
import type { Supplier } from '@/lib/types';

const emptyForm: Partial<Supplier> = {
  name: '',
  category: '',
  contact_person: '',
  phone: '',
  email: '',
  whatsapp: '',
  website: '',
  cnpj: '',
  address: '',
  city: '',
  state: '',
  observations: '',
  active: true,
};

export function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<Partial<Supplier>>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [viewTarget, setViewTarget] = useState<Supplier | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('suppliers').select('*').order('name');
    if (!showInactive) query = query.eq('active', true);
    const { data } = await query;
    setSuppliers((data as Supplier[]) ?? []);
    setLoading(false);
  }, [showInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const categories = Array.from(
    new Set(suppliers.map((s) => s.category).filter(Boolean) as string[])
  ).sort();

  const filtered = suppliers.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      (s.contact_person ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (s.cnpj ?? '').includes(search);
    const matchesCategory = !filterCategory || s.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (s: Supplier) => {
    setEditing(s);
    setForm(s);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) {
      toast('Preencha o nome do fornecedor', 'warning');
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from('suppliers')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) {
        toast('Erro ao atualizar fornecedor', 'error');
        return;
      }
      toast('Fornecedor atualizado', 'success');
    } else {
      const { error } = await supabase.from('suppliers').insert(form);
      if (error) {
        toast('Erro ao cadastrar fornecedor', 'error');
        return;
      }
      toast('Fornecedor cadastrado', 'success');
    }
    setModalOpen(false);
    load();
  };

  const handleToggleActive = async (s: Supplier) => {
    const { error } = await supabase
      .from('suppliers')
      .update({ active: !s.active, updated_at: new Date().toISOString() })
      .eq('id', s.id);
    if (error) {
      toast('Erro ao alterar status', 'error');
      return;
    }
    toast(s.active ? 'Fornecedor inativado' : 'Fornecedor ativado', 'success');
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', deleteTarget.id);
    if (error) {
      toast('Erro ao excluir fornecedor', 'error');
      return;
    }
    toast('Fornecedor excluído', 'success');
    setDeleteTarget(null);
    load();
  };

  const sendWhatsapp = (s: Supplier) => {
    const phone = s.whatsapp || s.phone || '';
    if (!phone) {
      toast('Fornecedor sem telefone/WhatsApp cadastrado', 'warning');
      return;
    }
    const msg = `Olá ${s.contact_person || s.name}, aqui é do estúdio fotográfico. Gostaria de falar sobre um pedido.`;
    window.open(buildWhatsAppUrl(phone, msg), '_blank');
  };

  return (
    <div>
      <PageHeader
        title="Fornecedores"
        subtitle="Gestão de fornecedores: álbuns, impressões, equipamentos e mais"
        actions={
          <button onClick={openNew} className="btn-primary">
            <Plus className="h-4 w-4" /> Novo fornecedor
          </button>
        }
      />

      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Pesquisar por nome, contato ou CNPJ..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            className="input sm:w-56"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="h-4 w-4 rounded accent-teal-600"
            />
            Mostrar inativos
          </label>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-12 w-12" />}
          title="Nenhum fornecedor cadastrado"
          description="Cadastre fornecedores de álbuns, impressões, equipamentos e outros serviços."
          action={
            <button onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Cadastrar fornecedor
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div key={s.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {s.name}
                  </h3>
                  {s.category && (
                    <span className="badge badge-neutral mt-1">{s.category}</span>
                  )}
                </div>
                <span className={`badge ${s.active ? 'badge-success' : 'badge-danger'}`}>
                  {s.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              {s.contact_person && (
                <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                  Contato: {s.contact_person}
                </p>
              )}

              <div className="mt-3 flex flex-col gap-1 text-xs text-slate-500 dark:text-slate-400">
                {s.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" /> {s.phone}
                  </span>
                )}
                {s.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> {s.email}
                  </span>
                )}
                {s.website && (
                  <span className="flex items-center gap-1.5">
                    <Globe className="h-3.5 w-3.5" /> {s.website}
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                <button
                  onClick={() => setViewTarget(s)}
                  className="btn-ghost text-xs"
                  title="Visualizar"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => openEdit(s)}
                  className="btn-ghost text-xs"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => sendWhatsapp(s)}
                  className="btn-ghost text-xs"
                  title="Enviar WhatsApp"
                >
                  <MessageCircle className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleToggleActive(s)}
                  className="btn-ghost text-xs"
                  title={s.active ? 'Inativar' : 'Ativar'}
                >
                  <Power className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(s)}
                  className="btn-ghost text-xs text-red-500 hover:text-red-600"
                  title="Excluir"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar fornecedor' : 'Novo fornecedor'}
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Nome / Empresa *</label>
            <input
              className="input"
              value={form.name ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Categoria</label>
            <input
              className="input"
              placeholder="Ex: álbum, impressão, equipamento..."
              value={form.category ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </div>
          <div>
            <label className="label">CNPJ</label>
            <input
              className="input"
              value={form.cnpj ?? ''}
              onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Pessoa de contato</label>
            <input
              className="input"
              value={form.contact_person ?? ''}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Telefone</label>
            <input
              className="input"
              value={form.phone ?? ''}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="label">WhatsApp</label>
            <input
              className="input"
              value={form.whatsapp ?? ''}
              onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
            />
          </div>
          <div>
            <label className="label">E-mail</label>
            <input
              className="input"
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Website</label>
            <input
              className="input"
              value={form.website ?? ''}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Endereço</label>
            <input
              className="input"
              value={form.address ?? ''}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input
              className="input"
              value={form.city ?? ''}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Estado</label>
            <input
              className="input"
              maxLength={2}
              value={form.state ?? ''}
              onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Observações</label>
            <textarea
              className="input min-h-[60px]"
              value={form.observations ?? ''}
              onChange={(e) => setForm({ ...form, observations: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.active ?? true}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="h-5 w-5 rounded accent-teal-600"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                Fornecedor ativo
              </span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={handleSave} className="btn-primary">
            {editing ? 'Salvar alterações' : 'Cadastrar fornecedor'}
          </button>
        </div>
      </Modal>

      <Modal
        open={!!viewTarget}
        onClose={() => setViewTarget(null)}
        title="Detalhes do fornecedor"
        size="md"
      >
        {viewTarget && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">Nome:</span>
              <span className="font-medium">{viewTarget.name}</span>
            </div>
            {viewTarget.category && (
              <div className="flex justify-between">
                <span className="text-slate-400">Categoria:</span>
                <span className="font-medium">{viewTarget.category}</span>
              </div>
            )}
            {viewTarget.cnpj && (
              <div className="flex justify-between">
                <span className="text-slate-400">CNPJ:</span>
                <span className="font-medium">{viewTarget.cnpj}</span>
              </div>
            )}
            {viewTarget.contact_person && (
              <div className="flex justify-between">
                <span className="text-slate-400">Contato:</span>
                <span className="font-medium">{viewTarget.contact_person}</span>
              </div>
            )}
            {viewTarget.phone && (
              <div className="flex justify-between">
                <span className="text-slate-400">Telefone:</span>
                <span className="font-medium">{viewTarget.phone}</span>
              </div>
            )}
            {viewTarget.whatsapp && (
              <div className="flex justify-between">
                <span className="text-slate-400">WhatsApp:</span>
                <span className="font-medium">{viewTarget.whatsapp}</span>
              </div>
            )}
            {viewTarget.email && (
              <div className="flex justify-between">
                <span className="text-slate-400">E-mail:</span>
                <span className="font-medium">{viewTarget.email}</span>
              </div>
            )}
            {viewTarget.website && (
              <div className="flex justify-between">
                <span className="text-slate-400">Website:</span>
                <span className="font-medium">{viewTarget.website}</span>
              </div>
            )}
            {viewTarget.address && (
              <div className="flex justify-between">
                <span className="text-slate-400">Endereço:</span>
                <span className="font-medium">
                  {viewTarget.address}
                  {viewTarget.city && `, ${viewTarget.city}`}
                  {viewTarget.state && ` - ${viewTarget.state}`}
                </span>
              </div>
            )}
            {viewTarget.observations && (
              <div>
                <span className="text-slate-400 block mb-1">Observações:</span>
                <p className="text-slate-700 dark:text-slate-300">
                  {viewTarget.observations}
                </p>
              </div>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir fornecedor"
        message={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
