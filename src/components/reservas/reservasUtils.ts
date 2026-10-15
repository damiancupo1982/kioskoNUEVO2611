const TZ = 'America/Argentina/Buenos_Aires';

export const COURTS = [0, 1, 2, 3];

export const courtLabel = (court: number) => `Cancha ${court}`;

export const todayISO = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());

export const nowTimeHHMM = () =>
  new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

export const addDaysISO = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const startOfWeekISO = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const offset = (d.getUTCDay() + 6) % 7;
  return addDaysISO(iso, -offset);
};

export const formatDateLong = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

export const formatDateShort = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('es-AR', {
    timeZone: 'UTC',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });

export const formatTime = (time: string) => time.slice(0, 5);

export const formatClock = (ts: string) =>
  new Date(ts).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });

export const formatDateTime = (ts: string) =>
  new Date(ts).toLocaleDateString('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });

export const formatDuration = (fromTs: string, toTs?: string | null) => {
  const ms = Math.max(0, (toTs ? new Date(toTs).getTime() : Date.now()) - new Date(fromTs).getTime());
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, '0')} min` : `${m} min`;
};

export const money = (n: number) =>
  `$${Number(n).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const isGuestProduct = (name: string) => /^invitado.*sin carnet/i.test(name.trim());

export const minutesOf = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export const hhmmOf = (minutes: number) => {
  const m = Math.max(0, Math.min(minutes, 23 * 60 + 59));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export const localDateOf = (ts: string) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts));

export type EventType = 'reserva' | 'clase' | 'torneo' | 'mantenimiento';

export const EVENT_TYPES: EventType[] = ['reserva', 'clase', 'torneo', 'mantenimiento'];

export const EVENT_META: Record<
  EventType | 'en_juego' | 'jugado',
  { label: string; block: string; chip: string; button: string }
> = {
  reserva: {
    label: 'RESERVA',
    block: 'bg-sky-100 border-sky-500 text-sky-900 hover:bg-sky-200',
    chip: 'bg-sky-600 text-white',
    button: 'bg-sky-600 hover:bg-sky-700 text-white',
  },
  clase: {
    label: 'CLASE',
    block: 'bg-emerald-100 border-emerald-500 text-emerald-900 hover:bg-emerald-200',
    chip: 'bg-emerald-600 text-white',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  torneo: {
    label: 'TORNEO',
    block: 'bg-rose-100 border-rose-500 text-rose-900 hover:bg-rose-200',
    chip: 'bg-rose-600 text-white',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  mantenimiento: {
    label: 'MANTENIMIENTO',
    block: 'bg-slate-700 border-slate-900 text-white hover:bg-slate-800',
    chip: 'bg-slate-800 text-white',
    button: 'bg-slate-800 hover:bg-slate-900 text-white',
  },
  en_juego: {
    label: 'EN JUEGO',
    block: 'bg-amber-100 border-amber-500 text-amber-900 hover:bg-amber-200',
    chip: 'bg-amber-500 text-white',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
  },
  jugado: {
    label: 'TURNO JUGADO',
    block: 'bg-stone-100 border-stone-400 text-stone-700 hover:bg-stone-200',
    chip: 'bg-stone-500 text-white',
    button: 'bg-stone-500 text-white',
  },
};

export const eventSummary = (r: {
  event_type: EventType;
  titular_lot: string;
  titular_name: string;
  title: string;
  professor: string;
  student: string;
}) => {
  if (r.event_type === 'reserva') return `${r.titular_lot ? `Lote ${r.titular_lot} - ` : ''}${r.titular_name}`;
  if (r.event_type === 'clase')
    return [r.professor && `Profesor: ${r.professor}`, r.student].filter(Boolean).join(' · ');
  return r.title;
};

export const RPC_ERRORS: Record<string, string> = {
  invalid_event: 'Tipo de evento inválido.',
  invalid_courts: 'Seleccione una cancha válida.',
  invalid_time: 'La hora de fin debe ser posterior a la hora de inicio.',
  title_required: 'Ingrese el nombre del torneo.',
  event_not_editable: 'Este evento ya no puede modificarse (fue abierto, cerrado o cancelado).',
  court_already_open: 'Esta cancha ya tiene un turno abierto.',
  reservation_not_available: 'La reserva ya no está disponible (fue abierta o cancelada).',
  titular_required: 'Debe indicar el nombre del titular.',
  invalid_players: 'Debe cargar entre 1 y 4 jugadores.',
  session_not_open: 'Este turno ya fue cerrado.',
  session_has_items: 'El turno tiene consumos: debe cobrarse.',
  invalid_guest_charge: 'Cantidad o precio de invitado inválido.',
};

export const rpcErrorMessage = (message: string | undefined) => {
  const busy = message?.match(/court_busy:(\d{2}:\d{2})-(\d{2}:\d{2})/);
  if (busy) return `Esta cancha ya se encuentra ocupada entre las ${busy[1]} y las ${busy[2]}.`;
  const key = Object.keys(RPC_ERRORS).find((k) => message?.includes(k));
  return key ? RPC_ERRORS[key] : `Ocurrió un error: ${message ?? 'desconocido'}`;
};
