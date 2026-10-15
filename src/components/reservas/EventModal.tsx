import { useEffect, useState } from 'react';
import { CalendarPlus, GraduationCap, Loader2, PlayCircle, Save, Trophy, Wrench, X, XCircle } from 'lucide-react';
import { supabase, CourtPlayer, CourtReservation } from '../../lib/supabase';
import LotPersonInput from './LotPersonInput';
import {
  COURTS,
  EVENT_META,
  EventType,
  formatTime,
  hhmmOf,
  minutesOf,
  rpcErrorMessage,
  todayISO,
} from './reservasUtils';

interface EventModalProps {
  type: EventType;
  event?: CourtReservation;
  defaultCourt?: number;
  defaultDate?: string;
  defaultTime?: string;
  userName: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenCourt?: (reservation: CourtReservation) => void;
}

const TITLES: Record<EventType, { create: string; edit: string; icon: typeof Trophy }> = {
  reserva: { create: 'Registrar reserva', edit: 'Reserva', icon: CalendarPlus },
  clase: { create: 'Registrar clase', edit: 'Clase', icon: GraduationCap },
  torneo: { create: 'Registrar torneo', edit: 'Torneo', icon: Trophy },
  mantenimiento: { create: 'Registrar mantenimiento', edit: 'Mantenimiento', icon: Wrench },
};

const DEFAULT_DURATION: Record<EventType, number> = { reserva: 90, clase: 60, torneo: 240, mantenimiento: 120 };

const inputClass =
  'w-full px-3 py-2.5 border-2 border-slate-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:bg-slate-50';
const labelClass = 'block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2';

