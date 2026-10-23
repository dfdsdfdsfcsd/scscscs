import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { calculatePricing, round2, type PricingInput, type PricingResult } from '@/lib/pricing';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  Camera,
  Copy,
  Eye,
  Power,
  FolderPlus,
  X,
  Calculator,
  TrendingUp,
  Percent,
} from 'lucide-react';
import type { Service, ServiceCategory } from '@/lib/types';
import { useSaving } from '@/lib/useSaving';

const emptyForm: Partial<Service> = {
  code: '',
  name: '',
  category: '',
  description: '',
  price: 0,
  cost: 0,
  duration_min: 60,
  unit: 'única',
  active: true,
  observations: '',
  payment_conditions: '',
  delivery_days: undefined,
};

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [categories, setCategories] = useState<ServiceCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<Partial<Service>>(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState<Service | null>(null);
  const [viewTarget, setViewTarget] = useState<Service | null>(null);
  const [catModalOpen, setCatModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [calcTarget, setCalcTarget] = useState<Service | null>(null);
  const [calcInput, setCalcInput] = useState<PricingInput>({ baseCost: 0, materialsCost: 0, printingCost: 0, commissionPercent: 0, otherCosts: 0, sellingPrice: 0, discountPercent: 0 });
  const { saving, withSaving } = useSaving();

  const loadServices = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('services').select('*').order('name');
    if (!showInactive) query = query.eq('active', true);
    const { data } = await query;
    setServices((data as Service[]) ?? []);
    setLoading(false);
  }, [showInactive]);

  const loadCategories = useCallback(async () => {
    const { data } = await supabase.from('service_categories').select('*').order('name');
    setCategories((data as ServiceCategory[]) ?? []);
  }, []);

  useEffect(() => {
    loadServices();
    loadCategories();
  }, [loadServices, loadCategories]);

  const filtered = services.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.code.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || s.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, code: `SRV-${String(services.length + 1).padStart(3, '0')}` });
    setModalOpen(true);
  };

  const openEdit = (s: Service) => {
    setEditing(s);
    setForm(s);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.code) {
      toast('Preencha nome e código do serviço', 'warning');
      return;
    }
    return withSaving(async () => {
    if (editing) {
      const { error } = await supabase
        .from('services')
        .update({ ...form, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) {
        toast('Erro ao atualizar serviço', 'error');
        return;
      }
      toast('Serviço atualizado', 'success');
    } else {
      const { error } = await supabase.from('services').insert(form);
      if (error) {
        toast('Erro ao cadastrar serviço', 'error');
        return;
      }
      toast('Serviço cadastrado', 'success');
    }
    setModalOpen(false);
    loadServices();
    });
  };

  const handleDuplicate = async (s: Service) => {
    const { id, created_at, updated_at, ...rest } = s;
    void id; void created_at; void updated_at;
    const { error } = await supabase.from('services').insert({
      ...rest,
      code: `${s.code}-copia`,
      name: `${s.name} (cópia)`,
    });
    if (error) {
      toast('Erro ao duplicar serviço', 'error');
      return;
    }
    toast('Serviço duplicado', 'success');
    loadServices();
  };

  const handleToggleActive = async (s: Service) => {
    const { error } = await supabase.from('services').update({ active: !s.active, updated_at: new Date().toISOString() }).eq('id', s.id);
    if (error) {
      toast('Erro ao alterar status', 'error');
      return;
    }
    toast(s.active ? 'Serviço inativado' : 'Serviço ativado', 'success');
    loadServices();
  };

  const handleAddCategory = async () => {
    if (!newCategory.trim()) {
      toast('Digite o nome da categoria', 'warning');
      return;
    }
    const exists = categories.some((c) => c.name.toLowerCase() === newCategory.trim().toLowerCase());
    if (exists) {
      toast('Esta categoria já existe', 'warning');
      return;
    }
    const { error } = await supabase.from('service_categories').insert({ name: newCategory.trim() });
    if (error) {
      toast('Erro ao criar categoria', 'error');
      return;
    }
    toast('Categoria criada', 'success');
    setNewCategory('');
    loadCategories();
  };

  const handleDeleteCategory = async (cat: ServiceCategory) => {
    const inUse = services.some((s) => s.category === cat.name);
    if (inUse) {
      toast('Esta categoria está em uso por serviços e não pode ser excluída', 'warning');
      return;
    }
    const { error } = await supabase.from('service_categories').delete().eq('id', cat.id);
    if (error) {
      toast('Erro ao excluir categoria', 'error');
      return;
    }
    toast('Categoria excluída', 'success');
    loadCategories();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('services').delete().eq('id', deleteTarget.id);
    if (error) {
      toast('Não foi possível excluir. O serviço pode estar vinculado a orçamentos.', 'error');
      return;
    }
    toast('Serviço excluído', 'success');
    setDeleteTarget(null);
    loadServices();
  };

  const openCalculator = (s: Service) => {
    setCalcTarget(s);
    setCalcInput({ baseCost: s.cost, materialsCost: 0, printingCost: 0, commissionPercent: 0, otherCosts: 0, sellingPrice: s.price, discountPercent: 0 });
  };

  const calcResult: PricingResult = calculatePricing(calcInput);

  return (
    <div>
      <PageHeader
        title="Serviços e produtos"
        subtitle="Catálogo de serviços comercializados pelo estúdio"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setCatModalOpen(true)} className="btn-secondary">
              <FolderPlus className="h-4 w-4" /> Categorias
            </button>
            <button onClick={openNew} className="btn-primary">
              <Plus className="h-4 w-4" /> Novo serviço
            </button>
          </div>
        }
      />

      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              className="input pl-10"
              placeholder="Pesquisar por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select className="input sm:w-56" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded accent-teal-600" />
            Mostrar inativos
          </label>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Camera className="h-12 w-12" />}
          title="Nenhum serviço cadastrado"
          description="Comece cadastrando os serviços que o seu estúdio oferece."
          action={<button onClick={openNew} className="btn-primary"><Plus className="h-4 w-4" /> Cadastrar serviço</button>}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <div key={s.id} className="card p-5 flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-xs font-medium text-slate-400">{s.code}</span>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 truncate">{s.name}</h3>
                  {s.category && <span className="badge badge-neutral mt-1">{s.category}</span>}
                </div>
                <span className={`badge ${s.active ? 'badge-success' : 'badge-danger'}`}>{s.active ? 'Ativo' : 'Inativo'}</span>
              </div>
              {s.description && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400 line-clamp-2">{s.description}</p>}
              <div className="mt-4 flex items-end justify-between">
                <div>
                  <p className="text-2xl font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(s.price)}</p>
                  <p className="text-xs text-slate-400 mt-1">{s.duration_min} min · {s.unit}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-1 border-t border-slate-100 dark:border-slate-700 pt-3">
                <button onClick={() => setViewTarget(s)} className="btn-ghost text-xs" title="Visualizar"><Eye className="h-4 w-4" /></button>
                <button onClick={() => openCalculator(s)} className="btn-ghost text-xs" title="Calculadora de preços"><Calculator className="h-4 w-4" /></button>
                <button onClick={() => openEdit(s)} className="btn-ghost text-xs" title="Editar"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => handleDuplicate(s)} className="btn-ghost text-xs" title="Duplicar"><Copy className="h-4 w-4" /></button>
                <button onClick={() => handleToggleActive(s)} className="btn-ghost text-xs" title={s.active ? 'Inativar' : 'Ativar'}><Power className="h-4 w-4" /></button>
                <button onClick={() => setDeleteTarget(s)} className="btn-ghost text-xs text-red-500 hover:text-red-600" title="Excluir"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar serviço' : 'Novo serviço'} size="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Código</label>
            <input className="input" value={form.code ?? ''} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          </div>
          <div>
            <label className="label">Nome do serviço *</label>
            <input className="input" value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={form.category ?? ''} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option value="">Selecione...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Unidade de cobrança</label>
            <input className="input" value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          </div>
          <div>
            <label className="label">Preço padrão (R$)</label>
            <input type="number" step="0.01" className="input" value={form.price ?? 0} onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">Custo estimado (R$)</label>
            <input type="number" step="0.01" className="input" value={form.cost ?? 0} onChange={(e) => setForm({ ...form, cost: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label className="label">Duração estimada (min)</label>
            <input type="number" className="input" value={form.duration_min ?? 60} onChange={(e) => setForm({ ...form, duration_min: parseInt(e.target.value) || 60 })} />
          </div>
          <div>
            <label className="label">Prazo de entrega (dias)</label>
            <input type="number" className="input" value={form.delivery_days ?? ''} onChange={(e) => setForm({ ...form, delivery_days: e.target.value ? parseInt(e.target.value) : undefined })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Descrição</label>
            <textarea className="input min-h-[60px]" value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Condições de pagamento</label>
            <input className="input" value={form.payment_conditions ?? ''} onChange={(e) => setForm({ ...form, payment_conditions: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Observações</label>
            <textarea className="input min-h-[60px]" value={form.observations ?? ''} onChange={(e) => setForm({ ...form, observations: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={form.active ?? true} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="h-5 w-5 rounded accent-teal-600" />
              <span className="text-sm text-slate-700 dark:text-slate-300">Serviço ativo</span>
            </label>
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Salvando...' : (editing ? 'Salvar alterações' : 'Cadastrar serviço')}</button>
        </div>
      </Modal>

      <Modal open={!!viewTarget} onClose={() => setViewTarget(null)} title="Detalhes do serviço" size="md">
        {viewTarget && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-slate-400">Código:</span><span className="font-medium">{viewTarget.code}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Nome:</span><span className="font-medium">{viewTarget.name}</span></div>
            {viewTarget.category && <div className="flex justify-between"><span className="text-slate-400">Categoria:</span><span className="font-medium">{viewTarget.category}</span></div>}
            <div className="flex justify-between"><span className="text-slate-400">Preço:</span><span className="font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(viewTarget.price)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Custo:</span><span className="font-medium">{formatCurrency(viewTarget.cost)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Margem:</span><span className="font-medium">{formatCurrency(viewTarget.price - viewTarget.cost)}</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Duração:</span><span className="font-medium">{viewTarget.duration_min} min</span></div>
            {viewTarget.delivery_days != null && <div className="flex justify-between"><span className="text-slate-400">Entrega:</span><span className="font-medium">{viewTarget.delivery_days} dias</span></div>}
            {viewTarget.description && <div><span className="text-slate-400 block mb-1">Descrição:</span><p className="text-slate-700 dark:text-slate-300">{viewTarget.description}</p></div>}
            {viewTarget.observations && <div><span className="text-slate-400 block mb-1">Observações:</span><p className="text-slate-700 dark:text-slate-300">{viewTarget.observations}</p></div>}
          </div>
        )}
      </Modal>

      <Modal open={catModalOpen} onClose={() => setCatModalOpen(false)} title="Categorias de serviços" size="sm">
        <div className="space-y-4">
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="Nova categoria..."
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
            />
            <button onClick={handleAddCategory} className="btn-primary shrink-0">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {categories.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Nenhuma categoria cadastrada.</p>
            ) : (
              categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between card p-2 px-3">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{c.name}</span>
                  <button onClick={() => handleDeleteCategory(c)} className="text-red-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </Modal>

      {/* Price Calculator Modal */}
      <Modal open={!!calcTarget} onClose={() => setCalcTarget(null)} title="Calculadora de preços" size="lg">
        {calcTarget && (
          <div className="space-y-4">
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{calcTarget.name}</p>
              <p className="text-xs text-slate-400">Preço cadastrado: {formatCurrency(calcTarget.price)} · Custo cadastrado: {formatCurrency(calcTarget.cost)}</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><label className="label">Custo base (R$)</label><input type="number" step="0.01" className="input" value={calcInput.baseCost} onChange={(e) => setCalcInput({ ...calcInput, baseCost: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className="label">Preço de venda (R$)</label><input type="number" step="0.01" className="input" value={calcInput.sellingPrice} onChange={(e) => setCalcInput({ ...calcInput, sellingPrice: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className="label">Materiais (R$)</label><input type="number" step="0.01" className="input" value={calcInput.materialsCost} onChange={(e) => setCalcInput({ ...calcInput, materialsCost: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className="label">Impressões (R$)</label><input type="number" step="0.01" className="input" value={calcInput.printingCost} onChange={(e) => setCalcInput({ ...calcInput, printingCost: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className="label">Comissão (%)</label><input type="number" step="0.01" className="input" value={calcInput.commissionPercent} onChange={(e) => setCalcInput({ ...calcInput, commissionPercent: parseFloat(e.target.value) || 0 })} /></div>
              <div><label className="label">Outros custos (R$)</label><input type="number" step="0.01" className="input" value={calcInput.otherCosts} onChange={(e) => setCalcInput({ ...calcInput, otherCosts: parseFloat(e.target.value) || 0 })} /></div>
              <div className="sm:col-span-2"><label className="label">Desconto sobre venda (%)</label><input type="number" step="0.01" className="input" value={calcInput.discountPercent} onChange={(e) => setCalcInput({ ...calcInput, discountPercent: parseFloat(e.target.value) || 0 })} /></div>
            </div>

            {/* Results */}
            <div className="card p-4 space-y-3">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Resultado da simulação</h4>

              {calcResult.totalCost.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-400 uppercase font-medium">Composição de custos</p>
                  {calcResult.totalCost.map((c) => (
                    <div key={c.label} className="flex justify-between text-sm"><span className="text-slate-500">{c.label}</span><span className="font-medium text-slate-700 dark:text-slate-300">{formatCurrency(c.amount)}</span></div>
                  ))}
                  <div className="flex justify-between text-sm border-t border-slate-200 dark:border-slate-700 pt-1.5"><span className="text-slate-600 dark:text-slate-300 font-medium">Custo total</span><span className="font-bold text-amber-600">{formatCurrency(calcResult.totalCostAmount)}</span></div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Preço com desconto</p><p className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{formatCurrency(calcResult.discountedPrice)}</p>{calcResult.discountAmount > 0 && <p className="text-xs text-red-500">-{formatCurrency(calcResult.discountAmount)}</p>}</div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Custo total</p><p className="text-lg font-bold text-amber-600 mt-0.5">{formatCurrency(calcResult.totalCostAmount)}</p></div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Margem sobre venda</p><p className={`text-lg font-bold mt-0.5 ${calcResult.marginOnSale >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(calcResult.marginOnSale)}</p><p className={`text-xs ${calcResult.marginOnSalePercent >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{calcResult.marginOnSalePercent}%</p></div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50"><p className="text-xs text-slate-400">Acréscimo sobre custo</p><p className={`text-lg font-bold mt-0.5 ${calcResult.markupOnCost >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(calcResult.markupOnCost)}</p><p className={`text-xs ${calcResult.markupOnCostPercent >= 0 ? 'text-emerald-500' : 'text-red-400'}`}>{calcResult.markupOnCostPercent}%</p></div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <div><p className="text-xs text-slate-400">Preço mínimo sugerido</p><p className="text-lg font-bold" style={{ color: 'var(--color-primary)' }}>{formatCurrency(calcResult.suggestedMinPrice)}</p><p className="text-xs text-slate-400">30% de acréscimo sobre o custo</p></div>
                <div className="text-right"><p className="text-xs text-slate-400">Lucro/profit</p><p className={`text-lg font-bold ${calcResult.profit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatCurrency(calcResult.profit)}</p></div>
              </div>

              {calcResult.suggestedMinPrice > calcInput.sellingPrice && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-200">
                  <Percent className="h-4 w-4 inline mr-1" /> O preço atual ({formatCurrency(calcInput.sellingPrice)}) está abaixo do preço mínimo sugerido ({formatCurrency(calcResult.suggestedMinPrice)}). Considere reajustar.
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400">A calculadora é apenas uma simulação. Os preços cadastrados no catálogo não são alterados. Margem sobre venda = (preço - custo) / preço. Acréscimo sobre custo = (preço - custo) / custo. Os dois valores absolutos são iguais, mas as porcentagens diferem porque a base de cálculo é diferente.</p>
          </div>
        )}
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setCalcTarget(null)} className="btn-secondary">Fechar</button></div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir serviço"
        message={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
