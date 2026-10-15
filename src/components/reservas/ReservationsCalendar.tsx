import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarPlus, ChevronLeft, ChevronRight, GraduationCap, Lock, Trophy, Wrench } from 'lucide-react';
import { supabase, CourtReservation, CourtSession } from '../../lib/supabase';
import AgendaTimeline, { AgendaBlock, AgendaColumn } from './AgendaTimeline';
import TurnoDetailModal from './TurnoDetailModal';
import {
  COURTS,
  EVENT_META,
  EventType,
  addDaysISO,
  courtLabel,
  eventSummary,
  formatClock,
  formatDateLong,
  formatDateShort,
  formatTime,
  hhmmOf,
  localDateOf,
  minutesOf,
  nowTimeHHMM,
  startOfWeekISO,
  todayISO,
} from './reservasUtils';

type Mode = 'dia' | 'semana' | 'cancha';

interface ReservationsCalendarProps {
  refreshKey: number;
  onEdit: (event: CourtReservation) => void;
  onOpenTurno: (sessionId: string) => void;
  onCreate: (type: EventType, court: number, date: string, time?: string) => void;
}

const LAST_MINUTE = 23 * 60 + 59;

const CREATE_BUTTONS: { type: EventType; label: string; icon: typeof Trophy }[] = [
  { type: 'reserva', label: 'Registrar reserva', icon: CalendarPlus },
  { type: 'clase', label: 'Registrar clase', icon: GraduationCap },
  { type: 'torneo', label: 'Registrar torneo', icon: Trophy },
  { type: 'mantenimiento', label: 'Mantenimiento', icon: Wrench },
];

const playerLabel = (lot: string, name: string) => `${name}${lot ? ` · Lote ${lot}` : ''}`;

const buildBlocks = (events: CourtReservation[], sessions: CourtSession[]): AgendaBlock[] => {
  const blocks: AgendaBlock[] = [];
  const byId = new Map(events.map((e) => [e.id, e]));
  const nowMin = minutesOf(nowTimeHHMM());
  const today = todayISO();

  for (const e of events) {
    if (e.status !== 'reservada') continue;
    const fallback = e.event_type === 'mantenimiento' ? 'Cancha bloqueada' : '';
    blocks.push({
      key: e.id,
      kind: e.event_type,
      court: e.court,
      date: e.reservation_date,
      startMin: minutesOf(formatTime(e.start_time)),
      endMin: minutesOf(formatTime(e.end_time)),
      headline: eventSummary(e) || fallback,
      detail: e.notes,
      reservation: e,
    });
  }

  for (const s of sessions) {
    const date = localDateOf(s.opened_at);
    const startMin = minutesOf(formatClock(s.opened_at));
    const linked = s.reservation_id ? byId.get(s.reservation_id) : undefined;
    let endMin: number;
    if (s.status === 'abierta') {
      const liveEnd = date === today ? nowMin : LAST_MINUTE;
      endMin = Math.max(liveEnd, linked ? minutesOf(formatTime(linked.end_time)) : 0, startMin + 30);
    } else {
      endMin = s.closed_at && localDateOf(s.closed_at) === date ? minutesOf(formatClock(s.closed_at)) : LAST_MINUTE;
    }
    blocks.push({
      key: s.id,
      kind: s.status === 'abierta' ? 'en_juego' : 'jugado',
      court: s.court,
      date,
      startMin,
      endMin: Math.min(Math.max(endMin, startMin + 1), LAST_MINUTE),
      headline: linked ? playerLabel(linked.titular_lot, linked.titular_name) : playerLabel(s.titular_lot, s.titular_name),
      detail: s.status === 'abierta' ? `Turno #${s.session_number} en curso` : 'Cancha utilizada',
      sessionId: s.id,
    });
  }
  return blocks.sort((a, b) => a.startMin - b.startMin);
};

