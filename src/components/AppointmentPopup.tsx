import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { todayISO, toLocalISODate, formatDate, formatTime } from '@/lib/utils';
import { Calendar, Clock, MapPin, User, X, CalendarDays } from 'lucide-react';
import type { Appointment, Client } from '@/lib/types';
import type { Page } from '@/components/Sidebar';

const appointmentTypeLabels: Record<string, string> = {
  ensaio: 'Ensaio',
  reuniao: 'Reunião',
  entrega: 'Entrega',
  pagamento: 'Pagamento',
  outro: 'Outro',
};

const statusLabels: Record<string, string> = {
  agendado: 'Agendado',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

const weekdayNames = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia!';
  if (h < 18) return 'Boa tarde!';
  return 'Boa noite!';
}

function isWithinNextDays(dateStr: string, days: number): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= days;
}

function isCloseToNow(dateStr: string, time: string): boolean {
  const now = new Date();
  const today = todayISO();
  if (dateStr !== today) return false;
  const [h, m] = time.split(':').map(Number);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const diffMin = (target.getTime() - now.getTime()) / (1000 * 60);
  return diffMin >= 0 && diffMin <= 60;
}

interface AppointmentPopupProps {
  onNavigate: (page: Page) => void;
}

export function AppointmentPopup({ onNavigate }: AppointmentPopupProps) {
  const [open, setOpen] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  useEffect(() => {
    let cancelled = false;
    const sessionKey = 'appointment-popup-shown';
    if (sessionStorage.getItem(sessionKey)) return;

    const load = async () => {
      const [apptRes, clientRes] = await Promise.all([
        supabase.from('appointments').select('*').order('appointment_date, start_time'),
        supabase.from('clients').select('id, full_name'),
      ]);
      if (cancelled) return;
      const allAppts = (apptRes.data as Appointment[]) ?? [];
      setClients((clientRes.data as Client[]) ?? []);
      const today = todayISO();
      const todayAppts = allAppts.filter((a) => a.appointment_date === today && a.status !== 'cancelado');
      const weekAppts = allAppts.filter((a) => {
        if (a.appointment_date === today) return false;
        return isWithinNextDays(a.appointment_date, 7) && a.status !== 'cancelado' && a.status !== 'concluido';
      });
      if (todayAppts.length > 0 || weekAppts.length > 0) {
        setAppointments([...todayAppts, ...weekAppts]);
        setOpen(true);
        sessionStorage.setItem(sessionKey, '1');
      }
    };
    const timer = setTimeout(load, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
  }, []);

  const today = todayISO();
  const todayDate = new Date();
  const todayAppts = appointments.filter((a) => a.appointment_date === today);
  const weekAppts = appointments.filter((a) => a.appointment_date !== today && isWithinNextDays(a.appointment_date, 7));
  const sortedToday = [...todayAppts].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const sortedWeek = [...weekAppts].sort((a, b) => a.appointment_date.localeCompare(b.appointment_date) || a.start_time.localeCompare(b.start_time));

  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.full_name ?? null;

  if (!open) return null;

  return (
    <Modal open={open} onClose={() => setOpen(false)} title="Seus compromissos" size="md">
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl flex items-center justify-center text-white flex-shrink-0" style={{ backgroundColor: 'var(--color-primary)' }}>
            <CalendarDays className="h-6 w-6" />
          </div>
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">{getGreeting()} Confira sua agenda.</p>
            <p className="text-sm text-slate-400">
              {weekdayNames[todayDate.getDay()]}, {formatDate(today)}
            </p>
          </div>
        </div>

        {sortedToday.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Compromissos de hoje — {formatDate(today)}
            </h4>
            <div className="space-y-2">
              {sortedToday.map((a) => {
                const close = isCloseToNow(a.appointment_date, a.start_time);
                const name = clientName(a.client_id);
                return (
                  <div
                    key={a.id}
                    className={`rounded-xl border p-3 transition-all ${close ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50'}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1 text-slate-500 flex-shrink-0">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-mono font-medium">{a.start_time}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{a.title}</p>
                        {name && <p className="text-xs text-slate-400 flex items-center gap-1"><User className="h-3 w-3" /> {name}</p>}
                        <div className="flex flex-wrap gap-2 mt-1">
                          <span className="badge badge-neutral text-xs">{appointmentTypeLabels[a.appointment_type] ?? a.appointment_type}</span>
                          <span className={`badge text-xs ${a.status === 'confirmado' ? 'badge-success' : 'badge-info'}`}>{statusLabels[a.status] ?? a.status}</span>
                          {close && <span className="badge badge-warning text-xs">Aproximando</span>}
                        </div>
                        {a.location && <p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {a.location}</p>}
                        {a.observations && <p className="text-xs text-slate-400 mt-1">{a.observations}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sortedWeek.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <CalendarDays className="h-4 w-4" />
              Próximos compromissos da semana
            </h4>
            <div className="space-y-2">
              {sortedWeek.map((a) => {
                const name = clientName(a.client_id);
                return (
                  <div key={a.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                    <div className="flex items-start gap-3">
                      <div className="flex items-center gap-1 text-slate-500 flex-shrink-0">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-mono font-medium">{a.start_time}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-slate-900 dark:text-slate-100 text-sm">{a.title}</p>
                        <p className="text-xs text-slate-400">{formatDate(a.appointment_date)} · {appointmentTypeLabels[a.appointment_type] ?? a.appointment_type}</p>
                        {name && <p className="text-xs text-slate-400 flex items-center gap-1"><User className="h-3 w-3" /> {name}</p>}
                        {a.location && <p className="text-xs text-slate-400 flex items-center gap-1 mt-1"><MapPin className="h-3 w-3" /> {a.location}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {sortedToday.length === 0 && sortedWeek.length === 0 && (
          <div className="text-center py-8">
            <Calendar className="h-12 w-12 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Nenhum compromisso para hoje ou nos próximos 7 dias.</p>
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <button onClick={() => { setOpen(false); onNavigate('agenda'); }} className="btn-primary text-sm">
            <Calendar className="h-4 w-4" /> Abrir agenda completa
          </button>
          <button onClick={() => setOpen(false)} className="btn-secondary text-sm">
            <X className="h-4 w-4" /> Fechar
          </button>
        </div>
      </div>
    </Modal>
  );
}
