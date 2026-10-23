import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { formatCurrency, formatDate, todayISO } from '@/lib/utils';
import { Plus, Pencil, Trash2, DoorOpen, Camera, Wrench, Package, CheckCircle, ArrowLeftRight, AlertTriangle } from 'lucide-react';
import type { Room, Equipment, EquipmentLoan, EquipmentMaintenance, Appointment } from '@/lib/types';

type Tab = 'rooms' | 'equipment' | 'loans' | 'maintenance';

const roomTypeLabels: Record<string, string> = {
  sala: 'Sala',
  cenario: 'Cenário',
  espaco: 'Espaço',
  estudio: 'Estúdio',
};

const conditionLabels: Record<string, string> = {
  otimo: 'Ótimo',
  bom: 'Bom',
  regular: 'Regular',
  danificado: 'Danificado',
};

const conditionBadge: Record<string, string> = {
  otimo: 'badge-success',
  bom: 'badge-success',
  regular: 'badge-warning',
  danificado: 'badge-danger',
};

const loanStatusLabels: Record<string, string> = {
  emprestado: 'Emprestado',
  devolvido: 'Devolvido',
  atrasado: 'Atrasado',
};

const loanStatusBadge: Record<string, string> = {
  emprestado: 'badge-warning',
  devolvido: 'badge-success',
  atrasado: 'badge-danger',
};

const maintenanceStatusLabels: Record<string, string> = {
  em_manutencao: 'Em manutenção',
  concluido: 'Concluído',
};