export default function ReservationsCalendar({ refreshKey, onEdit, onOpenTurno, onCreate }: ReservationsCalendarProps) {
  const [mode, setMode] = useState<Mode>('dia');
  const [anchor, setAnchor] = useState(todayISO());
  const [court, setCourt] = useState(0);
  const [events, setEvents] = useState<CourtReservation[]>([]);
  const [sessions, setSessions] = useState<CourtSession[]>([]);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const rangeStart = mode === 'dia' ? anchor : startOfWeekISO(anchor);
  const rangeEnd = mode === 'dia' ? anchor : addDaysISO(rangeStart, 6);
  const days = useMemo(
    () => (mode === 'dia' ? [anchor] : Array.from({ length: 7 }, (_, i) => addDaysISO(rangeStart, i))),
    [mode, anchor, rangeStart]
  );

  const load = useCallback(async () => {
    const [eventsRes, sessionsRes] = await Promise.all([
      supabase
        .from('court_reservations')
        .select('*')
        .gte('reservation_date', rangeStart)
        .lte('reservation_date', rangeEnd)
        .in('status', ['reservada', 'abierta', 'cerrada'])
        .order('start_time'),
      supabase
        .from('court_sessions')
        .select('*')
        .in('status', ['abierta', 'cerrada'])
        .gte('opened_at', `${rangeStart}T03:00:00Z`)
        .lt('opened_at', `${addDaysISO(rangeEnd, 1)}T03:00:00Z`),
    ]);
    if (eventsRes.error || sessionsRes.error) {
      setError('No se pudo cargar la agenda.');
      return;
    }
    setError('');
    setEvents((eventsRes.data as CourtReservation[]) || []);
    setSessions((sessionsRes.data as CourtSession[]) || []);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, [load, refreshKey]);

  const blocks = useMemo(() => buildBlocks(events, sessions), [events, sessions]);

  const handleBlock = (b: AgendaBlock) => {
    if (b.reservation) onEdit(b.reservation);
    else if (b.kind === 'en_juego' && b.sessionId) onOpenTurno(b.sessionId);
    else if (b.kind === 'jugado' && b.sessionId) setDetailId(b.sessionId);
  };

  const today = todayISO();
  const columns: AgendaColumn[] =
    mode === 'dia'
      ? COURTS.map((c) => ({ key: `c${c}`, label: courtLabel(c), court: c, date: anchor }))
      : days.map((d) => ({ key: d, label: formatDateShort(d), court, date: d, highlight: d === today }));

  const step = mode === 'dia' ? 1 : 7;
  const createCourt = mode === 'cancha' ? court : 0;
  const createDate = anchor < today ? today : anchor;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="flex flex-wrap gap-2 p-4 border-b border-slate-100">
        {CREATE_BUTTONS.map((btn) => (
          <button
            key={btn.type}
            onClick={() => onCreate(btn.type, createCourt, createDate)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm transition-all hover:-translate-y-0.5 hover:shadow ${EVENT_META[btn.type].button}`}
          >
            <btn.icon size={16} /> {btn.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-slate-100">
        <div className="flex bg-slate-100 rounded-xl p-1">
          {(['dia', 'semana', 'cancha'] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {m === 'dia' ? 'Día' : m === 'semana' ? 'Semana' : 'Por cancha'}
            </button>
          ))}
        </div>

        {mode === 'cancha' && (
          <div className="flex gap-1">
            {COURTS.map((c) => (
              <button
                key={c}
                onClick={() => setCourt(c)}
                className={`w-10 h-10 rounded-lg font-bold text-sm ${
                  court === c ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button onClick={() => setAnchor(addDaysISO(anchor, -step))} className="p-2 rounded-lg hover:bg-slate-100">
            <ChevronLeft size={18} />
          </button>
          <input
            type="date"
            value={anchor}
            onChange={(e) => e.target.value && setAnchor(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-lg text-sm"
          />
          <button onClick={() => setAnchor(addDaysISO(anchor, step))} className="p-2 rounded-lg hover:bg-slate-100">
            <ChevronRight size={18} />
          </button>
          <button onClick={() => setAnchor(todayISO())} className="px-3 py-2 rounded-lg text-sm font-semibold text-sky-700 hover:bg-sky-50">
            Hoy
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3">
        <p className="text-sm font-semibold text-slate-600 capitalize">
          {mode === 'dia'
            ? formatDateLong(anchor)
            : `Semana del ${formatDateShort(rangeStart)} al ${formatDateShort(rangeEnd)}${mode === 'cancha' ? ` · ${courtLabel(court)}` : ''}`}
        </p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(EVENT_META) as (keyof typeof EVENT_META)[]).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
              <span className={`w-2.5 h-2.5 rounded-sm ${EVENT_META[k].chip}`} />
              {EVENT_META[k].label}
            </span>
          ))}
        </div>
      </div>

      {error && <p className="px-4 pt-3 text-sm text-red-600">{error}</p>}

      {mode === 'semana' ? (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
          {days.map((d) => {
            const dayBlocks = blocks.filter((b) => b.date === d);
            return (
              <div
                key={d}
                className={`rounded-xl border p-2 min-h-[120px] ${d === today ? 'border-sky-300 bg-sky-50/40' : 'border-slate-200'}`}
              >
                <button
                  onClick={() => onCreate('reserva', 0, d < today ? today : d)}
                  className="w-full text-left text-xs font-bold uppercase text-slate-500 mb-2 capitalize hover:text-sky-700"
                >
                  {formatDateShort(d)}
                </button>
                <div className="space-y-1.5">
                  {dayBlocks.map((b) => (
                    <button
                      key={b.key}
                      onClick={() => handleBlock(b)}
                      className={`w-full text-left px-2 py-1.5 rounded-lg border-l-4 text-[11px] leading-tight transition-colors ${EVENT_META[b.kind].block}`}
                    >
                      <p className="font-bold flex items-center gap-1">
                        {hhmmOf(b.startMin)}-{hhmmOf(b.endMin)} · C{b.court}
                        {b.kind === 'jugado' && <Lock size={10} className="opacity-60" />}
                      </p>
                      <p className="font-black tracking-wide">{EVENT_META[b.kind].label}</p>
                      <p className="truncate">{b.headline}</p>
                    </button>
                  ))}
                  {dayBlocks.length === 0 && <p className="text-xs text-slate-300">Sin eventos</p>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4">
          <AgendaTimeline
            columns={columns}
            blocks={blocks}
            onBlockClick={handleBlock}
            onEmptyClick={(c, d, time) => onCreate('reserva', c, d, time)}
          />
        </div>
      )}

      {detailId && <TurnoDetailModal sessionId={detailId} onClose={() => setDetailId(null)} />}
    </div>
  );
}
