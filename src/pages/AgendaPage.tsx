import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { toast } from '@/components/Toast';
import { formatDate, weekdaysShort, formatMonthYear, toLocalISODate } from '@/lib/utils';
import { Plus, ChevronLeft, ChevronRight, Calendar, Trash2, Pencil, Clock, Ban, Users, Bell, X } from 'lucide-react';
import type { Appointment, Client, Service, WaitlistEntry, ServiceOrder } from '@/lib/types';
import { ClientSearchSelect } from '@/components/ClientSearchSelect';
import { useSaving } from '@/lib/useSaving';

const appointmentTypeLabels: Record<string, string> = {
  ensaio: 'Ensaio',
  reuniao: 'Reunião',
  entrega: 'Entrega',
  pagamento: 'Pagamento',
  outro: 'Outro',
  bloqueio: 'Bloqueio',
};

const statusLabels: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const statusColors: Record<string, string> = {
  agendado: '#3b82f6',
  confirmado: '#10b981',
  concluido: '#6366f1',
  cancelado: '#ef4444',
};

const timePreferenceLabels: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  noite: 'Noite',
  qualquer: 'Qualquer horário',
};

const priorityLabels: Record<string, string> = {
  baixa: 'Baixa',
  normal: 'Normal',
  alta: 'Alta',
  urgente: 'Urgente',
};

const priorityColors: Record<string, string> = {
  baixa: 'text-slate-500',
  normal: 'text-sky-600',
  alta: 'text-amber-600',
  urgente: 'text-red-500',
};

