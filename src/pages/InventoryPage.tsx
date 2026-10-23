import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, todayISO } from '@/lib/utils';
import { Plus, Search, Pencil, Trash2, Package, CircleArrowDown as ArrowDownCircle, CircleArrowUp as ArrowUpCircle, TriangleAlert as AlertTriangle, RotateCcw, FileSliders as Sliders, ClipboardList, TrendingUp, X, Printer } from 'lucide-react';
import type { InventoryItem, InventoryMovement, Supplier, ServiceOrder, FinancialExpense } from '@/lib/types';

type MovementType = 'entrada' | 'saida' | 'perda' | 'devolucao' | 'ajuste';

const CATEGORIES = ['Papel fotográfico', 'Tinta', 'Álbum', 'Moldura', 'Embalagem', 'Cenário', 'Outros'];
const UNITS = ['un', 'folha', 'm', 'm²', 'ml', 'l', 'par', 'kg', 'g'];

const MOVEMENT_META: Record<MovementType, { label: string; icon: typeof ArrowDownCircle; color: string; sign: number }> = {
  entrada: { label: 'Entrada (compra)', icon: ArrowDownCircle, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20', sign: 1 },
  saida: { label: 'Saída (consumo)', icon: ArrowUpCircle, color: 'text-sky-600 bg-sky-50 dark:bg-sky-900/20', sign: -1 },
  perda: { label: 'Perda', icon: AlertTriangle, color: 'text-red-600 bg-red-50 dark:bg-red-900/20', sign: -1 },
  devolucao: { label: 'Devolução', icon: RotateCcw, color: 'text-amber-600 bg-amber-50 dark:bg-amber-900/20', sign: 1 },
  ajuste: { label: 'Ajuste', icon: Sliders, color: 'text-violet-600 bg-violet-50 dark:bg-violet-900/20', sign: 0 },
};

const emptyItemForm: Partial<InventoryItem> = {
  name: '',
  category: '',
  unit: 'un',
  min_stock: 0,
  unit_cost: 0,
  supplier_id: '',
  notes: '',
  active: true,
};

export function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [expenses, setExpenses] = useState<FinancialExpense[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterLowStock, setFilterLowStock] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [itemForm, setItemForm] = useState<Partial<InventoryItem>>(emptyItemForm);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);

  const [movementModalOpen, setMovementModalOpen] = useState(false);
  const [movementItem, setMovementItem] = useState<InventoryItem | null>(null);
  const [movementType, setMovementType] = useState<MovementType>('entrada');
  const [movementForm, setMovementForm] = useState({
    quantity: 1,
    reason: '',
    movement_date: todayISO(),
    unit_cost: '',
    financial_expense_id: '',
    service_order_id: '',
    notes: '',
  });

  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);
  const [replenishmentOpen, setReplenishmentOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [itemsRes, suppliersRes, ordersRes, expensesRes, movementsRes] = await Promise.all([
      supabase.from('inventory_items').select('*').order('name'),
      supabase.from('suppliers').select('*').eq('active', true).order('name'),
      supabase.from('service_orders').select('id,code,title,status').order('created_at', { ascending: false }).limit(50),
      supabase.from('financial_expenses').select('id,description,amount,status,supplier,due_date').order('due_date', { ascending: false }).limit(50),
      supabase.from('inventory_movements').select('*').order('movement_date', { ascending: false }).limit(200),
    ]);
    setItems((itemsRes.data as InventoryItem[]) ?? []);
    setSuppliers((suppliersRes.data as Supplier[]) ?? []);
    setOrders((ordersRes.data as ServiceOrder[]) ?? []);
    setExpenses((expensesRes.data as FinancialExpense[]) ?? []);
    setMovements((movementsRes.data as InventoryMovement[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean) as string[])).sort();

  const filtered = items.filter((i) => {
    const matchesSearch = i.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = !filterCategory || i.category === filterCategory;
    const matchesLowStock = !filterLowStock || i.current_stock <= i.min_stock;
    const matchesActive = showInactive || i.active;
    return matchesSearch && matchesCategory && matchesLowStock && matchesActive;
  });

  const lowStockItems = items.filter((i) => i.active && i.current_stock <= i.min_stock);
  const totalStockValue = items.filter((i) => i.active).reduce((sum, i) => sum + i.current_stock * i.unit_cost, 0);

  const openNewItem = () => {
    setEditing(null);
    setItemForm({ ...emptyItemForm });
    setModalOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditing(item);
    setItemForm({ ...item });
    setModalOpen(true);
  };

  const handleSaveItem = async () => {
    if (!itemForm.name?.trim()) {
      toast('Preencha o nome do material', 'warning');
      return;
    }
    const payload = {
      name: itemForm.name.trim(),
      category: itemForm.category || null,
      unit: itemForm.unit || 'un',
      min_stock: Number(itemForm.min_stock) || 0,
      unit_cost: Number(itemForm.unit_cost) || 0,
      supplier_id: itemForm.supplier_id || null,
      notes: itemForm.notes || null,
      active: itemForm.active ?? true,
    };
    if (editing) {
      const { error } = await supabase
        .from('inventory_items')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', editing.id);
      if (error) { toast('Erro ao atualizar material: ' + error.message, 'error'); return; }
      toast('Material atualizado', 'success');
    } else {
      const { error } = await supabase.from('inventory_items').insert(payload);
      if (error) { toast('Erro ao cadastrar material: ' + error.message, 'error'); return; }
      toast('Material cadastrado', 'success');
    }
    setModalOpen(false);
    load();
  };

  const handleDeleteItem = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('inventory_items').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir material: ' + error.message, 'error'); return; }
    toast('Material excluído', 'success');
    setDeleteTarget(null);
    load();
  };

  const openMovement = (item: InventoryItem, type: MovementType) => {
    setMovementItem(item);
    setMovementType(type);
    setMovementForm({
      quantity: 1,
      reason: '',
      movement_date: todayISO(),
      unit_cost: type === 'entrada' ? String(item.unit_cost) : '',
      financial_expense_id: '',
      service_order_id: '',
      notes: '',
    });
    setMovementModalOpen(true);
  };

  const handleSaveMovement = async () => {
    if (!movementItem) return;
    const qty = Number(movementForm.quantity);
    if (!qty || qty <= 0) {
      toast('Informe uma quantidade válida', 'warning');
      return;
    }
    if ((movementType === 'saida' || movementType === 'perda') && qty > movementItem.current_stock) {
      toast(`Estoque insuficiente. Saldo atual: ${movementItem.current_stock} ${movementItem.unit}`, 'warning');
      return;
    }

    const meta = MOVEMENT_META[movementType];
    const delta = movementType === 'ajuste' ? qty - movementItem.current_stock : meta.sign * qty;

    const movementPayload = {
      item_id: movementItem.id,
      movement_type: movementType,
      quantity: movementType === 'ajuste' ? Math.abs(delta) : qty,
      reason: movementForm.reason || null,
      movement_date: movementForm.movement_date,
      unit_cost: movementForm.unit_cost ? Number(movementForm.unit_cost) : null,
      financial_expense_id: movementForm.financial_expense_id || null,
      service_order_id: movementForm.service_order_id || null,
      supplier_id: movementItem.supplier_id || null,
      notes: movementForm.notes || null,
    };

    const { data: movData, error: movError } = await supabase
      .from('inventory_movements')
      .insert(movementPayload)
      .select()
      .single();
    if (movError || !movData) {
      toast('Erro ao registrar movimentação: ' + (movError?.message ?? 'erro desconhecido'), 'error');
      return;
    }

    const newStock = movementType === 'ajuste' ? qty : movementItem.current_stock + delta;
    const { error: updateError } = await supabase
      .from('inventory_items')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', movementItem.id);
    if (updateError) {
      toast('Movimentação registrada, mas erro ao atualizar saldo: ' + updateError.message, 'warning');
    }

    if (movementType === 'entrada' && movementForm.unit_cost) {
      const cost = Number(movementForm.unit_cost);
      if (cost > 0 && cost !== movementItem.unit_cost) {
        await supabase
          .from('inventory_items')
          .update({ unit_cost: cost, updated_at: new Date().toISOString() })
          .eq('id', movementItem.id);
      }
    }

    if (movementType === 'saida' && movementForm.service_order_id) {
      await supabase.from('order_material_consumption').insert({
        service_order_id: movementForm.service_order_id,
        inventory_item_id: movementItem.id,
        movement_id: movData.id,
        quantity: qty,
        unit_cost: movementItem.unit_cost,
      });
    }

    toast(`${meta.label} registrada para ${movementItem.name}`, 'success');
    setMovementModalOpen(false);
    load();
  };

  const handleDeleteMovement = async (mov: InventoryMovement) => {
    const item = items.find((i) => i.id === mov.item_id);
    if (!item) return;
    const meta = MOVEMENT_META[mov.movement_type];
    const delta = mov.movement_type === 'ajuste'
      ? item.current_stock - Number(mov.quantity)
      : meta.sign * Number(mov.quantity);
    const restoredStock = mov.movement_type === 'ajuste'
      ? Number(mov.quantity)
      : item.current_stock - delta;

    const { error: delError } = await supabase.from('inventory_movements').delete().eq('id', mov.id);
    if (delError) { toast('Erro ao excluir movimentação: ' + delError.message, 'error'); return; }

    await supabase
      .from('inventory_items')
      .update({ current_stock: restoredStock, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    toast('Movimentação excluída e saldo revertido', 'success');
    load();
  };

  const replenishmentList = items.filter((i) => i.active && i.current_stock <= i.min_stock);

  const printReplenishment = () => {
    const win = window.open('', '_blank', 'width=800,height=600');
    if (!win) { toast('Bloqueador de pop-up ativo', 'warning'); return; }
    const rows = replenishmentList.map((i) => {
      const supplier = suppliers.find((s) => s.id === i.supplier_id);
      const sug = Math.max(i.min_stock * 2 - i.current_stock, i.min_stock);
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${i.name}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${i.category ?? '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.current_stock} ${i.unit}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${i.min_stock} ${i.unit}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:center">${sug} ${i.unit}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb">${supplier?.name ?? '—'}</td>
        <td style="padding:8px;border-bottom:1px solid #e5e7eb;text-align:right">${formatCurrency(sug * i.unit_cost)}</td>
      </tr>`;
    }).join('');
    win.document.write(`<!DOCTYPE html><html><head><title>Lista de Reposição</title>
      <style>body{font-family:system-ui,sans-serif;padding:32px;color:#1e293b}
      h1{font-size:22px}table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#f1f5f9;padding:8px;text-align:left;font-size:12px;text-transform:uppercase}
      td{font-size:13px}</style></head>
      <body><h1>Lista de Reposição de Estoque</h1>
      <p>Data: ${formatDate(todayISO())}</p>
      <table><thead><tr>
      <th>Material</th><th>Categoria</th><th>Saldo atual</th><th>Estoque mínimo</th>
      <th>Sugestão de compra</th><th>Fornecedor</th><th>Custo estimado</th>
      </tr></thead><tbody>${rows}</tbody></table>
      <p style="margin-top:24px;font-size:12px;color:#64748b">Esta lista é apenas para consulta — nenhuma compra é criada automaticamente.</p>
      </body></html>`);
    win.document.close();
    win.print();
  };

  const itemMovements = historyItem
    ? movements.filter((m) => m.item_id === historyItem.id).sort((a, b) => b.movement_date.localeCompare(a.movement_date))
    : [];

  return (
    <div>
      <PageHeader
        title="Estoque de materiais"
        subtitle="Controle de papel, tinta, álbuns, molduras, embalagens e cenário"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setReplenishmentOpen(true)} className="btn-secondary">
              <ClipboardList className="h-4 w-4" /> Lista de reposição
            </button>
            <button onClick={openNewItem} className="btn-primary">
              <Plus className="h-4 w-4" /> Novo material
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center"><Package className="h-5 w-5 text-teal-600" /></div>
            <div><p className="text-sm text-slate-400">Total de itens ativos</p><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{items.filter((i) => i.active).length}</p></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center"><AlertTriangle className="h-5 w-5 text-red-600" /></div>
            <div><p className="text-sm text-slate-400">Itens com estoque baixo</p><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{lowStockItems.length}</p></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center"><TrendingUp className="h-5 w-5 text-emerald-600" /></div>
            <div><p className="text-sm text-slate-400">Valor total em estoque</p><p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{formatCurrency(totalStockValue)}</p></div>
          </div>
        </div>
      </div>

      <div className="card p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input className="input pl-10" placeholder="Pesquisar material..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className="input sm:w-56" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="">Todas as categorias</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input type="checkbox" checked={filterLowStock} onChange={(e) => setFilterLowStock(e.target.checked)} className="h-4 w-4 rounded accent-teal-600" />
            Somente baixo
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300 whitespace-nowrap">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded accent-teal-600" />
            Inativos
          </label>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-slate-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Package className="h-12 w-12" />}
          title="Nenhum material cadastrado"
          description="Cadastre papel fotográfico, tinta, álbuns, molduras, embalagens e materiais de cenário."
          action={<button onClick={openNewItem} className="btn-primary"><Plus className="h-4 w-4" /> Cadastrar material</button>}
        />
      ) : (
        <div className="overflow-x-auto card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-400">
                <th className="px-4 py-3">Material</th>
                <th className="px-4 py-3">Categoria</th>
                <th className="px-4 py-3 text-center">Saldo</th>
                <th className="px-4 py-3 text-center">Mínimo</th>
                <th className="px-4 py-3 text-right">Custo unit.</th>
                <th className="px-4 py-3 text-right">Valor</th>
                <th className="px-4 py-3">Fornecedor</th>
                <th className="px-4 py-3 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => {
                const supplier = suppliers.find((s) => s.id === item.supplier_id);
                const isLow = item.current_stock <= item.min_stock;
                return (
                  <tr key={item.id} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900 dark:text-slate-100">{item.name}</p>
                      {!item.active && <span className="badge badge-danger ml-1">Inativo</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{item.category ?? '—'}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isLow ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>
                        {isLow && <AlertTriangle className="h-3 w-3" />}
                        {item.current_stock} {item.unit}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500 dark:text-slate-400">{item.min_stock} {item.unit}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrency(item.unit_cost)}</td>
                    <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-300">{formatCurrency(item.current_stock * item.unit_cost)}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{supplier?.name ?? '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-0.5">
                        <button onClick={() => openMovement(item, 'entrada')} title="Entrada" className="btn-ghost text-emerald-600 p-1.5"><ArrowDownCircle className="h-4 w-4" /></button>
                        <button onClick={() => openMovement(item, 'saida')} title="Saída" className="btn-ghost text-sky-600 p-1.5"><ArrowUpCircle className="h-4 w-4" /></button>
                        <button onClick={() => openMovement(item, 'perda')} title="Perda" className="btn-ghost text-red-600 p-1.5"><AlertTriangle className="h-4 w-4" /></button>
                        <button onClick={() => openMovement(item, 'devolucao')} title="Devolução" className="btn-ghost text-amber-600 p-1.5"><RotateCcw className="h-4 w-4" /></button>
                        <button onClick={() => openMovement(item, 'ajuste')} title="Ajuste" className="btn-ghost text-violet-600 p-1.5"><Sliders className="h-4 w-4" /></button>
                        <button onClick={() => setHistoryItem(item)} title="Histórico" className="btn-ghost p-1.5"><ClipboardList className="h-4 w-4" /></button>
                        <button onClick={() => openEditItem(item)} title="Editar" className="btn-ghost p-1.5"><Pencil className="h-4 w-4" /></button>
                        <button onClick={() => setDeleteTarget(item)} title="Excluir" className="btn-ghost text-red-500 p-1.5"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar material' : 'Novo material'} size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nome *</label>
            <input className="input" value={itemForm.name ?? ''} onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })} placeholder="Ex: Papel fotográfico 13x18 brilhante" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Categoria</label>
              <select className="input" value={itemForm.category ?? ''} onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}>
                <option value="">Selecione...</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Unidade</label>
              <select className="input" value={itemForm.unit ?? 'un'} onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}>
                {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Estoque mínimo</label>
              <input type="number" min="0" step="any" className="input" value={itemForm.min_stock ?? 0} onChange={(e) => setItemForm({ ...itemForm, min_stock: Number(e.target.value) })} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Custo unitário (R$)</label>
              <input type="number" min="0" step="any" className="input" value={itemForm.unit_cost ?? 0} onChange={(e) => setItemForm({ ...itemForm, unit_cost: Number(e.target.value) })} />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Fornecedor</label>
            <select className="input" value={itemForm.supplier_id ?? ''} onChange={(e) => setItemForm({ ...itemForm, supplier_id: e.target.value })}>
              <option value="">Sem fornecedor</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
            <textarea className="input min-h-[60px]" value={itemForm.notes ?? ''} onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })} />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={itemForm.active ?? true} onChange={(e) => setItemForm({ ...itemForm, active: e.target.checked })} className="h-4 w-4 rounded accent-teal-600" />
            Material ativo
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button onClick={handleSaveItem} className="btn-primary">Salvar</button>
          </div>
        </div>
      </Modal>

      <Modal open={movementModalOpen} onClose={() => setMovementModalOpen(false)} title={`${MOVEMENT_META[movementType].label} — ${movementItem?.name ?? ''}`} size="lg">
        {movementItem && (
          <div className="space-y-4">
            <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Saldo atual:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{movementItem.current_stock} {movementItem.unit}</span>
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-slate-500">Estoque mínimo:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{movementItem.min_stock} {movementItem.unit}</span>
              </div>
            </div>
            {movementType === 'ajuste' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Novo saldo (contagem real) *</label>
                <input type="number" min="0" step="any" className="input" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: Number(e.target.value) })} />
                <p className="text-xs text-slate-400 mt-1">Ajuste o saldo para o valor contado. A diferença será registrada como movimentação de ajuste.</p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Quantidade *</label>
                <input type="number" min="0" step="any" className="input" value={movementForm.quantity} onChange={(e) => setMovementForm({ ...movementForm, quantity: Number(e.target.value) })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Data</label>
                <input type="date" className="input" value={movementForm.movement_date} onChange={(e) => setMovementForm({ ...movementForm, movement_date: e.target.value })} />
              </div>
              {movementType === 'entrada' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Custo unitário (R$)</label>
                  <input type="number" min="0" step="any" className="input" value={movementForm.unit_cost} onChange={(e) => setMovementForm({ ...movementForm, unit_cost: e.target.value })} />
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Motivo</label>
              <input className="input" value={movementForm.reason} onChange={(e) => setMovementForm({ ...movementForm, reason: e.target.value })} placeholder={movementType === 'entrada' ? 'Ex: Compra mensal' : movementType === 'perda' ? 'Ex: Papel estragado' : 'Ex: Consumo em produção'} />
            </div>
            {movementType === 'entrada' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Despesa financeira vinculada (evita duplicar custo)</label>
                <select className="input" value={movementForm.financial_expense_id} onChange={(e) => setMovementForm({ ...movementForm, financial_expense_id: e.target.value })}>
                  <option value="">Sem vínculo</option>
                  {expenses.map((exp) => (
                    <option key={exp.id} value={exp.id}>{exp.description} — {formatCurrency(exp.amount)} ({formatDate(exp.due_date)})</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Vincule à despesa original para não duplicar custos no financeiro.</p>
              </div>
            )}
            {movementType === 'saida' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Ordem de serviço (consumo vinculado)</label>
                <select className="input" value={movementForm.service_order_id} onChange={(e) => setMovementForm({ ...movementForm, service_order_id: e.target.value })}>
                  <option value="">Sem vínculo</option>
                  {orders.map((o) => (
                    <option key={o.id} value={o.id}>{o.code} — {o.title}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Vincule à OS para abater do estoque sem criar nova despesa (o custo já foi registrado na compra).</p>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Observações</label>
              <textarea className="input min-h-[50px]" value={movementForm.notes} onChange={(e) => setMovementForm({ ...movementForm, notes: e.target.value })} />
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button onClick={() => setMovementModalOpen(false)} className="btn-secondary">Cancelar</button>
              <button onClick={handleSaveMovement} className="btn-primary">Registrar</button>
            </div>
          </div>
        )}
      </Modal>

      {historyItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setHistoryItem(null)} />
          <div className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-800 shadow-2xl flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Histórico — {historyItem.name}</h2>
                <p className="text-sm text-slate-400">Saldo atual: {historyItem.current_stock} {historyItem.unit}</p>
              </div>
              <button onClick={() => setHistoryItem(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"><X className="h-5 w-5" /></button>
            </div>
            <div className="overflow-y-auto px-6 py-4">
              {itemMovements.length === 0 ? (
                <p className="text-center text-slate-400 py-8">Nenhuma movimentação registrada.</p>
              ) : (
                <div className="space-y-2">
                  {itemMovements.map((m) => {
                    const meta = MOVEMENT_META[m.movement_type];
                    const Icon = meta.icon;
                    const exp = expenses.find((e) => e.id === m.financial_expense_id);
                    const order = orders.find((o) => o.id === m.service_order_id);
                    return (
                      <div key={m.id} className="card p-3 flex items-start gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.color}`}><Icon className="h-4 w-4" /></div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{meta.label}</p>
                            <p className="text-xs text-slate-400">{formatDate(m.movement_date)}</p>
                          </div>
                          <p className="text-sm text-slate-600 dark:text-slate-300">
                            {m.movement_type === 'ajuste' ? `Saldo ajustado para ${m.quantity}` : `${meta.sign > 0 ? '+' : '−'}${m.quantity} ${historyItem.unit}`}
                            {m.unit_cost ? ` · ${formatCurrency(m.unit_cost)}/un` : ''}
                          </p>
                          {m.reason && <p className="text-xs text-slate-400 mt-0.5">Motivo: {m.reason}</p>}
                          {exp && <p className="text-xs text-slate-400">Despesa: {exp.description} ({formatCurrency(exp.amount)})</p>}
                          {order && <p className="text-xs text-slate-400">OS: {order.code} — {order.title}</p>}
                        </div>
                        <button onClick={() => handleDeleteMovement(m)} className="btn-ghost text-red-500 p-1" title="Excluir e reverter"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <Modal open={replenishmentOpen} onClose={() => setReplenishmentOpen(false)} title="Lista de reposição" size="xl">
        {replenishmentList.length === 0 ? (
          <EmptyState icon={<Package className="h-10 w-10" />} title="Estoque em ordem" description="Nenhum material está com estoque baixo no momento." />
        ) : (
          <>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {replenishmentList.length} material(is) com saldo no ou abaixo do mínimo. Esta lista é apenas para consulta — nenhuma compra é criada automaticamente.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-400">
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2 text-center">Saldo</th>
                    <th className="px-3 py-2 text-center">Mínimo</th>
                    <th className="px-3 py-2 text-center">Sugestão</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2 text-right">Custo estimado</th>
                  </tr>
                </thead>
                <tbody>
                  {replenishmentList.map((i) => {
                    const supplier = suppliers.find((s) => s.id === i.supplier_id);
                    const sug = Math.max(i.min_stock * 2 - i.current_stock, i.min_stock);
                    return (
                      <tr key={i.id} className="border-b border-slate-100 dark:border-slate-700/50">
                        <td className="px-3 py-2 font-medium text-slate-900 dark:text-slate-100">{i.name}</td>
                        <td className="px-3 py-2 text-center text-red-600 font-medium">{i.current_stock} {i.unit}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{i.min_stock} {i.unit}</td>
                        <td className="px-3 py-2 text-center text-slate-700 dark:text-slate-300 font-medium">{sug} {i.unit}</td>
                        <td className="px-3 py-2 text-slate-500">{supplier?.name ?? '—'}</td>
                        <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{formatCurrency(sug * i.unit_cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td colSpan={5} className="px-3 py-3 font-semibold text-slate-900 dark:text-slate-100 text-right">Custo total estimado:</td>
                    <td className="px-3 py-3 text-right font-bold text-slate-900 dark:text-slate-100">
                      {formatCurrency(replenishmentList.reduce((sum, i) => sum + Math.max(i.min_stock * 2 - i.current_stock, i.min_stock) * i.unit_cost, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="flex justify-end pt-4">
              <button onClick={printReplenishment} className="btn-secondary"><Printer className="h-4 w-4" /> Imprimir / PDF</button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        title="Excluir material"
        message={`Tem certeza que deseja excluir "${deleteTarget?.name}"? Todo o histórico de movimentações será removido.`}
        confirmLabel="Excluir"
        variant="danger"
        onConfirm={handleDeleteItem}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