export default function EventModal({
  type,
  event,
  defaultCourt = 0,
  defaultDate,
  defaultTime,
  userName,
  onClose,
  onSaved,
  onOpenCourt,
}: EventModalProps) {
  const isEdit = !!event;
  const multiCourt = type === 'torneo' || type === 'mantenimiento';
  const editable = !isEdit || event!.status === 'reservada';
  const initialStart = event ? formatTime(event.start_time) : defaultTime ?? '18:00';

  const [courts, setCourts] = useState<number[]>([event?.court ?? defaultCourt]);
  const [date, setDate] = useState(event?.reservation_date ?? defaultDate ?? todayISO());
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(
    event ? formatTime(event.end_time) : hhmmOf(minutesOf(initialStart) + DEFAULT_DURATION[type])
  );
  const [titular, setTitular] = useState<CourtPlayer>({
    lot: event?.titular_lot ?? '',
    name: event?.titular_name ?? '',
    socio_id: null,
    is_socio: false,
  });
  const [title, setTitle] = useState(event?.title ?? '');
  const [professor, setProfessor] = useState(event?.professor ?? '');
  const [student, setStudent] = useState(event?.student ?? '');
  const [notes, setNotes] = useState(event?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!event || !multiCourt) return;
    supabase
      .from('court_reservations')
      .select('court')
      .eq('event_group', event.event_group)
      .eq('status', event.status)
      .then(({ data }) => {
        if (data?.length) setCourts(data.map((r) => r.court as number).sort());
      });
  }, [event, multiCourt]);

  const toggleCourt = (c: number) => {
    if (!multiCourt) return setCourts([c]);
    setCourts((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c].sort()));
  };

  const changeStart = (value: string) => {
    if (value && end && minutesOf(end) > minutesOf(start)) {
      setEnd(hhmmOf(minutesOf(value) + minutesOf(end) - minutesOf(start)));
    }
    setStart(value);
  };

  const handleSave = async () => {
    setError('');
    if (!courts.length) return setError('Seleccione al menos una cancha.');
    if (!date || !start || !end) return setError('Complete fecha, hora desde y hora hasta.');
    if (minutesOf(end) <= minutesOf(start)) return setError('La hora "hasta" debe ser posterior a la hora "desde".');
    if (type === 'reserva' && !titular.name.trim()) return setError('Ingrese el nombre del titular.');
    if (type === 'torneo' && !title.trim()) return setError('Ingrese el nombre del torneo.');
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('save_court_event', {
      p_group_id: event?.event_group ?? null,
      p_event_type: type,
      p_courts: courts,
      p_date: date,
      p_start: start,
      p_end: end,
      p_titular_name: type === 'reserva' ? titular.name : '',
      p_titular_lot: type === 'reserva' ? titular.lot : '',
      p_title: multiCourt ? title : '',
      p_professor: type === 'clase' ? professor : '',
      p_student: type === 'clase' ? student : '',
      p_notes: notes,
      p_user: userName,
    });
    setSaving(false);
    if (rpcError) return setError(rpcErrorMessage(rpcError.message));
    onSaved();
  };

  const handleCancelEvent = async () => {
    if (!event || !window.confirm(`¿Cancelar este evento (${EVENT_META[type].label})?`)) return;
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('cancel_court_event', { p_group_id: event.event_group });
    setSaving(false);
    if (rpcError) return setError(rpcErrorMessage(rpcError.message));
    onSaved();
  };

  const meta = EVENT_META[type];
  const Icon = TITLES[type].icon;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${meta.chip}`}>
              <Icon size={20} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">{isEdit ? TITLES[type].edit : TITLES[type].create}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-500">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className={labelClass.replace(' mb-2', '')}>{multiCourt ? 'Canchas' : 'Cancha'}</label>
              {multiCourt && editable && (
                <button
                  type="button"
                  onClick={() => setCourts(courts.length === COURTS.length ? [] : [...COURTS])}
                  className="text-xs font-semibold text-sky-700 hover:underline"
                >
                  {courts.length === COURTS.length ? 'Quitar todas' : 'Todas las canchas'}
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2">
              {COURTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!editable}
                  onClick={() => toggleCourt(c)}
                  className={`py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${
                    courts.includes(c)
                      ? `${meta.chip} border-transparent shadow`
                      : 'bg-white border-slate-200 text-slate-700 hover:border-slate-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelClass}>Fecha</label>
              <input type="date" value={date} disabled={!editable} onChange={(e) => setDate(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Desde</label>
              <input type="time" step={300} value={start} disabled={!editable} onChange={(e) => changeStart(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Hasta</label>
              <input type="time" step={300} value={end} disabled={!editable} onChange={(e) => setEnd(e.target.value)} className={inputClass} />
            </div>
          </div>

          {type === 'reserva' && <LotPersonInput label="Titular" value={titular} onChange={setTitular} highlight />}

          {type === 'clase' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Profesor (opcional)</label>
                <input value={professor} disabled={!editable} onChange={(e) => setProfessor(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Alumno o grupo (opcional)</label>
                <input value={student} disabled={!editable} onChange={(e) => setStudent(e.target.value)} className={inputClass} />
              </div>
            </div>
          )}

          {multiCourt && (
            <div>
              <label className={labelClass}>{type === 'torneo' ? 'Nombre del torneo' : 'Motivo'}</label>
              <input
                value={title}
                disabled={!editable}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={type === 'torneo' ? 'Ej: Torneo Villanueva' : 'Ej: Cambio de red'}
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Observaciones (opcional)</label>
            <textarea value={notes} disabled={!editable} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputClass} resize-none`} />
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm font-medium">{error}</div>}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 space-y-2">
          {isEdit && editable && type === 'reserva' && onOpenCourt && (
            <button
              onClick={() => onOpenCourt(event!)}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-lg transition-colors"
            >
              <PlayCircle size={20} /> ABRIR CANCHA
            </button>
          )}
          {editable ? (
            <div className="flex gap-2">
              {isEdit && (
                <button
                  onClick={handleCancelEvent}
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-red-200 text-red-600 hover:bg-red-50 font-semibold transition-colors"
                >
                  <XCircle size={18} /> Cancelar {type === 'mantenimiento' ? 'bloqueo' : type}
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl disabled:bg-slate-300 font-semibold transition-colors ${meta.button}`}
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                {isEdit ? 'Guardar cambios' : 'Guardar'}
              </button>
            </div>
          ) : (
            <p className="text-center text-sm text-slate-500">Este evento está {event!.status} y no puede modificarse.</p>
          )}
        </div>
      </div>
    </div>
  );
}
