import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CalendarPlus, History, LayoutGrid } from 'lucide-react';
import { supabase, CourtReservation, CourtSession, Shift } from '../../lib/supabase';
import CourtCard from './CourtCard';
import EventModal from './EventModal';
import OpenCourtModal from './OpenCourtModal';
import TurnoView from './TurnoView';
import ReservationsCalendar from './ReservationsCalendar';
import TurnosHistory from './TurnosHistory';
import { COURTS, EventType, formatTime, minutesOf, nowTimeHHMM, todayISO } from './reservasUtils';

type Tab = 'canchas' | 'agenda' | 'historial';

interface EventDraft {
  type: EventType;
  event?: CourtReservation;
  court: number;
  date?: string;
  time?: string;
}

interface OpenDraft {
  court: number;
  reservation?: CourtReservation;
}

export default function Reservas({ shift }: { shift: Shift | null }) {
  const userName = shift?.user_name ?? '';
  const [tab, setTab] = useState<Tab>('canchas');
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<CourtSession[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [todayReservations, setTodayReservations] = useState<CourtReservation[]>([]);
  const [eventDraft, setEventDraft] = useState<EventDraft | null>(null);
  const [openDraft, setOpenDraft] = useState<OpenDraft | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadError, setLoadError] = useState('');

  const loadBoard = useCallback(async () => {
    const [sessionsRes, reservationsRes] = await Promise.all([
      supabase.from('court_sessions').select('*').eq('status', 'abierta'),
      supabase
        .from('court_reservations')
        .select('*')
        .eq('reservation_date', todayISO())
        .eq('status', 'reservada')
        .order('start_time'),
    ]);
    if (sessionsRes.error || reservationsRes.error) {
      setLoadError('No se pudo cargar el estado de las canchas.');
      return;
    }
    setLoadError('');
    const open = (sessionsRes.data as CourtSession[]) || [];
    setSessions(open);
    setTodayReservations((reservationsRes.data as CourtReservation[]) || []);

    if (open.length) {
      const { data: items } = await supabase
        .from('court_session_items')
        .select('session_id, price, quantity')
        .in('session_id', open.map((s) => s.id));
      const sums: Record<string, number> = {};
      for (const i of items || []) {
        sums[i.session_id] = (sums[i.session_id] ?? 0) + Number(i.price) * i.quantity;
      }
      setTotals(sums);
    } else {
      setTotals({});
    }
  }, []);

  useEffect(() => {
    loadBoard();
    const timer = setInterval(loadBoard, 30000);
    return () => clearInterval(timer);
  }, [loadBoard, refreshKey]);

  const refresh = () => setRefreshKey((k) => k + 1);

  const courtEvents = (court: number) => {
    const now = minutesOf(nowTimeHHMM());
    const pending = todayReservations.filter((r) => r.court === court && minutesOf(formatTime(r.end_time)) > now);
    const current = pending.find((r) => minutesOf(formatTime(r.start_time)) <= now + 60);
    return { current, next: current ? undefined : pending[0] };
  };

  if (turnoId) {
    return (
      <TurnoView
        sessionId={turnoId}
        shift={shift}
        onBack={() => {
          setTurnoId(null);
          refresh();
        }}
        onClosed={() => {
          setTurnoId(null);
          refresh();
        }}
      />
    );
  }

  const tabs: { id: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'canchas', label: 'Canchas', icon: LayoutGrid },
    { id: 'agenda', label: 'Agenda', icon: CalendarDays },
    { id: 'historial', label: 'Historial', icon: History },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-slate-900 text-white shadow' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <t.icon size={16} /> {t.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setEventDraft({ type: 'reserva', court: 0 })}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold shadow transition-colors"
        >
          <CalendarPlus size={18} /> Nueva reserva
        </button>
      </div>

      {loadError && <p className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{loadError}</p>}

      {tab === 'canchas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5">
          {COURTS.map((court) => {
            const session = sessions.find((s) => s.court === court);
            const { current: reservation, next } = session ? { current: undefined, next: undefined } : courtEvents(court);
            return (
              <CourtCard
                key={court}
                court={court}
                session={session}
                sessionTotal={session ? totals[session.id] ?? 0 : 0}
                reservation={reservation}
                nextEvent={next}
                onSchedule={() => setEventDraft({ type: 'reserva', court })}
                onOpen={() => setOpenDraft({ court })}
                onViewReservation={() => reservation && setEventDraft({ type: reservation.event_type, court, event: reservation })}
                onViewTurno={() => session && setTurnoId(session.id)}
              />
            );
          })}
        </div>
      )}

      {tab === 'agenda' && (
        <ReservationsCalendar
          refreshKey={refreshKey}
          onEdit={(event) => setEventDraft({ type: event.event_type, court: event.court, event })}
          onOpenTurno={setTurnoId}
          onCreate={(type, court, date, time) => setEventDraft({ type, court, date, time })}
        />
      )}

      {tab === 'historial' && <TurnosHistory refreshKey={refreshKey} />}

      {eventDraft && (
        <EventModal
          type={eventDraft.type}
          event={eventDraft.event}
          defaultCourt={eventDraft.court}
          defaultDate={eventDraft.date}
          defaultTime={eventDraft.time}
          userName={userName}
          onClose={() => setEventDraft(null)}
          onSaved={() => {
            setEventDraft(null);
            refresh();
          }}
          onOpenCourt={(reservation) => {
            setEventDraft(null);
            setOpenDraft({ court: reservation.court, reservation });
          }}
        />
      )}

      {openDraft && (
        <OpenCourtModal
          court={openDraft.court}
          reservation={openDraft.reservation}
          userName={userName}
          onClose={() => setOpenDraft(null)}
          onDone={(sessionId) => {
            setOpenDraft(null);
            refresh();
            setTurnoId(sessionId);
          }}
        />
      )}
    </div>
  );
}