export function ResourcesPage() {
  const [tab, setTab] = useState<Tab>('rooms');
  const [rooms, setRooms] = useState<Room[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loans, setLoans] = useState<EquipmentLoan[]>([]);
  const [maintenance, setMaintenance] = useState<EquipmentMaintenance[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  const [roomModal, setRoomModal] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [roomForm, setRoomForm] = useState({ name: '', type: 'sala', capacity: 0, description: '', is_active: true });

  const [equipModal, setEquipModal] = useState(false);
  const [editingEquip, setEditingEquip] = useState<Equipment | null>(null);
  const [deleteEquip, setDeleteEquip] = useState<Equipment | null>(null);
  const [equipForm, setEquipForm] = useState({ name: '', category: '', serial_number: '', condition: 'otimo', is_active: true });

  const [loanModal, setLoanModal] = useState(false);
  const [deleteLoan, setDeleteLoan] = useState<EquipmentLoan | null>(null);
  const [loanForm, setLoanForm] = useState({ equipment_id: '', responsible: '', checkout_date: todayISO(), expected_return_date: '', notes: '' });

  const [maintModal, setMaintModal] = useState(false);
  const [deleteMaint, setDeleteMaint] = useState<EquipmentMaintenance | null>(null);
  const [maintForm, setMaintForm] = useState({ equipment_id: '', description: '', start_date: todayISO(), end_date: '', cost: 0, provider: '', notes: '' });

  const load = useCallback(async () => {
    setLoading(true);
    const [roomsRes, equipRes, loansRes, maintRes, apptsRes] = await Promise.all([
      supabase.from('rooms').select('*').order('name'),
      supabase.from('equipment').select('*').order('name'),
      supabase.from('equipment_loans').select('*').order('checkout_date', { ascending: false }),
      supabase.from('equipment_maintenance').select('*').order('start_date', { ascending: false }),
      supabase.from('appointments').select('*'),
    ]);
    setRooms((roomsRes.data as Room[]) ?? []);
    setEquipment((equipRes.data as Equipment[]) ?? []);
    setLoans((loansRes.data as EquipmentLoan[]) ?? []);
    setMaintenance((maintRes.data as EquipmentMaintenance[]) ?? []);
    setAppointments((apptsRes.data as Appointment[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const today = todayISO();

  const isEquipmentInMaintenance = (equipId: string) => {
    return maintenance.some(m => m.status === 'em_manutencao' && m.equipment_id === equipId);
  };

  const isEquipmentOnLoan = (equipId: string) => {
    return loans.some(l => l.equipment_id === equipId && l.status === 'emprestado');
  };

  const checkRoomConflict = (roomId: string, excludeApptId?: string) => {
    return appointments.find(a => a.room_id === roomId && a.id !== excludeApptId && a.status !== 'cancelado');
  };

  const checkEquipmentConflict = (equipId: string, excludeApptId?: string) => {
    return appointments.find(a => a.equipment_id === equipId && a.id !== excludeApptId && a.status !== 'cancelado');
  };

  const handleSaveRoom = async () => {
    if (!roomForm.name) { toast('Informe o nome', 'warning'); return; }
    const payload = {
      name: roomForm.name, type: roomForm.type,
      capacity: roomForm.capacity || null, description: roomForm.description || null,
      is_active: roomForm.is_active, updated_at: new Date().toISOString(),
    };
    if (editingRoom) {
      const { error } = await supabase.from('rooms').update(payload).eq('id', editingRoom.id);
      if (error) { toast('Erro ao atualizar', 'error'); return; }
      toast('Sala atualizada', 'success');
    } else {
      const { error } = await supabase.from('rooms').insert(payload);
      if (error) { toast('Erro ao criar', 'error'); return; }
      toast('Sala criada', 'success');
    }
    setRoomModal(false); load();
  };

  const handleSaveEquipment = async () => {
    if (!equipForm.name) { toast('Informe o nome', 'warning'); return; }
    const payload = {
      name: equipForm.name, category: equipForm.category || null,
      serial_number: equipForm.serial_number || null, condition: equipForm.condition,
      is_active: equipForm.is_active, updated_at: new Date().toISOString(),
    };
    if (editingEquip) {
      const { error } = await supabase.from('equipment').update(payload).eq('id', editingEquip.id);
      if (error) { toast('Erro ao atualizar', 'error'); return; }
      toast('Equipamento atualizado', 'success');
    } else {
      const { error } = await supabase.from('equipment').insert(payload);
      if (error) { toast('Erro ao criar', 'error'); return; }
      toast('Equipamento criado', 'success');
    }
    setEquipModal(false); load();
  };

  const handleSaveLoan = async () => {
    if (!loanForm.equipment_id) { toast('Selecione o equipamento', 'warning'); return; }
    if (!loanForm.responsible) { toast('Informe o responsável', 'warning'); return; }
    if (isEquipmentInMaintenance(loanForm.equipment_id)) { toast('Equipamento em manutenção — não pode ser emprestado', 'warning'); return; }
    if (isEquipmentOnLoan(loanForm.equipment_id)) { toast('Equipamento já está emprestado', 'warning'); return; }
    const payload = {
      equipment_id: loanForm.equipment_id, responsible: loanForm.responsible,
      checkout_date: loanForm.checkout_date,
      expected_return_date: loanForm.expected_return_date || null,
      status: 'emprestado', notes: loanForm.notes || null,
    };
    const { error } = await supabase.from('equipment_loans').insert(payload);
    if (error) { toast('Erro ao registrar empréstimo', 'error'); return; }
    toast('Empréstimo registrado', 'success');
    setLoanModal(false); setLoanForm({ equipment_id: '', responsible: '', checkout_date: todayISO(), expected_return_date: '', notes: '' }); load();
  };

  const handleReturnLoan = async (loan: EquipmentLoan) => {
    const { error } = await supabase.from('equipment_loans').update({
      actual_return_date: today, status: 'devolvido', updated_at: new Date().toISOString(),
    }).eq('id', loan.id);
    if (error) { toast('Erro ao registrar devolução', 'error'); return; }
    toast('Devolução registrada', 'success');
    load();
  };

  const handleSaveMaintenance = async () => {
    if (!maintForm.equipment_id) { toast('Selecione o equipamento', 'warning'); return; }
    if (!maintForm.description) { toast('Informe a descrição', 'warning'); return; }
    if (isEquipmentOnLoan(maintForm.equipment_id)) { toast('Equipamento emprestado — registre a devolução primeiro', 'warning'); return; }
    const payload = {
      equipment_id: maintForm.equipment_id, description: maintForm.description,
      start_date: maintForm.start_date, end_date: maintForm.end_date || null,
      cost: maintForm.cost, provider: maintForm.provider || null,
      status: maintForm.end_date ? 'concluido' : 'em_manutencao',
      notes: maintForm.notes || null,
    };
    const { error } = await supabase.from('equipment_maintenance').insert(payload);
    if (error) { toast('Erro ao registrar manutenção', 'error'); return; }
    toast('Manutenção registrada', 'success');
    setMaintModal(false); setMaintForm({ equipment_id: '', description: '', start_date: todayISO(), end_date: '', cost: 0, provider: '', notes: '' }); load();
  };

  const handleFinishMaintenance = async (m: EquipmentMaintenance) => {
    const { error } = await supabase.from('equipment_maintenance').update({
      end_date: today, status: 'concluido', updated_at: new Date().toISOString(),
    }).eq('id', m.id);
    if (error) { toast('Erro ao finalizar manutenção', 'error'); return; }
    toast('Manutenção concluída', 'success');
    load();
  };

  const availableEquipment = equipment.filter(e => e.is_active && !isEquipmentInMaintenance(e.id) && !isEquipmentOnLoan(e.id));
  const activeLoans = loans.filter(l => l.status === 'emprestado');
  const activeMaintenance = maintenance.filter(m => m.status === 'em_manutencao');
  const overdueLoans = loans.filter(l => l.status === 'emprestado' && l.expected_return_date && l.expected_return_date < today);

  const tabs: { id: Tab; label: string; icon: typeof DoorOpen }[] = [
    { id: 'rooms', label: 'Salas e cenários', icon: DoorOpen },
    { id: 'equipment', label: 'Equipamentos', icon: Camera },
    { id: 'loans', label: `Empréstimos${activeLoans.length > 0 ? ` (${activeLoans.length})` : ''}`, icon: ArrowLeftRight },
    { id: 'maintenance', label: `Manutenções${activeMaintenance.length > 0 ? ` (${activeMaintenance.length})` : ''}`, icon: Wrench },
  ];

  return (
    <div>
      <PageHeader title="Salas, cenários e equipamentos" subtitle="Gerencie espaços físicos, equipamentos, empréstimos e manutenções" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="card p-5"><div className="flex items-center gap-2"><DoorOpen className="h-4 w-4 text-sky-500" /><p className="text-sm text-slate-400">Salas/cenários</p></div><p className="text-2xl font-bold mt-1">{rooms.filter(r => r.is_active).length}</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><Camera className="h-4 w-4 text-emerald-500" /><p className="text-sm text-slate-400">Equipamentos</p></div><p className="text-2xl font-bold mt-1">{equipment.filter(e => e.is_active).length}</p><p className="text-xs text-emerald-600 mt-1">{availableEquipment.length} disponíveis</p></div>
        <div className="card p-5"><div className="flex items-center gap-2"><ArrowLeftRight className="h-4 w-4 text-amber-500" /><p className="text-sm text-slate-400">Emprestados</p></div><p className="text-2xl font-bold mt-1 text-amber-600">{activeLoans.length}</p>{overdueLoans.length > 0 && <p className="text-xs text-red-500 mt-1">{overdueLoans.length} atrasados</p>}</div>
        <div className="card p-5"><div className="flex items-center gap-2"><Wrench className="h-4 w-4 text-orange-500" /><p className="text-sm text-slate-400">Em manutenção</p></div><p className="text-2xl font-bold mt-1 text-orange-600">{activeMaintenance.length}</p></div>
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
          {/* ROOMS TAB */}
          {tab === 'rooms' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingRoom(null); setRoomForm({ name: '', type: 'sala', capacity: 0, description: '', is_active: true }); setRoomModal(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Nova sala/cenário</button>
              </div>
              {rooms.length === 0 ? (
                <div className="card p-8 text-center text-slate-400"><DoorOpen className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhuma sala ou cenário cadastrado.</p></div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rooms.map((r) => {
                    const conflict = checkRoomConflict(r.id);
                    return (
                      <div key={r.id} className={`card p-4 ${!r.is_active ? 'opacity-60' : ''}`}>
                        <div className="flex items-start justify-between">
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{r.name}</p>
                            <span className="badge badge-neutral text-xs">{roomTypeLabels[r.type] ?? r.type}</span>
                          </div>
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingRoom(r); setRoomForm({ name: r.name, type: r.type, capacity: r.capacity ?? 0, description: r.description ?? '', is_active: r.is_active }); setRoomModal(true); }} className="btn-ghost"><Pencil className="h-4 w-4" /></button>
                            <button onClick={() => setDeleteRoom(r)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                        {r.capacity && <p className="text-xs text-slate-400 mt-2">Capacidade: {r.capacity} pessoas</p>}
                        {r.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{r.description}</p>}
                        {conflict && <div className="mt-2 text-xs text-amber-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> Em uso em agendamento</div>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* EQUIPMENT TAB */}
          {tab === 'equipment' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => { setEditingEquip(null); setEquipForm({ name: '', category: '', serial_number: '', condition: 'otimo', is_active: true }); setEquipModal(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Novo equipamento</button>
              </div>
              {equipment.length === 0 ? (
                <div className="card p-8 text-center text-slate-400"><Camera className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhum equipamento cadastrado.</p></div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                      <tr><th className="px-4 py-3">Equipamento</th><th className="px-4 py-3 hidden md:table-cell">Categoria</th><th className="px-4 py-3 hidden md:table-cell">Série</th><th className="px-4 py-3">Condição</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {equipment.map((e) => {
                        const inMaint = isEquipmentInMaintenance(e.id);
                        const onLoan = isEquipmentOnLoan(e.id);
                        const conflict = checkEquipmentConflict(e.id);
                        return (
                          <tr key={e.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!e.is_active ? 'opacity-60' : ''}`}>
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{e.name}</td>
                            <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{e.category ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-400 hidden md:table-cell">{e.serial_number ?? '—'}</td>
                            <td className="px-4 py-3"><span className={`badge ${conditionBadge[e.condition] ?? 'badge-neutral'}`}>{conditionLabels[e.condition] ?? e.condition}</span></td>
                            <td className="px-4 py-3">
                              {inMaint ? <span className="badge badge-warning"><Wrench className="h-3 w-3" /> Manutenção</span>
                                : onLoan ? <span className="badge badge-warning"><ArrowLeftRight className="h-3 w-3" /> Emprestado</span>
                                : conflict ? <span className="badge badge-neutral">Em uso</span>
                                : <span className="badge badge-success">Disponível</span>}
                            </td>
                            <td className="px-4 py-3"><div className="flex items-center justify-end gap-1">
                              <button onClick={() => { setEditingEquip(e); setEquipForm({ name: e.name, category: e.category ?? '', serial_number: e.serial_number ?? '', condition: e.condition, is_active: e.is_active }); setEquipModal(true); }} className="btn-ghost"><Pencil className="h-4 w-4" /></button>
                              <button onClick={() => setDeleteEquip(e)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                            </div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* LOANS TAB */}
          {tab === 'loans' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => { setLoanForm({ equipment_id: '', responsible: '', checkout_date: todayISO(), expected_return_date: '', notes: '' }); setLoanModal(true); }} className="btn-primary" disabled={availableEquipment.length === 0}><Plus className="h-4 w-4" /> Novo empréstimo</button>
              </div>
              {loans.length === 0 ? (
                <div className="card p-8 text-center text-slate-400"><Package className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhum empréstimo registrado.</p></div>
              ) : (
                <div className="card overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-left text-xs uppercase text-slate-400">
                      <tr><th className="px-4 py-3">Equipamento</th><th className="px-4 py-3">Responsável</th><th className="px-4 py-3">Retirada</th><th className="px-4 py-3">Devol. prevista</th><th className="px-4 py-3">Devol. real</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Ações</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {loans.map((l) => {
                        const eq = equipment.find(e => e.id === l.equipment_id);
                        const isOverdue = l.status === 'emprestado' && l.expected_return_date && l.expected_return_date < today;
                        return (
                          <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">{eq?.name ?? '—'}</td>
                            <td className="px-4 py-3 text-slate-500">{l.responsible}</td>
                            <td className="px-4 py-3 text-slate-400">{formatDate(l.checkout_date)}</td>
                            <td className="px-4 py-3"><span className={isOverdue ? 'text-red-500 font-medium' : 'text-slate-400'}>{l.expected_return_date ? formatDate(l.expected_return_date) : '—'}</span></td>
                            <td className="px-4 py-3 text-slate-400">{l.actual_return_date ? formatDate(l.actual_return_date) : '—'}</td>
                            <td className="px-4 py-3"><span className={`badge ${isOverdue ? 'badge-danger' : loanStatusBadge[l.status] ?? 'badge-neutral'}`}>{isOverdue ? 'Atrasado' : loanStatusLabels[l.status] ?? l.status}</span></td>
                            <td className="px-4 py-3">
                              {l.status === 'emprestado' && <button onClick={() => handleReturnLoan(l)} className="btn-ghost text-emerald-600 text-xs" title="Registrar devolução"><CheckCircle className="h-4 w-4" /></button>}
                              <button onClick={() => setDeleteLoan(l)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {overdueLoans.length > 0 && (
                <div className="card p-4 mt-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
                  <div className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /><p className="text-sm text-red-700 dark:text-red-300">{overdueLoans.length} empréstimo(s) em atraso. Entre em contato com os responsáveis.</p></div>
                </div>
              )}
            </div>
          )}

          {/* MAINTENANCE TAB */}
          {tab === 'maintenance' && (
            <div>
              <div className="flex justify-end mb-4">
                <button onClick={() => { setMaintForm({ equipment_id: '', description: '', start_date: todayISO(), end_date: '', cost: 0, provider: '', notes: '' }); setMaintModal(true); }} className="btn-primary"><Plus className="h-4 w-4" /> Nova manutenção</button>
              </div>
              {maintenance.length === 0 ? (
                <div className="card p-8 text-center text-slate-400"><Wrench className="h-10 w-10 mx-auto mb-2 opacity-50" /><p className="text-sm">Nenhuma manutenção registrada.</p></div>
              ) : (
                <div className="space-y-3">
                  {maintenance.map((m) => {
                    const eq = equipment.find(e => e.id === m.equipment_id);
                    return (
                      <div key={m.id} className={`card p-4 ${m.status === 'em_manutencao' ? 'border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/10' : ''}`}>
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-semibold text-slate-900 dark:text-slate-100">{eq?.name ?? '—'}</p>
                              <span className={`badge ${m.status === 'em_manutencao' ? 'badge-warning' : 'badge-success'}`}>{maintenanceStatusLabels[m.status] ?? m.status}</span>
                            </div>
                            <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{m.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 flex-wrap">
                              <span>Início: {formatDate(m.start_date)}</span>
                              {m.end_date && <span>Fim: {formatDate(m.end_date)}</span>}
                              {m.cost > 0 && <span>Custo: {formatCurrency(m.cost)}</span>}
                              {m.provider && <span>Proveedor: {m.provider}</span>}
                            </div>
                            {m.notes && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{m.notes}</p>}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {m.status === 'em_manutencao' && <button onClick={() => handleFinishMaintenance(m)} className="btn-ghost text-emerald-600 text-xs"><CheckCircle className="h-4 w-4" /> Finalizar</button>}
                            <button onClick={() => setDeleteMaint(m)} className="btn-ghost text-red-500"><Trash2 className="h-4 w-4" /></button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {activeMaintenance.length > 0 && (
                <div className="card p-4 mt-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-amber-700 dark:text-amber-300">Equipamentos em manutenção não podem ser emprestados ou reservados até a conclusão.</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Room modal */}
      <Modal open={roomModal} onClose={() => setRoomModal(false)} title={editingRoom ? 'Editar sala/cenário' : 'Nova sala/cenário'} size="sm">
        <div className="space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={roomForm.name} onChange={(e) => setRoomForm({ ...roomForm, name: e.target.value })} /></div>
          <div><label className="label">Tipo</label><select className="input" value={roomForm.type} onChange={(e) => setRoomForm({ ...roomForm, type: e.target.value })}>{Object.entries(roomTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div><label className="label">Capacidade (pessoas)</label><input type="number" min="0" className="input" value={roomForm.capacity} onChange={(e) => setRoomForm({ ...roomForm, capacity: parseInt(e.target.value) || 0 })} /></div>
          <div><label className="label">Descrição</label><textarea className="input min-h-[60px]" value={roomForm.description} onChange={(e) => setRoomForm({ ...roomForm, description: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={roomForm.is_active} onChange={(e) => setRoomForm({ ...roomForm, is_active: e.target.checked })} /> Ativo</label>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setRoomModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveRoom} className="btn-primary">{editingRoom ? 'Salvar' : 'Criar'}</button></div>
      </Modal>

      {/* Equipment modal */}
      <Modal open={equipModal} onClose={() => setEquipModal(false)} title={editingEquip ? 'Editar equipamento' : 'Novo equipamento'} size="sm">
        <div className="space-y-4">
          <div><label className="label">Nome *</label><input className="input" value={equipForm.name} onChange={(e) => setEquipForm({ ...equipForm, name: e.target.value })} /></div>
          <div><label className="label">Categoria</label><input className="input" placeholder="Câmera, lente, iluminação..." value={equipForm.category} onChange={(e) => setEquipForm({ ...equipForm, category: e.target.value })} /></div>
          <div><label className="label">Número de série</label><input className="input" value={equipForm.serial_number} onChange={(e) => setEquipForm({ ...equipForm, serial_number: e.target.value })} /></div>
          <div><label className="label">Condição</label><select className="input" value={equipForm.condition} onChange={(e) => setEquipForm({ ...equipForm, condition: e.target.value })}>{Object.entries(conditionLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300"><input type="checkbox" checked={equipForm.is_active} onChange={(e) => setEquipForm({ ...equipForm, is_active: e.target.checked })} /> Ativo</label>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setEquipModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveEquipment} className="btn-primary">{editingEquip ? 'Salvar' : 'Criar'}</button></div>
      </Modal>

      {/* Loan modal */}
      <Modal open={loanModal} onClose={() => setLoanModal(false)} title="Novo empréstimo" size="sm">
        <div className="space-y-4">
          <div><label className="label">Equipamento *</label><select className="input" value={loanForm.equipment_id} onChange={(e) => setLoanForm({ ...loanForm, equipment_id: e.target.value })}><option value="">Selecione...</option>{availableEquipment.map((e) => <option key={e.id} value={e.id}>{e.name}{e.serial_number ? ` (${e.serial_number})` : ''}</option>)}</select></div>
          <div><label className="label">Responsável *</label><input className="input" value={loanForm.responsible} onChange={(e) => setLoanForm({ ...loanForm, responsible: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Data de retirada</label><input type="date" className="input" value={loanForm.checkout_date} onChange={(e) => setLoanForm({ ...loanForm, checkout_date: e.target.value })} /></div>
            <div><label className="label">Devolução prevista</label><input type="date" className="input" value={loanForm.expected_return_date} onChange={(e) => setLoanForm({ ...loanForm, expected_return_date: e.target.value })} /></div>
          </div>
          <div><label className="label">Observações</label><input className="input" value={loanForm.notes} onChange={(e) => setLoanForm({ ...loanForm, notes: e.target.value })} /></div>
          {availableEquipment.length === 0 && <p className="text-xs text-amber-600">Nenhum equipamento disponível para empréstimo no momento.</p>}
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setLoanModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveLoan} className="btn-primary">Registrar</button></div>
      </Modal>

      {/* Maintenance modal */}
      <Modal open={maintModal} onClose={() => setMaintModal(false)} title="Nova manutenção" size="md">
        <div className="space-y-4">
          <div><label className="label">Equipamento *</label><select className="input" value={maintForm.equipment_id} onChange={(e) => setMaintForm({ ...maintForm, equipment_id: e.target.value })}><option value="">Selecione...</option>{equipment.filter(e => e.is_active && !isEquipmentOnLoan(e.id)).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
          <div><label className="label">Descrição *</label><input className="input" placeholder="Ex: Troca de lente, revisão..." value={maintForm.description} onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Data de início</label><input type="date" className="input" value={maintForm.start_date} onChange={(e) => setMaintForm({ ...maintForm, start_date: e.target.value })} /></div>
            <div><label className="label">Data de fim (vazio = em manutenção)</label><input type="date" className="input" value={maintForm.end_date} onChange={(e) => setMaintForm({ ...maintForm, end_date: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Custo (R$)</label><input type="number" step="0.01" className="input" value={maintForm.cost} onChange={(e) => setMaintForm({ ...maintForm, cost: parseFloat(e.target.value) || 0 })} /></div>
            <div><label className="label">Proveedor</label><input className="input" value={maintForm.provider} onChange={(e) => setMaintForm({ ...maintForm, provider: e.target.value })} /></div>
          </div>
          <div><label className="label">Observações</label><input className="input" value={maintForm.notes} onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })} /></div>
        </div>
        <div className="flex justify-end gap-3 mt-6"><button onClick={() => setMaintModal(false)} className="btn-secondary">Cancelar</button><button onClick={handleSaveMaintenance} className="btn-primary">Registrar</button></div>
      </Modal>

      <ConfirmDialog open={!!deleteRoom} title="Excluir sala" message="Confirma a exclusão?" onConfirm={async () => { if (deleteRoom) { await supabase.from('rooms').delete().eq('id', deleteRoom.id); toast('Sala excluída', 'success'); setDeleteRoom(null); load(); } }} onCancel={() => setDeleteRoom(null)} />
      <ConfirmDialog open={!!deleteEquip} title="Excluir equipamento" message="Confirma a exclusão?" onConfirm={async () => { if (deleteEquip) { await supabase.from('equipment').delete().eq('id', deleteEquip.id); toast('Equipamento excluído', 'success'); setDeleteEquip(null); load(); } }} onCancel={() => setDeleteEquip(null)} />
      <ConfirmDialog open={!!deleteLoan} title="Excluir empréstimo" message="Confirma a exclusão?" onConfirm={async () => { if (deleteLoan) { await supabase.from('equipment_loans').delete().eq('id', deleteLoan.id); toast('Empréstimo excluído', 'success'); setDeleteLoan(null); load(); } }} onCancel={() => setDeleteLoan(null)} />
      <ConfirmDialog open={!!deleteMaint} title="Excluir manutenção" message="Confirma a exclusão?" onConfirm={async () => { if (deleteMaint) { await supabase.from('equipment_maintenance').delete().eq('id', deleteMaint.id); toast('Manutenção excluída', 'success'); setDeleteMaint(null); load(); } }} onCancel={() => setDeleteMaint(null)} />
    </div>
  );
}