function getEndTime(start: string, durationMin: number, endTime?: string | null): string {
  if (endTime) return endTime;
  const [h, m] = start.split(':').map(Number);
  const total = h * 60 + m + durationMin;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}`;
}

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function AgendaPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState<'month' | 'week' | 'day'>('month');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Appointment | null>(null);
  const [dayDetail, setDayDetail] = useState<string | null>(null);
  const [recurrence, setRecurrence] = useState<'none' | 'weekly' | 'biweekly' | 'monthly'>('none');
  const [recurrenceCount, setRecurrenceCount] = useState(4);
  const [waitlistModal, setWaitlistModal] = useState(false);
  const [startupPopupShown, setStartupPopupShown] = useState(false);
  const [startupData, setStartupData] = useState<{ today: Appointment[]; week: Appointment[]; overdueOrders: ServiceOrder[] } | null>(null);
  const [waitlistForm, setWaitlistForm] = useState({
    client_id: '', service_id: '', desired_period_start: toLocalISODate(new Date()), desired_period_end: '', time_preference: 'qualquer', priority: 'normal', observations: '',
  });
  const [waitlistDelete, setWaitlistDelete] = useState<WaitlistEntry | null>(null);
  const [cancelMatchWaitlist, setCancelMatchWaitlist] = useState<WaitlistEntry[]>([]);
  const startupShownRef = useRef(false);
  const { saving: savingAppt, withSaving: withSavingAppt } = useSaving();

  const [form, setForm] = useState<Partial<Appointment>>({
    title: '', client_id: '', service_id: '', appointment_date: '', start_time: '09:00',
    duration_min: 60, end_time: '', location: '', observations: '', appointment_type: 'ensaio',
    status: 'agendado', reminder: true, professional: '', room: '', equipment: '', prep_time_min: 0,
    is_blocked: false, block_reason: '',
  });

  const loadAppointments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('appointments').select('*').order('appointment_date, start_time');
    setAppointments((data as Appointment[]) ?? []);
    setLoading(false);
  }, []);

  const loadWaitlist = useCallback(async () => {
    const { data } = await supabase.from('waitlist').select('*').order('created_at', { ascending: false });
    setWaitlist((data as WaitlistEntry[]) ?? []);
  }, []);

  useEffect(() => {
    loadAppointments();
    loadWaitlist();
    (async () => { try { const { data } = await supabase.from('clients').select('*').eq('status', 'ativo').order('full_name'); setClients((data as Client[]) ?? []); } catch { toast('Erro ao carregar clientes', 'error'); } })();
    (async () => { try { const { data } = await supabase.from('services').select('*').eq('active', true).order('name'); setServices((data as Service[]) ?? []); } catch { /* ignore */ } })();
    (async () => { try { const { data } = await supabase.from('service_orders').select('*').order('due_date'); setOrders((data as ServiceOrder[]) ?? []); } catch { /* ignore */ } })();
  }, [loadAppointments, loadWaitlist]);

  // Startup popup: check today's and week's appointments + overdue orders
  useEffect(() => {
    if (startupShownRef.current || appointments.length === 0) return;
    startupShownRef.current = true;
    setStartupPopupShown(true);
    const todayStr = toLocalISODate(new Date());
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndStr = toLocalISODate(weekEnd);
    const today = appointments.filter((a) => a.appointment_date === todayStr && a.status !== 'cancelado' && !a.is_blocked);
    const week = appointments.filter((a) => a.appointment_date > todayStr && a.appointment_date <= weekEndStr && a.status !== 'cancelado' && !a.is_blocked);
    const overdueOrders = orders.filter((o) => o.due_date && o.status !== 'entregue' && o.status !== 'cancelado' && o.due_date < todayStr);
    if (today.length > 0 || week.length > 0 || overdueOrders.length > 0) {
      setStartupData({ today, week, overdueOrders });
    }
  }, [appointments, orders]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getCalendarDays = () => {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startWeekday = firstDay.getDay();
    const totalDays = lastDay.getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < startWeekday; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(new Date(year, month, d));
    while (days.length % 7 !== 0) days.push(null);
    return days;
  };

  const getAppointmentsForDate = (dateStr: string) => appointments.filter((a) => a.appointment_date === dateStr && a.status !== 'cancelado');

  const getWeekDays = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  };

  const openNew = (dateStr?: string) => {
    setEditing(null);
    setForm({
      title: '', client_id: '', service_id: '', appointment_date: dateStr ?? toLocalISODate(new Date()),
      start_time: '09:00', duration_min: 60, end_time: '', location: '', observations: '', appointment_type: 'ensaio',
      status: 'agendado', reminder: true, professional: '', room: '', equipment: '', prep_time_min: 0,
      is_blocked: false, block_reason: '',
    });
    setRecurrence('none');
    setRecurrenceCount(4);
    setModalOpen(true);
  };

  const openBlock = (dateStr?: string) => {
    setEditing(null);
    setForm({
      title: 'Bloqueio', appointment_date: dateStr ?? toLocalISODate(new Date()),
      start_time: '09:00', duration_min: 240, end_time: '', location: '', observations: '',
      appointment_type: 'bloqueio', status: 'agendado', reminder: false, professional: '', room: '', equipment: '',
      prep_time_min: 0, is_blocked: true, block_reason: '',
    });
    setModalOpen(true);
  };

  const openEdit = (a: Appointment) => {
    setEditing(a);
    setForm(a);
    setModalOpen(true);
  };

  // Conflict detection: check time overlap AND resource (professional, room, equipment)
  const checkConflict = (date: string, time: string, duration: number, excludeId?: string, professional?: string, room?: string, equipment?: string): { conflict: boolean; withAppointment?: Appointment; reason?: string } => {
    for (const a of appointments) {
      if (a.id === excludeId || a.status === 'cancelado' || a.appointment_date !== date) continue;
      const aStart = timeToMin(a.start_time);
      const aEnd = timeToMin(getEndTime(a.start_time, a.duration_min, a.end_time));
      const bStart = timeToMin(time);
      const bEnd = bStart + duration;
      const timeOverlap = bStart < aEnd && bEnd > aStart;
      if (!timeOverlap) continue;
      if (professional && a.professional === professional) return { conflict: true, withAppointment: a, reason: `Profissional "${professional}" ocupado` };
      if (room && a.room === room) return { conflict: true, withAppointment: a, reason: `Sala "${room}" ocupada` };
      if (equipment && a.equipment === equipment) return { conflict: true, withAppointment: a, reason: `Equipamento "${equipment}" ocupado` };
      // Generic time conflict (same time slot, no resource match)
      if (timeOverlap && !professional && !room && !equipment) return { conflict: true, withAppointment: a, reason: 'Conflito de horário' };
    }
    return { conflict: false };
  };

  const conflictResult = form.appointment_date && form.start_time
    ? checkConflict(form.appointment_date, form.start_time, form.duration_min ?? 60, editing?.id, form.professional || undefined, form.room || undefined, form.equipment || undefined)
    : { conflict: false };
  const hasConflict = conflictResult.conflict;

  const handleSave = async () => {
    if (!form.is_blocked && (!form.title || !form.appointment_date || !form.start_time)) { toast('Preencha título, data e horário', 'warning'); return; }
    if (hasConflict && !form.is_blocked) { toast(`${conflictResult.reason ?? 'Conflito de horário'}. Ajuste o horário ou recurso.`, 'warning'); return; }

    return withSavingAppt(async () => {
    const payload = { ...form, updated_at: new Date().toISOString() };

    if (editing) {
      const { error } = await supabase.from('appointments').update(payload).eq('id', editing.id);
      if (error) { toast('Erro ao atualizar', 'error'); return; }
      if (form.client_id) await supabase.from('client_history').insert({ client_id: form.client_id, event_type: 'agendamento', description: `Agendamento alterado: ${form.title}` });
      toast('Agendamento atualizado', 'success');
    } else {
      if (recurrence !== 'none' && recurrenceCount > 1 && !form.is_blocked) {
        const baseDate = new Date(form.appointment_date + 'T00:00:00');
        const rows = Array.from({ length: recurrenceCount }, (_, i) => {
          if (i === 0) return payload;
          const d = new Date(baseDate);
          if (recurrence === 'weekly') d.setDate(d.getDate() + 7 * i);
          else if (recurrence === 'biweekly') d.setDate(d.getDate() + 14 * i);
          else if (recurrence === 'monthly') d.setMonth(d.getMonth() + i);
          return { ...payload, appointment_date: toLocalISODate(d) };
        });
        const { error } = await supabase.from('appointments').insert(rows);
        if (error) { toast('Erro ao criar agendamentos', 'error'); return; }
        toast(`${recurrenceCount} agendamentos recorrentes criados`, 'success');
      } else {
        const { error } = await supabase.from('appointments').insert(payload);
        if (error) { toast('Erro ao criar', 'error'); return; }
        if (form.client_id) await supabase.from('client_history').insert({ client_id: form.client_id, event_type: 'agendamento', description: `Agendamento criado: ${form.title}` });
        toast(form.is_blocked ? 'Horário bloqueado' : 'Agendamento criado', 'success');
      }
    }
    setModalOpen(false);
    loadAppointments();
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const wasCanceled = deleteTarget.status === 'cancelado';
    const { error } = await supabase.from('appointments').delete().eq('id', deleteTarget.id);
    if (error) { toast('Erro ao excluir agendamento. Verifique sua conexão e tente novamente.', 'error'); return; }
    toast('Agendamento excluído', 'success');
    if (wasCanceled) {
      const matches = findWaitlistMatches(deleteTarget);
      if (matches.length > 0) {
        setCancelMatchWaitlist(matches);
      }
    }
    setDeleteTarget(null);
    loadAppointments();
  };

  const handleCancel = async (a: Appointment) => {
    const { error } = await supabase.from('appointments').update({ status: 'cancelado', updated_at: new Date().toISOString() }).eq('id', a.id);
    if (error) { toast('Erro ao cancelar agendamento. Verifique sua conexão e tente novamente.', 'error'); return; }
    if (a.client_id) await supabase.from('client_history').insert({ client_id: a.client_id, event_type: 'agendamento', description: `Agendamento cancelado: ${a.title}` });
    toast('Agendamento cancelado', 'success');
    const matches = findWaitlistMatches(a);
    if (matches.length > 0) {
      setCancelMatchWaitlist(matches);
    }
    loadAppointments();
  };

  const findWaitlistMatches = (a: Appointment): WaitlistEntry[] => {
    return waitlist.filter((w) => {
      if (w.status !== 'aguardando') return false;
      const periodOk = a.appointment_date >= w.desired_period_start && (!w.desired_period_end || a.appointment_date <= w.desired_period_end);
      if (!periodOk) return false;
      if (w.service_id && a.service_id && w.service_id !== a.service_id) return false;
      // Time preference check
      if (w.time_preference !== 'qualquer') {
        const hour = parseInt(a.start_time.split(':')[0]);
        if (w.time_preference === 'manha' && hour >= 12) return false;
        if (w.time_preference === 'tarde' && (hour < 12 || hour >= 18)) return false;
        if (w.time_preference === 'noite' && hour < 18) return false;
      }
      return true;
    });
  };

  // Waitlist CRUD
  const handleAddWaitlist = async () => {
    if (!waitlistForm.client_id) { toast('Selecione um cliente', 'warning'); return; }
    if (!waitlistForm.desired_period_start) { toast('Informe o período desejado', 'warning'); return; }
    const { error } = await supabase.from('waitlist').insert({
      client_id: waitlistForm.client_id,
      service_id: waitlistForm.service_id || null,
      desired_period_start: waitlistForm.desired_period_start,
      desired_period_end: waitlistForm.desired_period_end || null,
      time_preference: waitlistForm.time_preference,
      priority: waitlistForm.priority,
      observations: waitlistForm.observations || null,
      status: 'aguardando',
    });
    if (error) { toast('Erro ao adicionar à lista de espera', 'error'); return; }
    toast('Cliente adicionado à lista de espera', 'success');
    setWaitlistForm({ client_id: '', service_id: '', desired_period_start: toLocalISODate(new Date()), desired_period_end: '', time_preference: 'qualquer', priority: 'normal', observations: '' });
    setWaitlistModal(false);
    loadWaitlist();
  };

  const handleWaitlistStatus = async (w: WaitlistEntry, status: string) => {
    const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
    if (status === 'atendido') update.attended_at = new Date().toISOString();
    const { error } = await supabase.from('waitlist').update(update).eq('id', w.id);
    if (error) { toast('Erro ao atualizar status. Verifique sua conexão.', 'error'); return; }
    toast(status === 'atendido' ? 'Solicitação marcada como atendida' : 'Solicitação cancelada', 'success');
    loadWaitlist();
  };

  const handleWaitlistDelete = async () => {
    if (!waitlistDelete) return;
    const { error } = await supabase.from('waitlist').delete().eq('id', waitlistDelete.id);
    if (error) { toast('Erro ao remover registro. Verifique sua conexão.', 'error'); return; }
    toast('Registro removido da lista de espera', 'success');
    setWaitlistDelete(null);
    loadWaitlist();
  };

  const todayStr = toLocalISODate(new Date());
  const upcomingAppointments = appointments.filter((a) => a.appointment_date >= todayStr && a.status !== 'cancelado' && a.status !== 'concluido' && !a.is_blocked).sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.start_time.localeCompare(b.start_time)).slice(0, 8);

  const activeWaitlist = waitlist.filter((w) => w.status === 'aguardando');

  return (
    <div>
      <PageHeader
        title="Agenda e calendário"
        subtitle="Gerencie seus compromissos, ensaios e lista de espera"
        actions={
          <div className="flex gap-2">
            <button onClick={() => setWaitlistModal(true)} className="btn-secondary"><Users className="h-4 w-4" /> Lista de espera{activeWaitlist.length > 0 && <span className="ml-1 badge badge-warning">{activeWaitlist.length}</span>}</button>
            <button onClick={() => openBlock()} className="btn-secondary text-amber-600"><Ban className="h-4 w-4" /> Bloquear</button>
            <button onClick={() => openNew()} className="btn-primary"><Plus className="h-4 w-4" /> Novo compromisso</button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="card p-4">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {view !== 'day' && (
                  <>
                    <button onClick={() => { if (view === 'week') { const d = new Date(currentDate); d.setDate(d.getDate() - 7); setCurrentDate(d); } else setCurrentDate(new Date(year, month - 1, 1)); }} className="btn-ghost"><ChevronLeft className="h-4 w-4" /></button>
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 capitalize min-w-[160px] text-center">{view === 'week' ? `Semana de ${formatDate(toLocalISODate(getWeekDays()[0]))}` : formatMonthYear(currentDate)}</h3>
                    <button onClick={() => { if (view === 'week') { const d = new Date(currentDate); d.setDate(d.getDate() + 7); setCurrentDate(d); } else setCurrentDate(new Date(year, month + 1, 1)); }} className="btn-ghost"><ChevronRight className="h-4 w-4" /></button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => setCurrentDate(new Date())} className="btn-secondary text-xs px-3">Hoje</button>
                <div className="flex gap-1 ml-2">
                  <button onClick={() => setView('day')} className={`btn-ghost text-xs px-3 py-1.5 rounded-lg ${view === 'day' ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100' : ''}`}>Dia</button>
                  <button onClick={() => setView('week')} className={`btn-ghost text-xs px-3 py-1.5 rounded-lg ${view === 'week' ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100' : ''}`}>Semana</button>
                  <button onClick={() => setView('month')} className={`btn-ghost text-xs px-3 py-1.5 rounded-lg ${view === 'month' ? 'bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-slate-100' : ''}`}>Mês</button>
                </div>
              </div>
            </div>

            {view === 'month' && (
              <div>
                <div className="grid grid-cols-7 gap-1 mb-1">
                  {weekdaysShort().map((d) => <div key={d} className="text-center text-xs font-medium text-slate-400 py-2">{d}</div>)}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {getCalendarDays().map((d, i) => {
                    if (!d) return <div key={i} />;
                    const dateStr = toLocalISODate(d);
                    const dayAppts = getAppointmentsForDate(dateStr);
                    const isToday = dateStr === todayStr;
                    const isBirthday = clients.some((c) => c.birth_date && c.birth_date.slice(5) === dateStr.slice(5));
                    const hasBlocked = dayAppts.some((a) => a.is_blocked);
                    return (
                      <button
                        key={i}
                        onClick={() => { setDayDetail(dateStr); }}
                        className={`min-h-[90px] rounded-lg border p-1.5 text-left transition-all hover:shadow-md ${isToday ? 'border-2' : 'border-slate-100 dark:border-slate-700'} ${dayAppts.length > 0 ? 'bg-slate-50 dark:bg-slate-800/50' : ''}`}
                        style={isToday ? { borderColor: 'var(--color-primary)' } : undefined}
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${isToday ? '' : 'text-slate-600 dark:text-slate-300'}`} style={isToday ? { color: 'var(--color-primary)' } : undefined}>{d.getDate()}</span>
                          {isBirthday && <span className="text-xs" title="Aniversário">🎂</span>}
                          {hasBlocked && <Ban className="h-3 w-3 text-amber-500" />}
                        </div>
                        <div className="space-y-0.5 mt-1">
                          {dayAppts.slice(0, 3).map((a) => (
                            <div key={a.id} className="text-xs rounded px-1 py-0.5 truncate text-white" style={{ backgroundColor: a.is_blocked ? '#f59e0b' : statusColors[a.status] ?? '#64748b', opacity: 0.85 }}>
                              {a.start_time} {a.is_blocked ? 'Bloqueio' : a.title}
                            </div>
                          ))}
                          {dayAppts.length > 3 && <div className="text-xs text-slate-400">+{dayAppts.length - 3} mais</div>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {view === 'week' && (
              <div className="grid grid-cols-7 gap-2 overflow-x-auto">
                {getWeekDays().map((d) => {
                  const dateStr = toLocalISODate(d);
                  const dayAppts = getAppointmentsForDate(dateStr);
                  const isToday = dateStr === todayStr;
                  return (
                    <div key={dateStr} className={`min-h-[220px] rounded-lg border p-2 ${isToday ? 'border-2' : 'border-slate-100 dark:border-slate-700'}`} style={isToday ? { borderColor: 'var(--color-primary)' } : undefined}>
                      <p className={`text-sm font-medium mb-2 ${isToday ? '' : 'text-slate-600 dark:text-slate-300'}`} style={isToday ? { color: 'var(--color-primary)' } : undefined}>{d.getDate()}/{d.getMonth() + 1}</p>
                      <div className="space-y-1">
                        {dayAppts.map((a) => (
                          <button key={a.id} onClick={() => openEdit(a)} className="block w-full text-left text-xs rounded px-1.5 py-1 text-white truncate" style={{ backgroundColor: a.is_blocked ? '#f59e0b' : statusColors[a.status] ?? '#64748b', opacity: 0.85 }}>
                            {a.start_time} {a.is_blocked ? 'Bloqueio' : a.title}
                          </button>
                        ))}
                        <button onClick={() => openNew(dateStr)} className="text-xs text-slate-400 hover:text-slate-600 w-full text-left">+ adicionar</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {view === 'day' && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); setCurrentDate(d); }} className="btn-ghost"><ChevronLeft className="h-4 w-4" /></button>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{formatDate(toLocalISODate(currentDate))}</h3>
                  <button onClick={() => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); setCurrentDate(d); }} className="btn-ghost"><ChevronRight className="h-4 w-4" /></button>
                </div>
                <div className="space-y-2">
                  {getAppointmentsForDate(toLocalISODate(currentDate)).length === 0 ? (
                    <p className="text-center text-slate-400 py-12">Nenhum compromisso para este dia.</p>
                  ) : (
                    getAppointmentsForDate(toLocalISODate(currentDate)).sort((a, b) => a.start_time.localeCompare(b.start_time)).map((a) => {
                      const client = clients.find((c) => c.id === a.client_id);
                      const endTime = getEndTime(a.start_time, a.duration_min, a.end_time);
                      return (
                        <div key={a.id} className={`card p-3 flex items-center gap-3 ${a.is_blocked ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' : ''}`}>
                          <div className="flex items-center gap-1 text-slate-400"><Clock className="h-4 w-4" /><span className="text-sm font-mono">{a.start_time}–{endTime}</span></div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-slate-900 dark:text-slate-100 truncate">{a.is_blocked ? `Bloqueio: ${a.block_reason ?? 'Indisponível'}` : a.title}</p>
                            <p className="text-xs text-slate-400">
                              {a.is_blocked ? null : <>{client?.full_name ?? 'Sem cliente'} · {a.duration_min}min · {appointmentTypeLabels[a.appointment_type]}</>}
                              {a.professional && ` · ${a.professional}`}
                              {a.room && ` · ${a.room}`}
                            </p>
                          </div>
                          <span className="badge" style={{ backgroundColor: a.is_blocked ? '#f59e0b' : statusColors[a.status], color: '#fff' }}>{a.is_blocked ? 'Bloqueado' : statusLabels[a.status]}</span>
                          {!a.is_blocked && a.status !== 'cancelado' && a.status !== 'concluido' && (
                            <button onClick={() => handleCancel(a)} className="btn-ghost text-amber-600 text-xs" title="Cancelar">Cancelar</button>
                          )}
                          <button onClick={() => openEdit(a)} className="btn-ghost"><Pencil className="h-4 w-4" /></button>
                        </div>
                      );
                    })
                  )}
                  <button onClick={() => openNew(toLocalISODate(currentDate))} className="btn-secondary w-full justify-center"><Plus className="h-4 w-4" /> Adicionar compromisso</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {/* Day detail */}
          {dayDetail && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-slate-900 dark:text-slate-100">{formatDate(dayDetail)}</h3>
                <button onClick={() => setDayDetail(null)} className="btn-ghost text-xs">Fechar</button>
              </div>
              {getAppointmentsForDate(dayDetail).length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Sem compromissos.</p>
              ) : (
                <div className="space-y-2">
                  {getAppointmentsForDate(dayDetail).sort((a, b) => a.start_time.localeCompare(b.start_time)).map((a) => {
                    const client = clients.find((c) => c.id === a.client_id);
                    return (
                      <div key={a.id} className="flex items-center gap-2 text-sm">
                        <span className="text-slate-400 font-mono text-xs">{a.start_time}</span>
                        <button onClick={() => openEdit(a)} className="flex-1 text-left">
                          <span className="text-slate-900 dark:text-slate-100">{a.is_blocked ? `Bloqueio: ${a.block_reason ?? ''}` : a.title}</span>
                          <span className="text-xs text-slate-400 block">{a.is_blocked ? null : client?.full_name}</span>
                        </button>
                        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.is_blocked ? '#f59e0b' : statusColors[a.status] }} />
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button onClick={() => openNew(dayDetail)} className="btn-secondary flex-1 justify-center text-xs"><Plus className="h-3 w-3" /> Adicionar</button>
                <button onClick={() => openBlock(dayDetail)} className="btn-secondary flex-1 justify-center text-xs text-amber-600"><Ban className="h-3 w-3" /> Bloquear</button>
              </div>
            </div>
          )}

          {/* Upcoming appointments */}
          <div className="card p-4">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Próximos compromissos</h3>
            {upcomingAppointments.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Nenhum compromisso próximo.</p>
            ) : (
              <div className="space-y-2">
                {upcomingAppointments.map((a) => {
                  const client = clients.find((c) => c.id === a.client_id);
                  return (
                    <button key={a.id} onClick={() => openEdit(a)} className="block w-full text-left card p-3 hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Calendar className="h-3 w-3" />{formatDate(a.appointment_date)} · {a.start_time}
                        <span className="h-2 w-2 rounded-full ml-auto" style={{ backgroundColor: statusColors[a.status] }} />
                      </div>
                      <p className="font-medium text-slate-900 dark:text-slate-100 mt-1">{a.title}</p>
                      <p className="text-xs text-slate-400">{client?.full_name ?? 'Sem cliente'}{a.location ? ` · ${a.location}` : ''}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Waitlist summary */}
          {activeWaitlist.length > 0 && (
            <div className="card p-4">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2"><Users className="h-4 w-4" /> Lista de espera ({activeWaitlist.length})</h3>
              <div className="space-y-2">
                {activeWaitlist.slice(0, 5).map((w) => {
                  const client = clients.find((c) => c.id === w.client_id);
                  const service = services.find((s) => s.id === w.service_id);
                  return (
                    <div key={w.id} className="flex items-center justify-between text-sm">
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{client?.full_name ?? '—'}</p>
                        <p className="text-xs text-slate-400">{service?.name ?? 'Qualquer serviço'} · {timePreferenceLabels[w.time_preference]} · a partir de {formatDate(w.desired_period_start)}</p>
                      </div>
                      <span className={`text-xs font-medium ${priorityColors[w.priority]}`}>{priorityLabels[w.priority]}</span>
                    </div>
                  );
                })}
                <button onClick={() => setWaitlistModal(true)} className="btn-secondary w-full justify-center text-xs mt-2">Ver lista completa</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Startup popup */}
      {startupPopupShown && startupData && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setStartupPopupShown(false)} />
          <div className="relative w-full max-w-lg rounded-2xl bg-white dark:bg-slate-800 shadow-2xl p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2"><Bell className="h-5 w-5" style={{ color: 'var(--color-primary)' }} /> Resumo do dia</h3>
              <button onClick={() => setStartupPopupShown(false)} className="btn-ghost"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-4">
              {startupData.today.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Hoje ({startupData.today.length})</h4>
                  {startupData.today.map((a) => {
                    const client = clients.find((c) => c.id === a.client_id);
                    return (
                      <button key={a.id} onClick={() => { setStartupPopupShown(false); openEdit(a); }} className="block w-full text-left card p-2 mb-1 hover:shadow-sm">
                        <span className="text-xs font-mono text-slate-400">{a.start_time}</span>
                        <span className="text-sm text-slate-900 dark:text-slate-100 ml-2">{a.title}</span>
                        <span className="text-xs text-slate-400 block ml-12">{client?.full_name}{a.location ? ` · ${a.location}` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {startupData.week.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Esta semana ({startupData.week.length})</h4>
                  {startupData.week.slice(0, 5).map((a) => {
                    const client = clients.find((c) => c.id === a.client_id);
                    return (
                      <button key={a.id} onClick={() => { setStartupPopupShown(false); openEdit(a); }} className="block w-full text-left card p-2 mb-1 hover:shadow-sm">
                        <span className="text-xs text-slate-400">{formatDate(a.appointment_date)} · {a.start_time}</span>
                        <span className="text-sm text-slate-900 dark:text-slate-100 ml-2">{a.title}</span>
                        <span className="text-xs text-slate-400 block ml-2">{client?.full_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {startupData.overdueOrders.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400 mb-2">Pedidos atrasados ({startupData.overdueOrders.length})</h4>
                  {startupData.overdueOrders.slice(0, 5).map((o) => (
                    <div key={o.id} className="card p-2 mb-1 border-amber-200 dark:border-amber-800">
                      <span className="text-sm text-slate-900 dark:text-slate-100">{o.code} — {o.title}</span>
                      <span className="text-xs text-red-500 block">Prazo: {formatDate(o.due_date)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => setStartupPopupShown(false)} className="btn-primary w-full justify-center mt-4">Entendi</button>
          </div>
        </div>
      )}

      {/* Appointment/Block Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? (form.is_blocked ? 'Editar bloqueio' : 'Editar compromisso') : (form.is_blocked ? 'Bloquear horário' : 'Novo compromisso')} size="md">
        <div className="space-y-4">
          {!form.is_blocked && <div><label className="label">Título *</label><input className="input" value={form.title ?? ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>}
          {form.is_blocked && <div><label className="label">Motivo do bloqueio</label><input className="input" placeholder="Férias, manutenção, indisponibilidade..." value={form.block_reason ?? ''} onChange={(e) => setForm({ ...form, block_reason: e.target.value, title: `Bloqueio: ${e.target.value}` })} /></div>}
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Data *</label><input type="date" className="input" value={form.appointment_date ?? ''} onChange={(e) => setForm({ ...form, appointment_date: e.target.value })} /></div>
            <div><label className="label">Horário *</label><input type="time" className="input" value={form.start_time ?? ''} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><label className="label">Duração (min)</label><input type="number" className="input" value={form.duration_min ?? 60} onChange={(e) => setForm({ ...form, duration_min: parseInt(e.target.value) || 60, end_time: '' })} /></div>
            {!form.is_blocked && <div><label className="label">Horário de término</label><input type="time" className="input" value={form.end_time ?? ''} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>}
          </div>
          {!form.is_blocked && (
            <>
              <div><label className="label">Cliente</label><ClientSearchSelect clients={clients} value={form.client_id} onChange={(id) => setForm({ ...form, client_id: id })} onClientCreated={(c) => setClients((prev) => [...prev, c])} /></div>
              <div><label className="label">Serviço</label><select className="input" value={form.service_id ?? ''} onChange={(e) => setForm({ ...form, service_id: e.target.value || null })}><option value="">Sem serviço</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label">Local *</label><input className="input" value={form.location ?? ''} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="label">Tipo</label><select className="input" value={form.appointment_type ?? 'ensaio'} onChange={(e) => setForm({ ...form, appointment_type: e.target.value })}>{Object.entries(appointmentTypeLabels).filter(([k]) => k !== 'bloqueio').map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
                <div><label className="label">Status</label><select className="input" value={form.status ?? 'agendado'} onChange={(e) => setForm({ ...form, status: e.target.value })}>{Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div><label className="label">Profissional</label><input className="input" placeholder="Nome" value={form.professional ?? ''} onChange={(e) => setForm({ ...form, professional: e.target.value })} /></div>
                <div><label className="label">Sala/recurso</label><input className="input" placeholder="Sala 1" value={form.room ?? ''} onChange={(e) => setForm({ ...form, room: e.target.value })} /></div>
                <div><label className="label">Equipamento</label><input className="input" placeholder="Câmera" value={form.equipment ?? ''} onChange={(e) => setForm({ ...form, equipment: e.target.value })} /></div>
              </div>
              <div><label className="label">Preparação de cenário (min)</label><input type="number" className="input" value={form.prep_time_min ?? 0} onChange={(e) => setForm({ ...form, prep_time_min: parseInt(e.target.value) || 0 })} /></div>
              <div><label className="label">Observações</label><textarea className="input min-h-[60px]" value={form.observations ?? ''} onChange={(e) => setForm({ ...form, observations: e.target.value })} /></div>
              {!editing && (
                <div className="card p-3 bg-slate-50 dark:bg-slate-800/50">
                  <label className="label">Repetição</label>
                  <div className="grid grid-cols-2 gap-3">
                    <select className="input text-sm" value={recurrence} onChange={(e) => setRecurrence(e.target.value as 'none' | 'weekly' | 'biweekly' | 'monthly')}>
                      <option value="none">Sem repetição</option><option value="weekly">Semanal</option><option value="biweekly">Quinzenal</option><option value="monthly">Mensal</option>
                    </select>
                    {recurrence !== 'none' && <input type="number" min={1} max={52} className="input text-sm" value={recurrenceCount} onChange={(e) => setRecurrenceCount(parseInt(e.target.value) || 1)} placeholder="Repetições" />}
                  </div>
                </div>
              )}
              {hasConflict && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                  ⚠ {conflictResult.reason ?? 'Conflito de horário'} detectado. Ajuste o horário ou recurso.
                </div>
              )}
            </>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
          {editing && <button onClick={() => setDeleteTarget(editing)} className="btn-danger"><Trash2 className="h-4 w-4" /> Excluir</button>}
          <button onClick={handleSave} disabled={savingAppt} className="btn-primary">{savingAppt ? 'Salvando...' : (editing ? 'Salvar' : (form.is_blocked ? 'Bloquear' : 'Criar'))}</button>
        </div>
      </Modal>

      {/* Waitlist Modal */}
      <Modal open={waitlistModal} onClose={() => setWaitlistModal(false)} title="Lista de espera" size="lg">
        <div className="space-y-4">
          {/* Add form */}
          <div className="card p-4 bg-slate-50 dark:bg-slate-800/50">
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">Adicionar à lista de espera</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className="label">Cliente *</label><ClientSearchSelect clients={clients} value={waitlistForm.client_id} onChange={(id) => setWaitlistForm({ ...waitlistForm, client_id: id ?? '' })} onClientCreated={(c) => setClients((prev) => [...prev, c])} /></div>
              <div><label className="label">Serviço pretendido</label><select className="input" value={waitlistForm.service_id} onChange={(e) => setWaitlistForm({ ...waitlistForm, service_id: e.target.value })}><option value="">Qualquer serviço</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="label">A partir de *</label><input type="date" className="input" value={waitlistForm.desired_period_start} onChange={(e) => setWaitlistForm({ ...waitlistForm, desired_period_start: e.target.value })} /></div>
              <div><label className="label">Até (opcional)</label><input type="date" className="input" value={waitlistForm.desired_period_end} onChange={(e) => setWaitlistForm({ ...waitlistForm, desired_period_end: e.target.value })} /></div>
              <div><label className="label">Preferência de horário</label><select className="input" value={waitlistForm.time_preference} onChange={(e) => setWaitlistForm({ ...waitlistForm, time_preference: e.target.value })}>{Object.entries(timePreferenceLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
              <div><label className="label">Prioridade</label><select className="input" value={waitlistForm.priority} onChange={(e) => setWaitlistForm({ ...waitlistForm, priority: e.target.value })}>{Object.entries(priorityLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            </div>
            <div className="mt-3"><label className="label">Observações</label><input className="input" placeholder="Restrições, preferências adicionais..." value={waitlistForm.observations} onChange={(e) => setWaitlistForm({ ...waitlistForm, observations: e.target.value })} /></div>
            <button onClick={handleAddWaitlist} className="btn-primary mt-3"><Plus className="h-4 w-4" /> Adicionar</button>
          </div>

          {/* List */}
          {waitlist.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-6">Nenhum registro na lista de espera.</p>
          ) : (
            <div className="space-y-2">
              {waitlist.map((w) => {
                const client = clients.find((c) => c.id === w.client_id);
                const service = services.find((s) => s.id === w.service_id);
                return (
                  <div key={w.id} className={`card p-3 ${w.status !== 'aguardando' ? 'opacity-60' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-slate-900 dark:text-slate-100">{client?.full_name ?? '—'}</p>
                          <span className={`badge ${w.status === 'aguardando' ? 'badge-warning' : w.status === 'atendido' ? 'badge-success' : 'badge-neutral'}`}>{w.status === 'aguardando' ? 'Aguardando' : w.status === 'atendido' ? 'Atendido' : 'Cancelado'}</span>
                          <span className={`text-xs font-medium ${priorityColors[w.priority]}`}>{priorityLabels[w.priority]}</span>
                        </div>
                        <p className="text-xs text-slate-400 mt-1">{service?.name ?? 'Qualquer serviço'} · {timePreferenceLabels[w.time_preference]} · {formatDate(w.desired_period_start)}{w.desired_period_end ? ` até ${formatDate(w.desired_period_end)}` : ''}</p>
                        {w.observations && <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{w.observations}</p>}
                      </div>
                      {w.status === 'aguardando' && (
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => handleWaitlistStatus(w, 'atendido')} className="btn-ghost text-xs text-emerald-600" title="Marcar como atendido">Atender</button>
                          <button onClick={() => handleWaitlistStatus(w, 'cancelado')} className="btn-ghost text-xs text-amber-600" title="Cancelar">Cancelar</button>
                          <button onClick={() => setWaitlistDelete(w)} className="btn-ghost text-xs text-red-500" title="Excluir"><Trash2 className="h-3 w-3" /></button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-xs text-slate-400">A lista de espera sugere contatos quando ocorrem cancelamentos compatíveis. Nenhum agendamento é criado automaticamente e nenhuma mensagem é enviada sem autorização.</p>
        </div>
      </Modal>

      {/* Cancel-match waitlist popup */}
      <Modal open={cancelMatchWaitlist.length > 0} onClose={() => setCancelMatchWaitlist([])} title="Clientes interessados disponíveis" size="md">
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Um cancelamento ocorreu e os seguintes clientes na lista de espera têm preferências compatíveis com o horário liberado. Entre em contato para confirmar o interesse.</p>
          {cancelMatchWaitlist.map((w) => {
            const client = clients.find((c) => c.id === w.client_id);
            const service = services.find((s) => s.id === w.service_id);
            return (
              <div key={w.id} className="card p-3 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900 dark:text-slate-100">{client?.full_name}</p>
                  <p className="text-xs text-slate-400">{service?.name ?? 'Qualquer serviço'} · {timePreferenceLabels[w.time_preference]} · {client?.phone ?? 'Sem telefone'}</p>
                </div>
                <button onClick={() => { setCancelMatchWaitlist([]); openNew(); }} className="btn-ghost text-xs text-emerald-600">Agendar</button>
              </div>
            );
          })}
          <button onClick={() => setCancelMatchWaitlist([])} className="btn-secondary w-full justify-center">Fechar</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} title={deleteTarget?.is_blocked ? 'Remover bloqueio' : 'Excluir compromisso'} message={deleteTarget?.is_blocked ? 'Confirma a remoção deste bloqueio?' : 'Confirma a exclusão deste agendamento?'} onConfirm={handleDelete} onCancel={() => setDeleteTarget(null)} />
      <ConfirmDialog open={!!waitlistDelete} title="Remover da lista de espera" message="Confirma a remoção deste registro?" onConfirm={handleWaitlistDelete} onCancel={() => setWaitlistDelete(null)} />
    </div>
  );
}